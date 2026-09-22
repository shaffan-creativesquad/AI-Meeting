// MeetingMind AI - Content Script
// Injects floating popup on meeting pages

let isRecording = false;
let mediaRecorder = null;
let audioStream = null;
let transcriptBuffer = '';
let fullTranscript = '';
let lastNoteUpdate = 0;
let timerInterval = null;
let secondsElapsed = 0;
let ws = null;

const BACKEND_URL = 'http://localhost:5000';

// ─── Inject Popup ───────────────────────────────────────────────────────────

function injectPopup() {
  if (document.getElementById('mm-root')) return;

  const root = document.createElement('div');
  root.id = 'mm-root';
  root.innerHTML = `
    <div id="mm-popup" class="mm-popup">
      <!-- Header -->
      <div class="mm-header" id="mm-drag-handle">
        <div class="mm-logo">
          <span class="mm-dot"></span>
          <span class="mm-title">MeetingMind AI</span>
        </div>
        <div class="mm-header-actions">
          <span id="mm-timer" class="mm-timer">00:00</span>
          <button id="mm-minimize-btn" class="mm-icon-btn" title="Minimize">─</button>
          <button id="mm-close-btn" class="mm-icon-btn" title="Close">✕</button>
        </div>
      </div>

      <!-- Body -->
      <div id="mm-body" class="mm-body">

        <!-- Status Bar -->
        <div id="mm-status" class="mm-status mm-status-idle">
          Click "Start Recording" to begin
        </div>

        <!-- Live Transcript -->
        <div class="mm-section">
          <div class="mm-section-header">
            <span>🎙 Live Transcript</span>
            <span id="mm-live-badge" class="mm-badge mm-badge-off">OFF</span>
          </div>
          <div id="mm-transcript" class="mm-transcript-box">
            Transcript will appear here...
          </div>
        </div>

        <!-- Key Points -->
        <div class="mm-section">
          <div class="mm-section-header">
            <span>💡 Key Points</span>
          </div>
          <ul id="mm-keypoints" class="mm-list">
            <li class="mm-placeholder">Key points will appear as you talk...</li>
          </ul>
        </div>

        <!-- Action Items -->
        <div class="mm-section">
          <div class="mm-section-header">
            <span>✅ Action Items</span>
            <span id="mm-action-count" class="mm-count">0</span>
          </div>
          <ul id="mm-actions" class="mm-list">
            <li class="mm-placeholder">Action items will be extracted...</li>
          </ul>
        </div>

      </div>

      <!-- Footer -->
      <div class="mm-footer">
        <button id="mm-start-btn" class="mm-btn mm-btn-primary">
          ● Start Recording
        </button>
        <button id="mm-end-btn" class="mm-btn mm-btn-danger" style="display:none">
          ■ End & Summarize
        </button>
      </div>
    </div>
  `;

  document.body.appendChild(root);

  setupDrag();
  setupEvents();
}

// ─── Event Handlers ──────────────────────────────────────────────────────────

function setupEvents() {
  document.getElementById('mm-start-btn').addEventListener('click', startRecording);
  document.getElementById('mm-end-btn').addEventListener('click', endMeeting);
  document.getElementById('mm-minimize-btn').addEventListener('click', toggleMinimize);
  document.getElementById('mm-close-btn').addEventListener('click', () => {
    document.getElementById('mm-root').remove();
  });
}

// ─── Recording ───────────────────────────────────────────────────────────────

async function startRecording() {
  try {
    setStatus('Requesting microphone...', 'loading');

    audioStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        sampleRate: 16000,
        channelCount: 1
      }
    });

    // Get AssemblyAI token from backend
    const tokenRes = await fetch(`${BACKEND_URL}/api/assemblyai-token`);
    const { token } = await tokenRes.json();

    // Connect AssemblyAI real-time WebSocket
    ws = new WebSocket(
      `wss://api.assemblyai.com/v2/realtime/ws?sample_rate=16000`,
      ['Token', token]
    );

    ws.onopen = () => {
      setStatus('Recording in progress...', 'recording');
      startMediaRecorder();
      startTimer();
      toggleButtons(true);
      setBadge('ON', true);
    };

    ws.onmessage = (event) => {
      const data = JSON.parse(event.data);
      if (data.message_type === 'FinalTranscript' && data.text) {
        appendTranscript(data.text);
        transcriptBuffer += data.text + ' ';
        fullTranscript += data.text + ' ';

        // Update notes every 30 seconds
        const now = Date.now();
        if (now - lastNoteUpdate > 30000) {
          lastNoteUpdate = now;
          fetchLiveNotes(transcriptBuffer);
          transcriptBuffer = '';
        }
      }

      if (data.message_type === 'PartialTranscript' && data.text) {
        showPartialTranscript(data.text);
      }
    };

    ws.onerror = () => setStatus('Connection error. Check your API key.', 'error');
    ws.onclose = () => {
      if (isRecording) setStatus('Disconnected. Reconnecting...', 'error');
    };

  } catch (err) {
    if (err.name === 'NotAllowedError') {
      setStatus('Microphone permission denied!', 'error');
    } else {
      setStatus('Error: ' + err.message, 'error');
    }
  }
}

function startMediaRecorder() {
  isRecording = true;
  mediaRecorder = new MediaRecorder(audioStream, {
    mimeType: 'audio/webm;codecs=opus'
  });

  mediaRecorder.ondataavailable = async (event) => {
    if (event.data.size > 0 && ws && ws.readyState === WebSocket.OPEN) {
      const reader = new FileReader();
      reader.onload = () => {
        const base64 = reader.result.split(',')[1];
        ws.send(JSON.stringify({ audio_data: base64 }));
      };
      reader.readAsDataURL(event.data);
    }
  };

  mediaRecorder.start(250); // chunk every 250ms
}

function stopRecording() {
  isRecording = false;
  if (mediaRecorder && mediaRecorder.state !== 'inactive') {
    mediaRecorder.stop();
  }
  if (audioStream) {
    audioStream.getTracks().forEach(t => t.stop());
  }
  if (ws) {
    ws.close();
  }
  clearInterval(timerInterval);
}

// ─── End Meeting ─────────────────────────────────────────────────────────────

async function endMeeting() {
  stopRecording();
  setStatus('Generating full summary...', 'loading');
  toggleButtons(false);
  setBadge('OFF', false);

  try {
    const res = await fetch(`${BACKEND_URL}/api/final-summary`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        transcript: fullTranscript,
        title: document.title || 'Meeting'
      })
    });

    const summary = await res.json();
    showFinalSummary(summary);
    setStatus('Summary ready!', 'done');

  } catch (err) {
    setStatus('Summary failed. Check backend.', 'error');
  }
}

// ─── Live Notes ──────────────────────────────────────────────────────────────

async function fetchLiveNotes(transcript) {
  if (!transcript.trim()) return;

  try {
    const res = await fetch(`${BACKEND_URL}/api/live-notes`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ transcript })
    });

    const { keyPoints, actionItems } = await res.json();
    updateKeyPoints(keyPoints);
    updateActionItems(actionItems);

  } catch (err) {
    console.error('Live notes error:', err);
  }
}

// ─── UI Updates ──────────────────────────────────────────────────────────────

function appendTranscript(text) {
  const box = document.getElementById('mm-transcript');
  box.innerHTML += `<span class="mm-transcript-line">${text}</span> `;
  box.scrollTop = box.scrollHeight;
}

function showPartialTranscript(text) {
  const box = document.getElementById('mm-transcript');
  const partial = box.querySelector('.mm-partial');
  if (partial) {
    partial.textContent = text + '...';
  } else {
    const span = document.createElement('span');
    span.className = 'mm-partial';
    span.textContent = text + '...';
    box.appendChild(span);
  }
}

function updateKeyPoints(points) {
  const list = document.getElementById('mm-keypoints');
  if (!points || points.length === 0) return;
  list.innerHTML = points.map(p => `<li class="mm-list-item">• ${p}</li>`).join('');
}

function updateActionItems(items) {
  const list = document.getElementById('mm-actions');
  const count = document.getElementById('mm-action-count');
  if (!items || items.length === 0) return;

  list.innerHTML = items.map(item => `
    <li class="mm-action-item">
      <span class="mm-checkbox">☐</span>
      <span class="mm-action-text">
        <strong>${item.owner || 'TBD'}</strong> → ${item.task}
      </span>
    </li>
  `).join('');

  count.textContent = items.length;
}

function showFinalSummary(summary) {
  const body = document.getElementById('mm-body');
  body.innerHTML = `
    <div class="mm-summary">
      <h3 class="mm-summary-title">Meeting Summary</h3>

      <div class="mm-summary-section">
        <strong>Executive Summary</strong>
        <p>${summary.executiveSummary || ''}</p>
      </div>

      <div class="mm-summary-section">
        <strong>Key Decisions</strong>
        <ul>
          ${(summary.keyDecisions || []).map(d => `<li>• ${d}</li>`).join('')}
        </ul>
      </div>

      <div class="mm-summary-section">
        <strong>Action Items</strong>
        <ul>
          ${(summary.actionItems || []).map(a =>
            `<li>☐ <b>${a.owner || 'TBD'}</b> → ${a.task}</li>`
          ).join('')}
        </ul>
      </div>

      <div class="mm-summary-section">
        <strong>Follow-up Email</strong>
        <div class="mm-email-box">${summary.followUpEmail || ''}</div>
      </div>

      <button id="mm-copy-summary-btn"
        class="mm-btn mm-btn-primary" style="width:100%;margin-top:10px">
        📋 Copy Summary
      </button>
    </div>
  `;

  // Attach event listener after innerHTML is set (no inline onclick = CSP safe)
  document.getElementById('mm-copy-summary-btn').addEventListener('click', () => {
    navigator.clipboard.writeText(
      JSON.stringify(summary, null, 2)
    ).then(() => {
      const btn = document.getElementById('mm-copy-summary-btn');
      if (btn) { btn.textContent = '✓ Copied!'; setTimeout(() => { btn.textContent = '📋 Copy Summary'; }, 2000); }
    });
  });
}

// ─── Timer ───────────────────────────────────────────────────────────────────

function startTimer() {
  secondsElapsed = 0;
  timerInterval = setInterval(() => {
    secondsElapsed++;
    const m = String(Math.floor(secondsElapsed / 60)).padStart(2, '0');
    const s = String(secondsElapsed % 60).padStart(2, '0');
    document.getElementById('mm-timer').textContent = `${m}:${s}`;
  }, 1000);
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function setStatus(msg, type) {
  const el = document.getElementById('mm-status');
  el.textContent = msg;
  el.className = `mm-status mm-status-${type}`;
}

function setBadge(text, active) {
  const badge = document.getElementById('mm-live-badge');
  badge.textContent = text;
  badge.className = `mm-badge ${active ? 'mm-badge-on' : 'mm-badge-off'}`;
}

function toggleButtons(recording) {
  document.getElementById('mm-start-btn').style.display = recording ? 'none' : 'block';
  document.getElementById('mm-end-btn').style.display = recording ? 'block' : 'none';
}

function toggleMinimize() {
  const body = document.getElementById('mm-body');
  const footer = document.querySelector('.mm-footer');
  const popup = document.getElementById('mm-popup');
  const btn = document.getElementById('mm-minimize-btn');

  const isMinimized = body.style.display === 'none';
  body.style.display = isMinimized ? 'block' : 'none';
  footer.style.display = isMinimized ? 'flex' : 'none';
  popup.style.height = isMinimized ? 'auto' : '48px';
  btn.textContent = isMinimized ? '─' : '□';
}

// ─── Drag & Drop ─────────────────────────────────────────────────────────────

function setupDrag() {
  const popup = document.getElementById('mm-popup');
  const handle = document.getElementById('mm-drag-handle');
  let isDragging = false;
  let startX, startY, startLeft, startTop;

  handle.addEventListener('mousedown', (e) => {
    isDragging = true;
    startX = e.clientX;
    startY = e.clientY;
    const rect = popup.getBoundingClientRect();
    startLeft = rect.left;
    startTop = rect.top;
    popup.style.transition = 'none';
  });

  document.addEventListener('mousemove', (e) => {
    if (!isDragging) return;
    const dx = e.clientX - startX;
    const dy = e.clientY - startY;
    popup.style.left = (startLeft + dx) + 'px';
    popup.style.top = (startTop + dy) + 'px';
    popup.style.right = 'auto';
  });

  document.addEventListener('mouseup', () => {
    isDragging = false;
  });
}

// ─── Init ────────────────────────────────────────────────────────────────────

function init() {
  // Inject after page loads
  if (document.readyState === 'complete') {
    setTimeout(injectPopup, 2000);
  } else {
    window.addEventListener('load', () => setTimeout(injectPopup, 2000));
  }
}

init();
