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

// ─── CHECK IF PUBLIC FOLDER EXISTS ───
const publicPath = path.join(__dirname, 'public');
const indexPath = path.join(publicPath, 'index.html');

console.log(`📁 Public folder path: ${publicPath}`);
console.log(`📄 Index file path: ${indexPath}`);

if (!fs.existsSync(publicPath)) {
    console.error(`❌ Public folder not found at: ${publicPath}`);
    console.log('📝 Creating public folder...');
    fs.mkdirSync(publicPath, { recursive: true });
}

if (!fs.existsSync(indexPath)) {
    console.error(`❌ index.html not found at: ${indexPath}`);
    console.log('📝 Creating a basic index.html file...');
    const basicHTML = `<!DOCTYPE html>
<html>
<head><title>AI Hallucination Lab</title></head>
<body>
    <h1>🧠 AI Hallucination Lab</h1>
    <p>Please upload your complete index.html file to the public folder.</p>
    <p>Current status: Basic page loaded.</p>
</body>
</html>`;
    fs.writeFileSync(indexPath, basicHTML);
    console.log('✅ Created basic index.html as fallback');
}

// ─── SERVE STATIC FILES ───
app.use(express.static(publicPath));

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
const FAST_MODEL = 'mistralai/mistral-small-3.1-24b-instruct';
const ACCURATE_MODEL = 'meta/llama-3.1-70b-instruct';

// ─── RATE LIMIT SETTINGS ───
const RATE_LIMIT = {
    requestsPerMinute: 10,
    requestCount: 0,
    resetTime: Date.now() + 60000,
    queue: [],
    processing: false
};

// ─── SIMPLE CACHE ───
const cache = new Map();
const CACHE_TTL = 3600000;

// ─── RETRY HELPER ───
async function withRetry(fn, maxRetries = 3, delay = 1000) {
    let lastError;
    for (let i = 0; i < maxRetries; i++) {
        try {
            return await fn();
        } catch (error) {
            lastError = error;
            console.log(`⚠️ Attempt ${i + 1} failed: ${error.message}`);
            if (i < maxRetries - 1) {
                const waitTime = delay * Math.pow(2, i);
                console.log(`⏳ Waiting ${waitTime}ms before retry...`);
                await new Promise(resolve => setTimeout(resolve, waitTime));
            }
        }
    }
    throw lastError;
}

// ─── RATE LIMIT QUEUE ───
async function processQueue() {
    if (RATE_LIMIT.processing || RATE_LIMIT.queue.length === 0) return;
    
    if (Date.now() > RATE_LIMIT.resetTime) {
        RATE_LIMIT.requestCount = 0;
        RATE_LIMIT.resetTime = Date.now() + 60000;
    }
    
    if (RATE_LIMIT.requestCount >= RATE_LIMIT.requestsPerMinute) {
        const waitTime = RATE_LIMIT.resetTime - Date.now();
        console.log(`⏳ Rate limit reached. Waiting ${Math.round(waitTime/1000)}s...`);
        setTimeout(processQueue, waitTime + 100);
        return;
    }
    
    RATE_LIMIT.processing = true;
    const { fn, resolve, reject } = RATE_LIMIT.queue.shift();
    
    try {
        RATE_LIMIT.requestCount++;
        const result = await fn();
        resolve(result);
    } catch (error) {
        reject(error);
    } finally {
        RATE_LIMIT.processing = false;
        setTimeout(processQueue, 200);
    }
}

function enqueueRequest(fn) {
    return new Promise((resolve, reject) => {
        RATE_LIMIT.queue.push({ fn, resolve, reject });
        if (!RATE_LIMIT.processing) {
            processQueue();
        }
    });
}

// ─── HELPER: Generate response ───
async function generateResponse(prompt, temperature = 0.5, maxTokens = 350, useAccurate = false) {
    const cacheKey = `${prompt}-${temperature}-${maxTokens}-${useAccurate}`;
    
    if (cache.has(cacheKey)) {
        const cached = cache.get(cacheKey);
        if (Date.now() - cached.timestamp < CACHE_TTL) {
            console.log('📦 Returning cached response');
            return cached.data;
        } else {
            cache.delete(cacheKey);
        }
    }
    
    const model = useAccurate ? ACCURATE_MODEL : FAST_MODEL;
    
    const makeRequest = async () => {
        const startTime = Date.now();
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
    };
    
    try {
        const result = await withRetry(async () => {
            return await enqueueRequest(makeRequest);
        });
        
        cache.set(cacheKey, {
            data: result,
            timestamp: Date.now()
        });
        
        return result;
    } catch (error) {
        console.error('Error after retries:', error);
        throw error;
    }
}

// ─── HELPER: Generate JSON ───
async function generateJSON(prompt, temperature = 0.2, maxTokens = 500) {
    const cacheKey = `${prompt}-json-${temperature}-${maxTokens}`;
    
    if (cache.has(cacheKey)) {
        const cached = cache.get(cacheKey);
        if (Date.now() - cached.timestamp < CACHE_TTL) {
            console.log('📦 Returning cached JSON');
            return cached.data;
        } else {
            cache.delete(cacheKey);
        }
    }
    
    const makeRequest = async () => {
        const startTime = Date.now();
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
        console.log(`⏱️ Analysis generated in ${elapsed}ms`);
        const text = completion.choices[0].message.content;
        const jsonMatch = text.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
            return JSON.parse(jsonMatch[0]);
        }
        return JSON.parse(text);
    };
    
    try {
        const result = await withRetry(async () => {
            return await enqueueRequest(makeRequest);
        });
        
        cache.set(cacheKey, {
            data: result,
            timestamp: Date.now()
        });
        
        return result;
    } catch (error) {
        console.error('Error after retries:', error);
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
        message: keyValid ? 'Server is running (Balanced Mode)' : 'API key not configured',
        timestamp: new Date().toISOString(),
        apiKeySet: keyValid,
        provider: 'NVIDIA NIM',
        fastModel: FAST_MODEL,
        accurateModel: ACCURATE_MODEL,
        mode: 'BALANCED (Fast + Accurate)',
        queueLength: RATE_LIMIT.queue.length,
        cacheSize: cache.size,
        rateLimit: {
            requestsThisMinute: RATE_LIMIT.requestCount,
            maxPerMinute: RATE_LIMIT.requestsPerMinute,
            resetIn: Math.max(0, Math.round((RATE_LIMIT.resetTime - Date.now()) / 1000)) + 's'
        }
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

    try {
        let answer;
        const isDetailed = mode === 'detailed';
        
        if (isDetailed) {
            const prompt = `Provide a comprehensive, well-reasoned answer to: "${question}". Include context, evidence, and sources if known. Be accurate and thorough.`;
            answer = await generateResponse(prompt, 0.3, 500, true);
        } else {
            const prompt = `Give a concise, accurate answer to: "${question}". Include the most important fact.`;
            answer = await generateResponse(prompt, 0.3, 250, false);
        }
        res.json({ answer });
    } catch (error) {
        console.error('Error in /api/ask:', error);
        res.status(429).json({ 
            error: error.message || 'Rate limit exceeded. Please try again in a moment.',
            retryAfter: Math.max(0, Math.round((RATE_LIMIT.resetTime - Date.now()) / 1000))
        });
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
        res.status(429).json({ 
            error: error.message || 'Rate limit exceeded. Please try again in a moment.',
            retryAfter: Math.max(0, Math.round((RATE_LIMIT.resetTime - Date.now()) / 1000))
        });
    }
});

// ─── GENERATE CHALLENGE ───
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
        res.status(429).json({ 
            error: error.message || 'Rate limit exceeded. Please try again in a moment.',
            retryAfter: Math.max(0, Math.round((RATE_LIMIT.resetTime - Date.now()) / 1000))
        });
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
    console.log(`✅ Fast Model: ${FAST_MODEL}`);
    console.log(`✅ Accurate Model: ${ACCURATE_MODEL}`);
    const keyValid = !!(API_KEY && API_KEY.startsWith('nvapi-'));
    console.log(`✅ API Key: ${keyValid ? '✓ Valid' : '✗ Invalid'}`);
    console.log(`📊 Mode: Fast responses + Accurate analysis`);
    console.log(`🛡️ Rate Limit: ${RATE_LIMIT.requestsPerMinute} requests/minute`);
    console.log(`📦 Cache: Enabled (${CACHE_TTL/1000}s TTL)`);
    console.log(`🔄 Retry: Enabled (3 retries with exponential backoff)`);
    console.log(`⏳ Queue: Enabled for rate limit handling`);
});
