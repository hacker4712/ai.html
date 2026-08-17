require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const { OpenAI } = require('openai');

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json());

// Serve static files from 'public' folder
app.use(express.static('public'));

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// 1. Ask AI
app.post('/api/ask', async (req, res) => {
  const { question, mode } = req.body;
  let systemPrompt = 'You are a helpful assistant. Provide a concise answer. Avoid lengthy context.';
  if (mode === 'detailed') {
    systemPrompt = 'You are a helpful assistant. Provide a comprehensive, well-reasoned answer with context, evidence, and sources. If you are unsure, clearly state that you are unsure.';
  }
  try {
    const completion = await openai.chat.completions.create({
      messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: question }],
      model: 'gpt-3.5-turbo',
      temperature: 0.7,
    });
    res.json({ answer: completion.choices[0].message.content });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 2. Analyze answer – find hallucinations
app.post('/api/analyze', async (req, res) => {
  const { question, answer } = req.body;
  const prompt = `Analyze the following answer to the question "${question}" for factual accuracy and potential hallucinations.
  Break it down into individual claims. For each claim, classify it as "supported" (factually correct), "context" (needs more context or is partially true), or "unsupported" (hallucination / false).
  Provide a brief explanation for each classification.
  Return the result strictly as a JSON object with a "claims" array.
  Example: { "claims": [ { "text": "The sky is blue.", "status": "supported", "explain": "This is true due to Rayleigh scattering." } ] }
  Answer: "${answer}"`;

  try {
    const completion = await openai.chat.completions.create({
      messages: [{ role: 'user', content: prompt }],
      model: 'gpt-3.5-turbo',
      temperature: 0.3,
      response_format: { type: 'json_object' }
    });
    const result = JSON.parse(completion.choices[0].message.content);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 3. Generate a hallucination challenge
app.post('/api/challenge', async (req, res) => {
  const prompt = `Generate a tricky multiple-choice question about a common AI hallucination or misconception.
  The AI has provided a confident but incorrect answer. Provide the question, the AI's wrong answer, the correct answer, and an explanation.
  Return strictly as JSON: { "question": "...", "ai_answer": "...", "correct_answer": "...", "explanation": "..." }`;

  try {
    const completion = await openai.chat.completions.create({
      messages: [{ role: 'user', content: prompt }],
      model: 'gpt-3.5-turbo',
      temperature: 0.8,
      response_format: { type: 'json_object' }
    });
    const result = JSON.parse(completion.choices[0].message.content);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Serve index.html for any other routes (SPA fallback)
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
