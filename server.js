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

// Serve static files from public folder
app.use(express.static('public'));

// ─── YOUR API KEY IS HERE ───
// For Render: Set this in Environment Variables
// For testing: You can hardcode it here (but don't commit to GitHub!)
const API_KEY = process.env.OPENAI_API_KEY || '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';

if (!API_KEY) {
    console.error('❌ OPENAI_API_KEY is missing!');
} else {
    console.log('✅ OPENAI_API_KEY is set');
}

const openai = new OpenAI({ 
    apiKey: API_KEY 
});

// ─── HEALTH CHECK ───
app.get('/api/health', (req, res) => {
    res.json({ 
        status: 'ok', 
        message: 'Server is running',
        timestamp: new Date().toISOString(),
        apiKeySet: !!API_KEY
    });
});

// ─── ASK AI ───
app.post('/api/ask', async (req, res) => {
    const { question, mode } = req.body;
    
    if (!question) {
        return res.status(400).json({ error: 'Question is required' });
    }

    if (!API_KEY) {
        return res.status(500).json({ error: 'OpenAI API key is not configured' });
    }

    let systemPrompt = 'You are a helpful assistant. Provide a concise answer. Avoid lengthy context.';
    if (mode === 'detailed') {
        systemPrompt = 'You are a helpful assistant. Provide a comprehensive, well-reasoned answer with context, evidence, and sources. If you are unsure, clearly state that you are unsure.';
    }

    try {
        const completion = await openai.chat.completions.create({
            messages: [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: question }
            ],
            model: 'gpt-3.5-turbo',
            temperature: 0.7,
            max_tokens: 500,
        });
        res.json({ answer: completion.choices[0].message.content });
    } catch (error) {
        console.error('Error in /api/ask:', error);
        res.status(500).json({ error: error.message || 'Failed to get answer' });
    }
});

// ─── ANALYZE ANSWER ───
app.post('/api/analyze', async (req, res) => {
    const { question, answer } = req.body;

    if (!question || !answer) {
        return res.status(400).json({ error: 'Question and answer are required' });
    }

    if (!API_KEY) {
        return res.status(500).json({ error: 'OpenAI API key is not configured' });
    }

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
            max_tokens: 800,
            response_format: { type: 'json_object' }
        });
        const result = JSON.parse(completion.choices[0].message.content);
        res.json(result);
    } catch (error) {
        console.error('Error in /api/analyze:', error);
        res.status(500).json({ error: error.message || 'Failed to analyze answer' });
    }
});

// ─── GENERATE CHALLENGE ───
app.post('/api/challenge', async (req, res) => {
    if (!API_KEY) {
        return res.status(500).json({ error: 'OpenAI API key is not configured' });
    }

    const prompt = `Generate a tricky multiple-choice question about a common AI hallucination or misconception.
    The AI has provided a confident but incorrect answer. Provide the question, the AI's wrong answer, the correct answer, and an explanation.
    Return strictly as JSON: { "question": "...", "ai_answer": "...", "correct_answer": "...", "explanation": "..." }`;

    try {
        const completion = await openai.chat.completions.create({
            messages: [{ role: 'user', content: prompt }],
            model: 'gpt-3.5-turbo',
            temperature: 0.8,
            max_tokens: 600,
            response_format: { type: 'json_object' }
        });
        const result = JSON.parse(completion.choices[0].message.content);
        res.json(result);
    } catch (error) {
        console.error('Error in /api/challenge:', error);
        res.status(500).json({ error: error.message || 'Failed to generate challenge' });
    }
});

// ─── SERVE INDEX.HTML ───
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ─── START SERVER ───
app.listen(PORT, () => {
    console.log(`✅ Server running on port ${PORT}`);
    console.log(`✅ Serving files from: ${path.join(__dirname, 'public')}`);
    console.log(`✅ API Key: ${API_KEY ? '✓ Set' : '✗ Missing'}`);
});
