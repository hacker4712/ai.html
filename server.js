require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const { OpenAI } = require('openai');

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json());

// ─── PUBLIC FOLDER ───
const publicPath = path.join(__dirname, 'public');
const indexPath = path.join(publicPath, 'index.html');

console.log(`📁 Public folder: ${publicPath}`);

if (!fs.existsSync(publicPath)) {
    fs.mkdirSync(publicPath, { recursive: true });
}

if (!fs.existsSync(indexPath)) {
    const fallbackHTML = `<!DOCTYPE html>
<html>
<head><title>AI Lab</title></head>
<body style="background:#0b0b14;color:#f0edf6;font-family:Arial;display:flex;justify-content:center;align-items:center;height:100vh;">
    <div style="text-align:center;"><h1>🧠 AI Lab</h1><p>Server running ✅</p></div>
</body>
</html>`;
    fs.writeFileSync(indexPath, fallbackHTML);
}

app.use(express.static(publicPath));

// ─── API KEY ───
const HARDCODED_KEY = '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';
const API_KEY = process.env.NVIDIA_API_KEY || HARDCODED_KEY;

if (!API_KEY || !API_KEY.startsWith('nvapi-')) {
    console.error('❌ Invalid API key');
} else {
    console.log('✅ API Key configured');
}

const client = new OpenAI({
    baseURL: 'https://integrate.api.nvidia.com/v1',
    apiKey: API_KEY,
    defaultHeaders: { 'Content-Type': 'application/json' }
});

// ─── MODELS ───
const FAST_MODEL = 'mistralai/mistral-small-3.1-24b-instruct';
const ACCURATE_MODEL = 'meta/llama-3.1-70b-instruct';

// ─── CACHE ───
const cache = new Map();
const CACHE_TTL = 3600000;

// ─── HELPER: Generate response ───
async function generateResponse(prompt, temperature = 0.5, maxTokens = 350, useAccurate = false) {
    const cacheKey = `${prompt}-${temperature}-${maxTokens}-${useAccurate}`;
    
    if (cache.has(cacheKey)) {
        const cached = cache.get(cacheKey);
        if (Date.now() - cached.timestamp < CACHE_TTL) {
            console.log('📦 Cached response');
            return cached.data;
        }
        cache.delete(cacheKey);
    }
    
    const model = useAccurate ? ACCURATE_MODEL : FAST_MODEL;
    
    try {
        const completion = await client.chat.completions.create({
            model: model,
            messages: [
                { 
                    role: 'system', 
                    content: useAccurate 
                        ? 'You are a knowledgeable assistant. Provide accurate, well-reasoned answers with facts and context.'
                        : 'You are a helpful assistant. Give accurate, concise answers in 2-3 sentences.'
                },
                { role: 'user', content: prompt }
            ],
            temperature: temperature,
            max_tokens: maxTokens,
        });
        
        const result = completion.choices[0].message.content;
        cache.set(cacheKey, { data: result, timestamp: Date.now() });
        return result;
    } catch (error) {
        console.error('API Error:', error.message);
        throw error;
    }
}

// ─── HELPER: Generate JSON ───
async function generateJSON(prompt, temperature = 0.2, maxTokens = 500) {
    const cacheKey = `${prompt}-json-${temperature}-${maxTokens}`;
    
    if (cache.has(cacheKey)) {
        const cached = cache.get(cacheKey);
        if (Date.now() - cached.timestamp < CACHE_TTL) {
            console.log('📦 Cached JSON');
            return cached.data;
        }
        cache.delete(cacheKey);
    }
    
    try {
        const completion = await client.chat.completions.create({
            model: ACCURATE_MODEL,
            messages: [
                {
                    role: 'system',
                    content: 'You are a fact-checking AI. Analyze claims carefully. Return valid JSON only. Be accurate.'
                },
                { role: 'user', content: prompt }
            ],
            temperature: temperature,
            max_tokens: maxTokens,
        });
        
        const text = completion.choices[0].message.content;
        const jsonMatch = text.match(/\{[\s\S]*\}/);
        let result;
        if (jsonMatch) {
            result = JSON.parse(jsonMatch[0]);
        } else {
            result = JSON.parse(text);
        }
        
        cache.set(cacheKey, { data: result, timestamp: Date.now() });
        return result;
    } catch (error) {
        console.error('JSON Error:', error.message);
        throw error;
    }
}

// ─── CLEAN CACHE ───
setInterval(() => {
    const now = Date.now();
    for (const [key, value] of cache.entries()) {
        if (now - value.timestamp > CACHE_TTL) {
            cache.delete(key);
        }
    }
}, 60000);

// ─── HEALTH CHECK ───
app.get('/api/health', (req, res) => {
    const keyValid = !!(API_KEY && API_KEY.startsWith('nvapi-'));
    res.json({ 
        status: keyValid ? 'ok' : 'error',
        message: keyValid ? 'Server running' : 'API key missing',
        timestamp: new Date().toISOString(),
        apiKeySet: keyValid,
        provider: 'NVIDIA NIM',
        cacheSize: cache.size
    });
});

// ─── ASK AI ───
app.post('/api/ask', async (req, res) => {
    const { question, mode } = req.body;
    
    if (!question) {
        return res.status(400).json({ error: 'Question required' });
    }

    if (!API_KEY || !API_KEY.startsWith('nvapi-')) {
        return res.status(500).json({ error: 'Invalid API key' });
    }

    try {
        const isDetailed = mode === 'detailed';
        const prompt = isDetailed 
            ? `Provide a comprehensive, well-reasoned answer to: "${question}". Include context and evidence.`
            : `Give a concise, accurate answer to: "${question}". Include the most important fact.`;
        const answer = await generateResponse(prompt, isDetailed ? 0.3 : 0.3, isDetailed ? 500 : 250, isDetailed);
        res.json({ answer });
    } catch (error) {
        console.error('Ask error:', error);
        res.status(500).json({ error: error.message || 'Failed to get answer' });
    }
});

// ─── ANALYZE ANSWER ───
app.post('/api/analyze', async (req, res) => {
    const { question, answer } = req.body;

    if (!question || !answer) {
        return res.status(400).json({ error: 'Question and answer required' });
    }

    if (!API_KEY || !API_KEY.startsWith('nvapi-')) {
        return res.status(500).json({ error: 'Invalid API key' });
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
        console.error('Analyze error:', error);
        res.status(500).json({ error: error.message || 'Failed to analyze answer' });
    }
});

// ─── GENERATE CHALLENGE ───
app.post('/api/challenge', async (req, res) => {
    if (!API_KEY || !API_KEY.startsWith('nvapi-')) {
        return res.status(500).json({ error: 'Invalid API key' });
    }

    const prompt = `Generate a tricky misconception or common myth question.
    The AI should give a confident but INCORRECT answer.
    Return JSON: { "question": "...", "ai_answer": "...", "correct_answer": "...", "explanation": "..." }`;

    try {
        const result = await generateJSON(prompt, 0.4, 400);
        res.json(result);
    } catch (error) {
        console.error('Challenge error:', error);
        res.status(500).json({ error: error.message || 'Failed to generate challenge' });
    }
});

// ─── SERVE INDEX ───
app.get('*', (req, res) => {
    if (req.path.startsWith('/api/')) {
        return res.status(404).json({ error: 'API not found' });
    }
    res.sendFile(indexPath);
});

// ─── START ───
app.listen(PORT, () => {
    console.log(`✅ Server running on port ${PORT}`);
    console.log(`✅ Serving: ${publicPath}`);
    console.log(`✅ API Key: ${API_KEY && API_KEY.startsWith('nvapi-') ? '✓ Valid' : '✗ Invalid'}`);
    console.log(`📦 Cache: Enabled`);
});
