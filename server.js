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
app.use(express.static('public'));

// ─── YOUR NVIDIA NIM API KEY ───
// Get from: https://build.nvidia.com
// Key format: nvapi-...
const HARDCODED_KEY = 'YOUR_NVIDIA_NIM_API_KEY_HERE'; // ← Replace this!
const API_KEY = process.env.NVIDIA_API_KEY || HARDCODED_KEY;

if (!API_KEY || !API_KEY.startsWith('nvapi-')) {
    console.error('❌ Invalid NVIDIA NIM API key! Keys must start with "nvapi-..."');
    console.error('   Get a valid key from: https://build.nvidia.com');
} else {
    console.log('✅ NVIDIA NIM API Key is configured');
}

// Initialize OpenAI client with NVIDIA NIM endpoint
const client = new OpenAI({
    baseURL: 'https://integrate.api.nvidia.com/v1',
    apiKey: API_KEY,
    defaultHeaders: {
        'Content-Type': 'application/json'
    }
});

// ─── NVIDIA NIM FREE MODELS ───
// Choose one of these:
// 1. 'meta/llama-3.1-70b-instruct'  - Best quality
// 2. 'mistralai/mistral-large'       - Good quality
// 3. 'meta/llama-3.2-3b-instruct'   - Faster, lighter
const FREE_MODEL = 'meta/llama-3.1-70b-instruct';

// ─── HELPER: Generate content ───
async function generateResponse(prompt, temperature = 0.7, maxTokens = 500) {
    try {
        const completion = await client.chat.completions.create({
            model: FREE_MODEL,
            messages: [{ role: 'user', content: prompt }],
            temperature: temperature,
            max_tokens: maxTokens,
        });
        return completion.choices[0].message.content;
    } catch (error) {
        console.error('NVIDIA NIM API Error:', error);
        throw error;
    }
}

// ─── HELPER: Generate JSON ───
async function generateJSON(prompt, temperature = 0.3, maxTokens = 800) {
    try {
        const completion = await client.chat.completions.create({
            model: FREE_MODEL,
            messages: [{ role: 'user', content: prompt }],
            temperature: temperature,
            max_tokens: maxTokens,
        });
        const text = completion.choices[0].message.content;
        const jsonMatch = text.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
            return JSON.parse(jsonMatch[0]);
        }
        return JSON.parse(text);
    } catch (error) {
        console.error('NVIDIA NIM JSON Error:', error);
        throw error;
    }
}

// ─── HEALTH CHECK ───
app.get('/api/health', (req, res) => {
    const keyValid = !!(API_KEY && API_KEY.startsWith('nvapi-'));
    res.json({ 
        status: keyValid ? 'ok' : 'error',
        message: keyValid ? 'Server is running with NVIDIA NIM API' : 'API key not configured',
        timestamp: new Date().toISOString(),
        apiKeySet: keyValid,
        provider: 'NVIDIA NIM',
        model: FREE_MODEL
    });
});

// ─── ASK AI ───
app.post('/api/ask', async (req, res) => {
    const { question, mode } = req.body;
    
    if (!question) {
        return res.status(400).json({ error: 'Question is required' });
    }

    if (!API_KEY || !API_KEY.startsWith('nvapi-')) {
        return res.status(500).json({ error: 'Invalid NVIDIA NIM API key. Keys must start with "nvapi-..."' });
    }

    let systemPrompt = 'You are a helpful assistant. Provide a concise answer. Avoid lengthy context.';
    if (mode === 'detailed') {
        systemPrompt = 'You are a helpful assistant. Provide a comprehensive, well-reasoned answer with context, evidence, and sources. If you are unsure, clearly state that you are unsure.';
    }

    try {
        const fullPrompt = `${systemPrompt}\n\nQuestion: ${question}`;
        const answer = await generateResponse(fullPrompt, 0.7, 500);
        res.json({ answer });
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

    if (!API_KEY || !API_KEY.startsWith('nvapi-')) {
        return res.status(500).json({ error: 'Invalid NVIDIA NIM API key. Keys must start with "nvapi-..."' });
    }

    const prompt = `Analyze the following answer to the question "${question}" for factual accuracy and potential hallucinations.
    Break it down into individual claims. For each claim, classify it as "supported" (factually correct), "context" (needs more context or is partially true), or "unsupported" (hallucination / false).
    Provide a brief explanation for each classification.
    Return the result strictly as a JSON object with a "claims" array.
    Example: { "claims": [ { "text": "The sky is blue.", "status": "supported", "explain": "This is true due to Rayleigh scattering." } ] }
    Answer: "${answer}"`;

    try {
        const result = await generateJSON(prompt, 0.3, 800);
        res.json(result);
    } catch (error) {
        console.error('Error in /api/analyze:', error);
        res.status(500).json({ error: error.message || 'Failed to analyze answer' });
    }
});

// ─── GENERATE CHALLENGE ───
app.post('/api/challenge', async (req, res) => {
    if (!API_KEY || !API_KEY.startsWith('nvapi-')) {
        return res.status(500).json({ error: 'Invalid NVIDIA NIM API key. Keys must start with "nvapi-..."' });
    }

    const prompt = `Generate a tricky multiple-choice question about a common AI hallucination or misconception.
    The AI has provided a confident but incorrect answer. Provide the question, the AI's wrong answer, the correct answer, and an explanation.
    Return strictly as JSON: { "question": "...", "ai_answer": "...", "correct_answer": "...", "explanation": "..." }`;

    try {
        const result = await generateJSON(prompt, 0.8, 600);
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
    console.log(`✅ API Provider: NVIDIA NIM`);
    console.log(`✅ Model: ${FREE_MODEL}`);
    const keyValid = !!(API_KEY && API_KEY.startsWith('nvapi-'));
    console.log(`✅ API Key: ${keyValid ? '✓ Valid (nvapi-...)' : '✗ Invalid - Must start with nvapi-...'}`);
    if (!keyValid) {
        console.log(`   ⚠️  Get a valid key from: https://build.nvidia.com`);
    }
});
