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
app.use(express.static('public'));

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

// ─── NVIDIA NIM API KEY ───
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

// ─── NVIDIA NIM FREE MODELS ───
const FREE_MODEL = 'meta/llama-3.1-70b-instruct';

// ─── CACHE ───
const cache = new Map();
const CACHE_TTL = 3600000;

// ─── HELPER: Generate content ───
async function generateResponse(prompt, temperature = 0.7, maxTokens = 500) {
    const cacheKey = `${prompt}-${temperature}-${maxTokens}`;
    
    if (cache.has(cacheKey)) {
        const cached = cache.get(cacheKey);
        if (Date.now() - cached.timestamp < CACHE_TTL) {
            console.log('📦 Cached response');
            return cached.data;
        }
        cache.delete(cacheKey);
    }
    
    try {
        const completion = await client.chat.completions.create({
            model: FREE_MODEL,
            messages: [{ role: 'user', content: prompt }],
            temperature: temperature,
            max_tokens: maxTokens,
        });
        const result = completion.choices[0].message.content;
        cache.set(cacheKey, { data: result, timestamp: Date.now() });
        return result;
    } catch (error) {
        console.error('NVIDIA NIM API Error:', error);
        throw error;
    }
}

// ─── HELPER: Generate JSON ───
async function generateJSON(prompt, temperature = 0.3, maxTokens = 800) {
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
            model: FREE_MODEL,
            messages: [{ role: 'user', content: prompt }],
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
        console.error('NVIDIA NIM JSON Error:', error);
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
        message: keyValid ? 'Server is running with NVIDIA NIM API' : 'API key not configured',
        timestamp: new Date().toISOString(),
        apiKeySet: keyValid,
        provider: 'NVIDIA NIM',
        model: FREE_MODEL,
        cacheSize: cache.size
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

// ─── GENERATE CHALLENGE (100% AI Generated, No Fallbacks) ───
app.post('/api/challenge', async (req, res) => {
    if (!API_KEY || !API_KEY.startsWith('nvapi-')) {
        return res.status(500).json({ error: 'Invalid NVIDIA NIM API key. Keys must start with "nvapi-..."' });
    }

    const prompt = `Generate a unique, interesting trivia question about a common misconception OR a well-known fact.

    IMPORTANT RULES:
    1. The question MUST be about something that has a clear TRUE or FALSE answer
    2. The "correct_answer" MUST be the actual factual answer (True or False)
    3. The "ai_answer" can be EITHER true OR false (mix it up randomly!)
    4. The explanation MUST clearly explain WHY the AI is right or wrong
    5. NEVER repeat the same question - be creative and unique
    6. Avoid these overused topics: 10% brain, Great Wall visible from space, bulls hate red, Napoleon was short

    Return ONLY valid JSON. No markdown, no code blocks, no extra text.

    Format:
    {
        "question": "The trivia question",
        "ai_answer": "The AI's confident answer (can be True or False - choose randomly!)",
        "correct_answer": "True or False (MUST be the actual correct answer)",
        "explanation": "Clear explanation with verified facts"
    }

    Example (correct answer):
    {
        "question": "Do adult humans have 206 bones?",
        "ai_answer": "Yes, adult humans have exactly 206 bones.",
        "correct_answer": "True",
        "explanation": "Adult humans have 206 bones. This is a well-established anatomical fact."
    }

    Example (hallucination - AI is wrong):
    {
        "question": "Do adult humans have 206 bones?",
        "ai_answer": "No, adult humans have 200 bones.",
        "correct_answer": "True",
        "explanation": "The AI is wrong. Adult humans actually have 206 bones, not 200."
    }`;

    try {
        const result = await generateJSON(prompt, 0.9, 700);
        
        // Validate the response has all required fields
        if (result.question && result.ai_answer && result.correct_answer && result.explanation) {
            // Ensure correct_answer is properly formatted as "True" or "False"
            const correct = result.correct_answer.toLowerCase();
            if (correct === 'true' || correct === 'false') {
                result.correct_answer = correct.charAt(0).toUpperCase() + correct.slice(1);
                res.json(result);
                return;
            }
        }
        
        // If invalid format, try once more with simpler prompt
        const retryPrompt = `Generate a simple trivia question with a True or False answer.
        Return JSON: { "question": "...", "ai_answer": "...", "correct_answer": "True or False", "explanation": "..." }`;
        
        const retryResult = await generateJSON(retryPrompt, 0.8, 400);
        
        if (retryResult.question && retryResult.ai_answer && retryResult.correct_answer && retryResult.explanation) {
            const correct = retryResult.correct_answer.toLowerCase();
            if (correct === 'true' || correct === 'false') {
                retryResult.correct_answer = correct.charAt(0).toUpperCase() + correct.slice(1);
                res.json(retryResult);
                return;
            }
        }
        
        // If still invalid, return error (no fallback)
        res.status(500).json({ error: 'Failed to generate valid challenge format. Please try again.' });
        
    } catch (error) {
        console.error('Error in /api/challenge:', error);
        res.status(500).json({ error: error.message || 'Failed to generate challenge. Please try again.' });
    }
});

// ─── SERVE INDEX.HTML ───
app.get('*', (req, res) => {
    if (req.path.startsWith('/api/')) {
        return res.status(404).json({ error: 'API endpoint not found' });
    }
    res.sendFile(indexPath);
});

// ─── START SERVER ───
app.listen(PORT, () => {
    console.log(`✅ Server running on port ${PORT}`);
    console.log(`✅ Serving files from: ${path.join(__dirname, 'public')}`);
    console.log(`✅ API Provider: NVIDIA NIM`);
    console.log(`✅ Model: ${FREE_MODEL}`);
    const keyValid = !!(API_KEY && API_KEY.startsWith('nvapi-'));
    console.log(`✅ API Key: ${keyValid ? '✓ Valid (nvapi-...)' : '✗ Invalid'}`);
    console.log(`📦 Cache: Enabled`);
    console.log(`🎯 Challenge Mode: 100% AI Generated (No fallbacks)`);
});
