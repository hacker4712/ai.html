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
const HARDCODED_KEY = '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';
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

// ─── MODEL SELECTION ───
// For accuracy: Llama 3.1 70B (best quality)
// For speed: Mistral Small 3.1 (faster, still accurate)
// Balanced approach: Use Llama for analysis, Mistral for simple answers

const FAST_MODEL = 'mistralai/mistral-small-3.1-24b-instruct';
const ACCURATE_MODEL = 'meta/llama-3.1-70b-instruct';

// ─── HELPER: Generate response (fast for simple, accurate for complex) ───
async function generateResponse(prompt, temperature = 0.5, maxTokens = 350, useAccurate = false) {
    try {
        const startTime = Date.now();
        const model = useAccurate ? ACCURATE_MODEL : FAST_MODEL;
        const completion = await client.chat.completions.create({
            model: model,
            messages: [
                { 
                    role: 'system', 
                    content: useAccurate 
                        ? 'You are a knowledgeable assistant. Provide accurate, well-reasoned answers with facts and context. Be thorough but concise.'
                        : 'You are a helpful assistant. Give accurate, concise answers in 2-3 sentences.'
                },
                { role: 'user', content: prompt }
            ],
            temperature: temperature,
            max_tokens: maxTokens,
        });
        const elapsed = Date.now() - startTime;
        console.log(`⏱️ Response generated in ${elapsed}ms (model: ${model})`);
        return completion.choices[0].message.content;
    } catch (error) {
        console.error('NVIDIA NIM API Error:', error);
        throw error;
    }
}

// ─── HELPER: Generate JSON analysis (always uses accurate model) ───
async function generateJSON(prompt, temperature = 0.2, maxTokens = 500) {
    try {
        const startTime = Date.now();
        // Analysis always uses accurate model for correctness
        const completion = await client.chat.completions.create({
            model: ACCURATE_MODEL,
            messages: [
                {
                    role: 'system',
                    content: 'You are a fact-checking AI. Analyze claims carefully. Return valid JSON only. Be accurate and thorough.'
                },
                { role: 'user', content: prompt }
            ],
            temperature: temperature,
            max_tokens: maxTokens,
        });
        const elapsed = Date.now() - startTime;
        console.log(`⏱️ Analysis generated in ${elapsed}ms (using accurate model)`);
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
        message: keyValid ? 'Server is running (Balanced Mode)' : 'API key not configured',
        timestamp: new Date().toISOString(),
        apiKeySet: keyValid,
        provider: 'NVIDIA NIM',
        fastModel: FAST_MODEL,
        accurateModel: ACCURATE_MODEL,
        mode: 'BALANCED (Fast + Accurate)'
    });
});

// ─── ASK AI (Fast for simple, Accurate for detailed) ───
app.post('/api/ask', async (req, res) => {
    const { question, mode } = req.body;
    
    if (!question) {
        return res.status(400).json({ error: 'Question is required' });
    }

    if (!API_KEY || !API_KEY.startsWith('nvapi-')) {
        return res.status(500).json({ error: 'Invalid NVIDIA NIM API key. Keys must start with "nvapi-..."' });
    }

    try {
        let answer;
        const isDetailed = mode === 'detailed';
        
        if (isDetailed) {
            // Detailed answers use accurate model for better quality
            const prompt = `Provide a comprehensive, well-reasoned answer to: "${question}". Include context, evidence, and sources if known. Be accurate and thorough.`;
            answer = await generateResponse(prompt, 0.3, 500, true);
        } else {
            // Simple answers use fast model with accuracy prompt
            const prompt = `Give a concise, accurate answer to: "${question}". Include the most important fact.`;
            answer = await generateResponse(prompt, 0.3, 250, false);
        }
        res.json({ answer });
    } catch (error) {
        console.error('Error in /api/ask:', error);
        res.status(500).json({ error: error.message || 'Failed to get answer' });
    }
});

// ─── ANALYZE ANSWER (Always accurate) ───
app.post('/api/analyze', async (req, res) => {
    const { question, answer } = req.body;

    if (!question || !answer) {
        return res.status(400).json({ error: 'Question and answer are required' });
    }

    if (!API_KEY || !API_KEY.startsWith('nvapi-')) {
        return res.status(500).json({ error: 'Invalid NVIDIA NIM API key. Keys must start with "nvapi-..."' });
    }

    const prompt = `Analyze this claim: "${answer}" in the context of the question: "${question}".
    Break it down into individual claims. For each claim, classify as:
    - "supported" (factually correct)
    - "context" (partially true, needs context)
    - "unsupported" (hallucination / false)
    Provide a brief explanation for each classification.
    Return JSON: { "claims": [ { "text": "...", "status": "...", "explain": "..." } ] }`;

    try {
        const result = await generateJSON(prompt, 0.2, 500);
        res.json(result);
    } catch (error) {
        console.error('Error in /api/analyze:', error);
        res.status(500).json({ error: error.message || 'Failed to analyze answer' });
    }
});

// ─── GENERATE CHALLENGE (Accurate) ───
app.post('/api/challenge', async (req, res) => {
    if (!API_KEY || !API_KEY.startsWith('nvapi-')) {
        return res.status(500).json({ error: 'Invalid NVIDIA NIM API key. Keys must start with "nvapi-..."' });
    }

    const prompt = `Generate a tricky misconception or common myth question.
    The AI should give a confident but INCORRECT answer.
    Return JSON: { "question": "...", "ai_answer": "...", "correct_answer": "...", "explanation": "..." }`;

    try {
        const result = await generateJSON(prompt, 0.4, 400);
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
    console.log(`✅ API Provider: NVIDIA NIM (BALANCED MODE)`);
    console.log(`✅ Fast Model (simple answers): ${FAST_MODEL}`);
    console.log(`✅ Accurate Model (analysis): ${ACCURATE_MODEL}`);
    const keyValid = !!(API_KEY && API_KEY.startsWith('nvapi-'));
    console.log(`✅ API Key: ${keyValid ? '✓ Valid' : '✗ Invalid'}`);
    console.log(`📊 Mode: Fast responses + Accurate analysis`);
});
