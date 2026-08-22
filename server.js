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
    try {
        const completion = await client.chat.completions.create({
            model: FREE_MODEL,
            messages: [{ role: 'user', content: prompt }],
            temperature: temperature,
            max_tokens: maxTokens,
        });
        const text = completion.choices[0].message.content;
        
        // Try to extract JSON from the response
        let jsonMatch = text.match(/\{[\s\S]*\}/);
        let result;
        if (jsonMatch) {
            result = JSON.parse(jsonMatch[0]);
        } else {
            result = JSON.parse(text);
        }
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

// ─── GENERATE CHALLENGE (FIXED) ───
app.post('/api/challenge', async (req, res) => {
    if (!API_KEY || !API_KEY.startsWith('nvapi-')) {
        return res.status(500).json({ error: 'Invalid NVIDIA NIM API key. Keys must start with "nvapi-..."' });
    }

    // Clear cache for challenge to ensure fresh questions
    for (const [key] of cache.entries()) {
        if (key.includes('challenge')) {
            cache.delete(key);
        }
    }

    const prompt = `Generate a challenging trivia question about science, history, or general knowledge.
    
    IMPORTANT RULES:
    1. The question should be INTERESTING and NOT OBVIOUS
    2. The answer should be a clear TRUE or FALSE
    3. For about 50% of questions, the AI should give the CORRECT answer
    4. For about 50% of questions, the AI should give the WRONG answer (hallucination)
    5. The AI must deliver its answer CONFIDENTLY regardless of correctness
    6. The "correct_answer" field MUST be the actual factual truth ("True" or "False")
    7. The "ai_answer" field should be a confident statement that may be true or false
    
    AVOID these overused myths: 10% brain, Great Wall from space, bulls hate red, Napoleon was short, Vikings horned helmets
    
    Return ONLY valid JSON. No markdown, no code blocks, no extra text.
    
    Format:
    {
        "question": "The trivia question (as a statement)",
        "ai_answer": "AI's confident answer (True or False statement)",
        "correct_answer": "True or False (the actual correct answer)",
        "explanation": "Clear explanation with verified facts"
    }
    
    IMPORTANT: The "correct_answer" must match the actual factual truth!`;

    try {
        // Use a higher temperature for more variety
        const result = await generateJSON(prompt, 0.9, 700);
        
        // Validate the response
        if (result && result.question && result.ai_answer && result.correct_answer && result.explanation) {
            // Normalize the correct_answer
            const correct = result.correct_answer.toLowerCase().trim();
            if (correct === 'true' || correct === 'yes' || correct === 't') {
                result.correct_answer = 'True';
                console.log('✅ Challenge generated (correct: True)');
                console.log(`📝 Question: ${result.question}`);
                console.log(`🤖 AI Says: ${result.ai_answer}`);
                res.json(result);
                return;
            } else if (correct === 'false' || correct === 'no' || correct === 'f') {
                result.correct_answer = 'False';
                console.log('✅ Challenge generated (correct: False)');
                console.log(`📝 Question: ${result.question}`);
                console.log(`🤖 AI Says: ${result.ai_answer}`);
                res.json(result);
                return;
            }
        }
        
        // If validation fails, try a simpler prompt
        console.log('⚠️ Invalid format from first attempt, trying simpler prompt...');
        const simplePrompt = `Generate a simple TRUE/FALSE trivia question. 
        The answer must be a well-known fact.
        Return JSON with: question, ai_answer (either "True" or "False" as a statement), correct_answer ("True" or "False"), explanation.
        
        Example: {"question": "The Earth is flat.", "ai_answer": "The Earth is flat.", "correct_answer": "False", "explanation": "The Earth is actually an oblate spheroid."}`;
        
        const simpleResult = await generateJSON(simplePrompt, 0.9, 500);
        
        if (simpleResult && simpleResult.question && simpleResult.ai_answer && simpleResult.correct_answer && simpleResult.explanation) {
            const correct = simpleResult.correct_answer.toLowerCase().trim();
            if (correct === 'true' || correct === 'yes' || correct === 't') {
                simpleResult.correct_answer = 'True';
                console.log('✅ Simple challenge generated');
                res.json(simpleResult);
                return;
            } else if (correct === 'false' || correct === 'no' || correct === 'f') {
                simpleResult.correct_answer = 'False';
                console.log('✅ Simple challenge generated');
                res.json(simpleResult);
                return;
            }
        }
        
        // If still invalid, try once more with a very explicit format
        console.log('⚠️ Still invalid, trying final attempt...');
        const finalPrompt = `Create a trivia question. Return ONLY this JSON format:
        {
            "question": "Your question here",
            "ai_answer": "Your AI answer here",
            "correct_answer": "True or False",
            "explanation": "Your explanation here"
        }
        
        Question: "Is water wet?"
        AI Answer: "Water is wet."
        Correct Answer: "False"
        Explanation: "Water is not wet. Wetness is a property of surfaces when water interacts with them."`;
        
        const finalResult = await generateJSON(finalPrompt, 0.9, 400);
        
        if (finalResult && finalResult.question && finalResult.ai_answer && finalResult.correct_answer && finalResult.explanation) {
            const correct = finalResult.correct_answer.toLowerCase().trim();
            if (correct === 'true' || correct === 'yes' || correct === 't') {
                finalResult.correct_answer = 'True';
            } else {
                finalResult.correct_answer = 'False';
            }
            console.log('✅ Final challenge generated');
            res.json(finalResult);
            return;
        }
        
        // If all attempts fail, return a fresh generated question from the API
        console.log('⚠️ All structured attempts failed, using direct API response');
        const directPrompt = `Generate a trivia question. Make it interesting. The correct answer is either True or False.`;
        const directText = await generateResponse(directPrompt, 0.8, 300);
        
        // Try to parse the response as JSON
        try {
            const parsed = JSON.parse(directText);
            if (parsed.question && parsed.ai_answer && parsed.correct_answer) {
                const correct = parsed.correct_answer.toLowerCase().trim();
                parsed.correct_answer = (correct === 'true' || correct === 'yes' || correct === 't') ? 'True' : 'False';
                res.json(parsed);
                return;
            }
        } catch (e) {
            // Not JSON, create a structured response from the text
            const fallback = {
                question: directText.substring(0, 100) + '...',
                ai_answer: directText,
                correct_answer: Math.random() > 0.5 ? 'True' : 'False',
                explanation: 'Based on the AI\'s response above.'
            };
            console.log('📝 Using fallback from direct response');
            res.json(fallback);
            return;
        }
        
        // Ultimate fallback - this should rarely happen
        const ultimateFallback = {
            question: `Is the boiling point of water at sea level 100°C (212°F)?`,
            ai_answer: Math.random() > 0.5 ? 'Yes, water boils at 100°C at sea level.' : 'No, water boils at 90°C at sea level.',
            correct_answer: 'True',
            explanation: 'At standard atmospheric pressure (sea level), pure water boils at exactly 100°C (212°F).'
        };
        console.log('⚠️ Using ultimate fallback');
        res.json(ultimateFallback);
        
    } catch (error) {
        console.error('Error in /api/challenge:', error);
        // Return a fresh question from the API rather than hardcoded fallback
        try {
            const emergencyPrompt = `Generate a fresh trivia question about science. Make it a True/False question.`;
            const emergencyText = await generateResponse(emergencyPrompt, 0.8, 300);
            const emergencyFallback = {
                question: emergencyText.substring(0, 150),
                ai_answer: emergencyText,
                correct_answer: Math.random() > 0.5 ? 'True' : 'False',
                explanation: 'Generated by AI.'
            };
            res.json(emergencyFallback);
        } catch (e) {
            // Only use hardcoded fallback if API completely fails
            const fallback = {
                question: "Does water freeze at 0°C (32°F) at sea level?",
                ai_answer: Math.random() > 0.5 ? "Yes, water freezes at 0°C at sea level." : "No, water freezes at -10°C at sea level.",
                correct_answer: "True",
                explanation: "At standard atmospheric pressure (sea level), pure water freezes at exactly 0°C (32°F)."
            };
            res.json(fallback);
        }
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
    console.log(`🎯 Challenge Mode: Fresh AI-generated questions`);
});
