require('dotenv').config();
const express = require('express');
const cors = require('cors');
const Groq = require('groq-sdk');
const axios = require('axios');

const path = require('path');

const app = express();
const PORT = 5000;

app.use(cors({ origin: '*' }));
app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'public')));

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

// ─── AssemblyAI Token ────────────────────────────────────────────────────────
app.get('/api/assemblyai-token', async (req, res) => {
  try {
    const response = await axios.post(
      'https://api.assemblyai.com/v2/realtime/token',
      { expires_in: 3600 },
      { headers: { authorization: process.env.ASSEMBLYAI_API_KEY } }
    );
    res.json({ token: response.data.token });
  } catch (err) {
    console.error('AssemblyAI token error:', err.message);
    res.status(500).json({ error: 'Token fetch failed' });
  }
});

// ─── Live Notes (every 30 seconds) ──────────────────────────────────────────
app.post('/api/live-notes', async (req, res) => {
  const { transcript } = req.body;

  if (!transcript || transcript.trim().length < 20) {
    return res.json({ keyPoints: [], actionItems: [] });
  }

  try {
    const response = await groq.chat.completions.create({
      model: 'llama-3.1-8b-instant', // Ultra fast for real-time notes
      max_tokens: 600,
      temperature: 0.3,
      messages: [
        {
          role: 'system',
          content: 'You are a meeting assistant. Extract key points and action items from transcripts. Always respond with valid JSON only.'
        },
        {
          role: 'user',
          content: `Extract from this meeting transcript snippet.
Return ONLY valid JSON, nothing else.

Transcript:
"${transcript}"

JSON format:
{
  "keyPoints": ["point 1", "point 2"],
  "actionItems": [
    { "task": "task description", "owner": "person name or TBD" }
  ]
}

Rules:
- Max 4 key points
- Max 5 action items
- Only extract what is clearly mentioned
- Be concise`
        }
      ]
    });

    const text = response.choices[0].message.content.trim();
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return res.json({ keyPoints: [], actionItems: [] });

    const result = JSON.parse(jsonMatch[0]);
    res.json(result);

  } catch (err) {
    console.error('Live notes error:', err.message);
    res.json({ keyPoints: [], actionItems: [] });
  }
});

// ─── Final Summary ───────────────────────────────────────────────────────────
app.post('/api/final-summary', async (req, res) => {
  const { transcript, title } = req.body;

  if (!transcript || transcript.trim().length < 50) {
    return res.status(400).json({ error: 'Transcript too short' });
  }

  try {
    const response = await groq.chat.completions.create({
      model: 'llama-3.3-70b-versatile', // More powerful for final summary
      max_tokens: 2000,
      temperature: 0.4,
      messages: [
        {
          role: 'system',
          content: 'You are a professional meeting summarizer. Always respond with valid JSON only, no extra text.'
        },
        {
          role: 'user',
          content: `Create a comprehensive summary of this meeting.
Return ONLY valid JSON, nothing else.

Meeting Title: "${title || 'Meeting'}"
Transcript:
"${transcript}"

Return this exact JSON structure:
{
  "executiveSummary": "2-3 sentence overview of the meeting",
  "keyDecisions": ["decision 1", "decision 2"],
  "actionItems": [
    { "task": "what needs to be done", "owner": "who is responsible", "deadline": "deadline if mentioned or null" }
  ],
  "followUpEmail": "Professional email ready to send to attendees summarizing the meeting, decisions, and next steps",
  "nextSteps": ["step 1", "step 2"]
}`
        }
      ]
    });

    const text = response.choices[0].message.content.trim();
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('No JSON in response');

    const summary = JSON.parse(jsonMatch[0]);
    res.json(summary);

  } catch (err) {
    console.error('Final summary error:', err.message);
    res.status(500).json({ error: 'Summary generation failed' });
  }
});

// ─── Health Check ────────────────────────────────────────────────────────────
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    assemblyai: !!process.env.ASSEMBLYAI_API_KEY,
    groq: !!process.env.GROQ_API_KEY
  });
});

app.listen(PORT, () => {
  console.log(`\n MeetingMind Backend running on http://localhost:${PORT}`);
  console.log(` AssemblyAI Key: ${process.env.ASSEMBLYAI_API_KEY ? '✓ Set' : '✗ Missing'}`);
  console.log(` Groq Key:       ${process.env.GROQ_API_KEY ? '✓ Set' : '✗ Missing'}\n`);
});
