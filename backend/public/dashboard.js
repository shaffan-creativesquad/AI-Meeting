// MeetingMind AI - Dashboard JS

// ── Navigation ──────────────────────────────────────────────────────────────
function showPage(name) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  document.getElementById('page-' + name).classList.add('active');
  document.querySelector('[data-page="' + name + '"]').classList.add('active');
  if (name === 'meetings') renderMeetings('all-meetings', getMeetings());
}

// ── Storage ──────────────────────────────────────────────────────────────────
function getMeetings() {
  return JSON.parse(localStorage.getItem('mm_meetings') || '[]');
}

// ── Render ───────────────────────────────────────────────────────────────────
function renderMeetings(containerId, meetings) {
  const container = document.getElementById(containerId);
  if (!container) return;

  if (meetings.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">🎙</div>
        <div class="empty-title">No meetings yet</div>
        <div class="empty-sub">Join a Google Meet, Zoom, or Teams call and start recording!</div>
      </div>`;
    return;
  }

  container.innerHTML = meetings.map((m, i) => `
    <div class="meeting-card" data-index="${i}">
      <div class="meeting-top">
        <div>
          <div class="meeting-title">${m.title || 'Untitled Meeting'}</div>
          <div class="meeting-date">${new Date(m.date).toLocaleString()}</div>
        </div>
        <span class="meeting-duration">${m.duration || '—'}</span>
      </div>
      <div class="meeting-summary">${m.executiveSummary || 'No summary available'}</div>
      <div class="meeting-tags">
        <span class="tag">📋 ${(m.actionItems || []).length} actions</span>
        <span class="tag">🎯 ${(m.keyDecisions || []).length} decisions</span>
        ${(m.actionItems || []).length > 0 ? '<span class="tag tag-action">✓ Has action items</span>' : ''}
      </div>
    </div>
  `).join('');

  // Attach click events after rendering
  container.querySelectorAll('.meeting-card').forEach(card => {
    card.addEventListener('click', () => openModal(parseInt(card.dataset.index)));
  });
}

// ── Stats ─────────────────────────────────────────────────────────────────────
function updateStats() {
  const meetings = getMeetings();
  const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const weekMeetings = meetings.filter(m => new Date(m.date).getTime() > weekAgo);
  const totalActions = meetings.reduce((sum, m) => sum + (m.actionItems || []).length, 0);

  document.getElementById('stat-total').textContent = meetings.length;
  document.getElementById('stat-week').textContent = weekMeetings.length;
  document.getElementById('stat-actions').textContent = totalActions;
  document.getElementById('stat-time').textContent = Math.round(meetings.length * 0.5) + 'h';
}

// ── Modal ─────────────────────────────────────────────────────────────────────
let currentMeeting = null;

function openModal(index) {
  const meetings = getMeetings();
  currentMeeting = meetings[index];
  const m = currentMeeting;

  document.getElementById('modal-title').textContent = m.title || 'Untitled Meeting';
  document.getElementById('modal-date').textContent = new Date(m.date).toLocaleString();
  document.getElementById('modal-summary').textContent = m.executiveSummary || '—';
  document.getElementById('modal-decisions').innerHTML =
    (m.keyDecisions || []).map(d => `<li>• ${d}</li>`).join('') || '<li>None recorded</li>';
  document.getElementById('modal-actions').innerHTML =
    (m.actionItems || []).map(a => `<li>☐ <strong>${a.owner || 'TBD'}</strong> → ${a.task}</li>`).join('') || '<li>None recorded</li>';
  document.getElementById('modal-email').textContent = m.followUpEmail || '—';

  document.getElementById('modal').classList.add('open');
}

function closeModal() {
  document.getElementById('modal').classList.remove('open');
}

function copyEmail() {
  if (currentMeeting && currentMeeting.followUpEmail) {
    navigator.clipboard.writeText(currentMeeting.followUpEmail);
    showToast('Email copied!');
  }
}

// ── Toast ─────────────────────────────────────────────────────────────────────
function showToast(msg) {
  const toast = document.getElementById('toast');
  toast.textContent = msg;
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 2500);
}

// ── Settings ──────────────────────────────────────────────────────────────────
function saveKeys() {
  showToast('Keys saved!');
}

function clearData() {
  if (confirm('Delete all meeting history?')) {
    localStorage.removeItem('mm_meetings');
    init();
    showToast('Data cleared');
  }
}

// ── Backend Status ────────────────────────────────────────────────────────────
async function checkBackend() {
  try {
    const res = await fetch('http://localhost:5000/health');
    await res.json();
    document.getElementById('backend-dot').className = 'dot-green';
    document.getElementById('backend-text').textContent = 'Online';
  } catch {
    document.getElementById('backend-dot').className = 'dot-red';
    document.getElementById('backend-text').textContent = 'Offline';
  }
}

// ── Event Listeners ───────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  // Nav links
  document.querySelectorAll('.nav-item').forEach(item => {
    item.addEventListener('click', () => showPage(item.dataset.page));
  });

  // Modal close
  document.getElementById('modal').addEventListener('click', (e) => {
    if (e.target === e.currentTarget) closeModal();
  });
  document.getElementById('modal-close').addEventListener('click', closeModal);
  document.getElementById('copy-email-btn').addEventListener('click', copyEmail);

  // Settings
  document.getElementById('save-keys-btn').addEventListener('click', saveKeys);
  document.getElementById('clear-data-btn').addEventListener('click', clearData);

  // Storage changes from extension
  window.addEventListener('storage', (e) => {
    if (e.key === 'mm_meetings') init();
  });

  init();
  checkBackend();
  setInterval(checkBackend, 10000);
});

// ── Init ──────────────────────────────────────────────────────────────────────
function init() {
  updateStats();
  renderMeetings('home-meetings', getMeetings().slice(0, 5));
}
