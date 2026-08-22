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

// ─── SERVE SCANNER.JS ───
app.get('/scanner.js', (req, res) => {
    const scannerPath = path.join(__dirname, 'public', 'scanner.js');
    if (fs.existsSync(scannerPath)) {
        res.sendFile(scannerPath);
    } else {
        res.status(404).json({ error: 'scanner.js not found' });
    }
});

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

// ════════════════════════════════════════════════
//  API ROUTES
// ════════════════════════════════════════════════

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

// ─── GENERATE CHALLENGE ───
app.post('/api/challenge', async (req, res) => {
    if (!API_KEY || !API_KEY.startsWith('nvapi-')) {
        return res.status(500).json({ error: 'Invalid NVIDIA NIM API key. Keys must start with "nvapi-..."' });
    }

    const prompt = `Generate a tricky trivia question about a common misconception OR a well-known fact.
    
    The question should be interesting and not too obvious.
    
    IMPORTANT: The answer should SOMETIMES be TRUE and SOMETIMES be FALSE - mix it up!
    - About 50% of the time the AI should give a CORRECT answer
    - About 50% of the time the AI should give an INCORRECT answer (hallucination)
    
    The AI should deliver the answer confidently regardless of whether it's correct or not.
    
    For the CORRECT ANSWER, you MUST use the actual correct answer (True or False) based on real facts.
    Do NOT make up facts. Only use information you are 100% certain about.
    If you are unsure about any fact, do NOT use it.
    
    IMPORTANT RULES:
    1. The "correct_answer" field MUST be the TRUE factual answer
    2. The "ai_answer" field can be either true OR false (your choice, mix it up)
    3. Only use facts you are confident about
    4. Avoid these overused myths: 10% brain, Great Wall visible from space, bulls hate red, Napoleon was short, Vikings horned helmets
    
    Return ONLY valid JSON with NO extra text, NO markdown, NO code blocks. Just the JSON object.
    
    Format:
    {
        "question": "The trivia question",
        "ai_answer": "The AI's confident answer (can be true or false - mix it up!)",
        "correct_answer": "True or False (MUST be the actual correct answer)",
        "explanation": "Clear explanation with verified facts"
    }
    
    Example correct format (AI is correct):
    {
        "question": "Do adult humans have 206 bones?",
        "ai_answer": "Yes, adult humans have exactly 206 bones.",
        "correct_answer": "True",
        "explanation": "Adult humans have 206 bones. This is a well-established anatomical fact."
    }
    
    Example incorrect format (AI is hallucinating):
    {
        "question": "Do adult humans have 206 bones?",
        "ai_answer": "No, adult humans have 200 bones.",
        "correct_answer": "True",
        "explanation": "The AI is wrong here. Adult humans actually have 206 bones, not 200."
    }`;

    try {
        const result = await generateJSON(prompt, 0.8, 700);
        
        // Validate the response
        if (result.question && result.ai_answer && result.correct_answer && result.explanation) {
            // Ensure correct_answer is properly formatted as "True" or "False"
            const correct = result.correct_answer.toLowerCase();
            if (correct === 'true' || correct === 'false') {
                result.correct_answer = correct.charAt(0).toUpperCase() + correct.slice(1);
                console.log('✅ Challenge generated:', result.question);
                res.json(result);
                return;
            }
        }
        
        // If validation fails, try a second time with a simpler prompt
        console.log('⚠️ Invalid format, retrying...');
        const retryPrompt = `Generate a simple trivia question. 
        The question MUST be about a well-known fact. 
        Return JSON with: question, ai_answer (can be true or false), correct_answer (must be "True" or "False"), explanation.
        Use a random true/false mix.
        Example: { "question": "Is the Earth flat?", "ai_answer": "Yes, the Earth is flat.", "correct_answer": "False", "explanation": "The Earth is actually an oblate spheroid." }`;
        
        const retryResult = await generateJSON(retryPrompt, 0.8, 500);
        if (retryResult.question && retryResult.ai_answer && retryResult.correct_answer && retryResult.explanation) {
            const correct = retryResult.correct_answer.toLowerCase();
            if (correct === 'true' || correct === 'false') {
                retryResult.correct_answer = correct.charAt(0).toUpperCase() + correct.slice(1);
                console.log('✅ Retry succeeded:', retryResult.question);
                res.json(retryResult);
                return;
            }
        }
        
        // If still invalid, return a simple known fact as fallback
        console.log('⚠️ All retries failed, sending fallback');
        const fallbacks = [
            {
                question: "Does water freeze at 0°C (32°F) at sea level?",
                ai_answer: Math.random() > 0.5 ? "Yes, water freezes at 0°C at sea level." : "No, water freezes at -10°C at sea level.",
                correct_answer: "True",
                explanation: "At standard atmospheric pressure (sea level), pure water freezes at exactly 0°C (32°F)."
            },
            {
                question: "Is the Earth the largest planet in our solar system?",
                ai_answer: Math.random() > 0.5 ? "Yes, Earth is the largest planet." : "No, Jupiter is the largest planet.",
                correct_answer: "False",
                explanation: "Jupiter is the largest planet in our solar system. Earth is the fifth largest."
            },
            {
                question: "Do sharks have bones?",
                ai_answer: Math.random() > 0.5 ? "Yes, sharks have 206 bones." : "No, sharks have no bones.",
                correct_answer: "False",
                explanation: "Sharks have no bones. Their skeletons are made entirely of cartilage."
            }
        ];
        const fallback = fallbacks[Math.floor(Math.random() * fallbacks.length)];
        res.json(fallback);
        
    } catch (error) {
        console.error('Error in /api/challenge:', error);
        // Return a simple fallback
        const fallback = {
            question: "Does water freeze at 0°C (32°F) at sea level?",
            ai_answer: Math.random() > 0.5 ? "Yes, water freezes at 0°C at sea level." : "No, water freezes at -10°C at sea level.",
            correct_answer: "True",
            explanation: "At standard atmospheric pressure (sea level), pure water freezes at exactly 0°C (32°F)."
        };
        res.json(fallback);
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
    console.log(`🎯 Challenge Mode: Mixed True/False with AI generation`);
});
