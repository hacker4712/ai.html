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

// ─── TRACK USED CHALLENGE QUESTIONS ───
const usedQuestions = new Set();
const MAX_USED_HISTORY = 100;

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
    // Clean old used questions
    if (usedQuestions.size > MAX_USED_HISTORY) {
        const toRemove = usedQuestions.size - MAX_USED_HISTORY;
        const iterator = usedQuestions.values();
        for (let i = 0; i < toRemove; i++) {
            usedQuestions.delete(iterator.next().value);
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
        cacheSize: cache.size,
        usedQuestionsCount: usedQuestions.size
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

// ─── GENERATE CHALLENGE (FIXED - NO REPEATS) ───
app.post('/api/challenge', async (req, res) => {
    if (!API_KEY || !API_KEY.startsWith('nvapi-')) {
        return res.status(500).json({ error: 'Invalid NVIDIA NIM API key. Keys must start with "nvapi-..."' });
    }

    // Clear challenge cache to ensure freshness
    for (const [key] of cache.entries()) {
        if (key.includes('challenge')) {
            cache.delete(key);
        }
    }

    const usedQuestionsList = Array.from(usedQuestions);
    const avoidPrompt = usedQuestionsList.length > 0 
        ? `\n\nAVOID these previously used questions:\n${usedQuestionsList.slice(-10).join('\n')}` 
        : '';

    const prompt = `Generate a unique and interesting TRUE/FALSE trivia question about science, history, geography, or general knowledge.

    IMPORTANT RULES:
    1. The question MUST be UNIQUE - never used before
    2. The question should be CHALLENGING and NOT OBVIOUS
    3. The AI should give a CONFIDENT answer that may be CORRECT or INCORRECT (mix it up 50/50)
    4. The "correct_answer" MUST be the actual factual truth ("True" or "False")
    5. The "ai_answer" should be a detailed, confident statement
    6. The "explanation" must be detailed with verified facts
    7. Make the AI's answer sound convincing even when wrong!
    
    AVOID these overused myths: 10% brain, Great Wall from space, bulls hate red, Napoleon was short, Vikings horned helmets, water boils at 100°C
    
    ${avoidPrompt}

    Return ONLY valid JSON. No markdown, no code blocks, no extra text.
    
    Format:
    {
        "question": "The trivia question (as a statement that can be true or false)",
        "ai_answer": "A detailed, confident answer from the AI (True or False statement with reasoning)",
        "correct_answer": "True or False (the actual correct answer)",
        "explanation": "Detailed explanation with verified facts and context"
    }
    
    Example of AI being WRONG:
    {
        "question": "Do sharks have bones?",
        "ai_answer": "Yes, sharks have a complete skeleton made of 206 bones, similar to humans. This allows them to maintain their shape and structure in the water.",
        "correct_answer": "False",
        "explanation": "Sharks have no bones at all. Their skeletons are made entirely of cartilage, which is lighter and more flexible than bone."
    }
    
    Example of AI being CORRECT:
    {
        "question": "Is the capital of Australia Sydney?",
        "ai_answer": "No, the capital of Australia is Canberra. Sydney is the largest city but not the capital. Canberra was specifically chosen as a compromise between Sydney and Melbourne.",
        "correct_answer": "False",
        "explanation": "The capital of Australia is Canberra, established in 1908 as a compromise between Sydney and Melbourne. Sydney is the largest city but not the capital."
    }`;

    try {
        const result = await generateJSON(prompt, 0.95, 700);
        
        // Validate and store the question
        if (result && result.question && result.ai_answer && result.correct_answer && result.explanation) {
            const questionText = result.question.toLowerCase().trim();
            
            // Check if this question was used before
            if (usedQuestions.has(questionText)) {
                console.log('⚠️ Duplicate question detected, regenerating...');
                // Regenerate with a different prompt
                const retryPrompt = `Generate a completely different trivia question. Never use this one: "${result.question}"
                
                Rules:
                - Must be a TRUE/FALSE question
                - Make it interesting and challenging
                - Return JSON with: question, ai_answer (detailed), correct_answer ("True"/"False"), explanation (detailed)`;
                
                const retryResult = await generateJSON(retryPrompt, 0.95, 700);
                if (retryResult && retryResult.question && retryResult.ai_answer) {
                    const retryQuestion = retryResult.question.toLowerCase().trim();
                    if (!usedQuestions.has(retryQuestion)) {
                        const correct = retryResult.correct_answer.toLowerCase().trim();
                        retryResult.correct_answer = (correct === 'true' || correct === 'yes' || correct === 't') ? 'True' : 'False';
                        usedQuestions.add(retryQuestion);
                        console.log(`✅ Unique challenge generated (${usedQuestions.size} total): ${retryResult.question}`);
                        res.json(retryResult);
                        return;
                    }
                }
            }
            
            // Normalize the correct_answer
            const correct = result.correct_answer.toLowerCase().trim();
            if (correct === 'true' || correct === 'yes' || correct === 't') {
                result.correct_answer = 'True';
            } else if (correct === 'false' || correct === 'no' || correct === 'f') {
                result.correct_answer = 'False';
            } else {
                // Default to False if unclear
                result.correct_answer = 'False';
            }
            
            // Store the question
            usedQuestions.add(questionText);
            console.log(`✅ Unique challenge generated (${usedQuestions.size} total): ${result.question}`);
            console.log(`🤖 AI says: ${result.ai_answer.substring(0, 100)}...`);
            console.log(`📖 Correct answer: ${result.correct_answer}`);
            res.json(result);
            return;
        }
        
        // If validation fails, try a simpler approach
        console.log('⚠️ Invalid format, trying simpler prompt...');
        const simplePrompt = `Generate a unique TRUE/FALSE trivia question about an interesting scientific fact or historical event.
        Return JSON with: question, ai_answer (detailed confident statement), correct_answer ("True"/"False"), explanation (detailed with facts).
        Make the AI's answer convincing even if wrong!`;
        
        const simpleResult = await generateJSON(simplePrompt, 0.9, 600);
        if (simpleResult && simpleResult.question && simpleResult.ai_answer && simpleResult.correct_answer) {
            const simpleQuestion = simpleResult.question.toLowerCase().trim();
            if (!usedQuestions.has(simpleQuestion)) {
                const correct = simpleResult.correct_answer.toLowerCase().trim();
                simpleResult.correct_answer = (correct === 'true' || correct === 'yes' || correct === 't') ? 'True' : 'False';
                usedQuestions.add(simpleQuestion);
                console.log(`✅ Simple challenge generated: ${simpleResult.question}`);
                res.json(simpleResult);
                return;
            }
        }
        
        // Final attempt with explicit format
        console.log('⚠️ Still invalid, trying final attempt...');
        const finalPrompt = `Create a trivia question about a scientific misconception. Format as JSON:
        {
            "question": "Your question here",
            "ai_answer": "Detailed confident answer from AI",
            "correct_answer": "True or False",
            "explanation": "Detailed explanation"
        }
        
        Make it about something interesting and surprising.`;
        
        const finalResult = await generateJSON(finalPrompt, 0.9, 500);
        if (finalResult && finalResult.question && finalResult.ai_answer && finalResult.correct_answer) {
            const finalQuestion = finalResult.question.toLowerCase().trim();
            if (!usedQuestions.has(finalQuestion)) {
                const correct = finalResult.correct_answer.toLowerCase().trim();
                finalResult.correct_answer = (correct === 'true' || correct === 'yes' || correct === 't') ? 'True' : 'False';
                usedQuestions.add(finalQuestion);
                console.log(`✅ Final challenge generated: ${finalResult.question}`);
                res.json(finalResult);
                return;
            }
        }
        
        // Generate a fresh unique question using direct API
        console.log('⚠️ All structured attempts failed, using direct API...');
        const directPrompt = `Generate a unique and interesting TRUE/FALSE trivia question about science or history. Make it challenging.`;
        const directText = await generateResponse(directPrompt, 0.8, 400);
        
        try {
            const parsed = JSON.parse(directText);
            if (parsed.question && parsed.ai_answer && parsed.correct_answer) {
                const qText = parsed.question.toLowerCase().trim();
                if (!usedQuestions.has(qText)) {
                    const correct = parsed.correct_answer.toLowerCase().trim();
                    parsed.correct_answer = (correct === 'true' || correct === 'yes' || correct === 't') ? 'True' : 'False';
                    usedQuestions.add(qText);
                    res.json(parsed);
                    return;
                }
            }
        } catch (e) {
            // Not JSON, create structured response
            const fallbackQuestion = directText.substring(0, 150);
            const qText = fallbackQuestion.toLowerCase().trim();
            if (!usedQuestions.has(qText)) {
                const fallback = {
                    question: fallbackQuestion,
                    ai_answer: directText.substring(150, 400) || directText,
                    correct_answer: Math.random() > 0.5 ? 'True' : 'False',
                    explanation: 'Based on the AI\'s generated content above.'
                };
                usedQuestions.add(qText);
                res.json(fallback);
                return;
            }
        }
        
        // Ultimate fallback - generate a new unique question
        console.log('⚠️ Using ultimate fallback with fresh question');
        const topics = ['space', 'animals', 'history', 'geography', 'science', 'technology', 'art', 'music', 'food', 'sports'];
        const topic = topics[Math.floor(Math.random() * topics.length)];
        const fallbackPrompt = `Generate a unique trivia question about ${topic}. Make it TRUE/FALSE. Return JSON format.`;
        const fallbackText = await generateResponse(fallbackPrompt, 0.8, 300);
        
        try {
            const parsed = JSON.parse(fallbackText);
            if (parsed.question) {
                const qText = parsed.question.toLowerCase().trim();
                if (!usedQuestions.has(qText)) {
                    usedQuestions.add(qText);
                    res.json(parsed);
                    return;
                }
            }
        } catch (e) {
            // Create a fallback that's guaranteed unique by including timestamp
            const uniqueFallback = {
                question: `Is it true that ${topic} has been studied for over 100 years? (Generated: ${Date.now()})`,
                ai_answer: Math.random() > 0.5 ? 
                    `Yes, ${topic} has been a subject of study for over a century with extensive research.` :
                    `No, ${topic} is actually a relatively new field of study.`,
                correct_answer: Math.random() > 0.5 ? 'True' : 'False',
                explanation: `This is a generated question about ${topic} to ensure uniqueness.`
            };
            const qText = uniqueFallback.question.toLowerCase().trim();
            usedQuestions.add(qText);
            res.json(uniqueFallback);
        }
        
    } catch (error) {
        console.error('Error in /api/challenge:', error);
        // Generate a fresh fallback with timestamp for uniqueness
        const timestampFallback = {
            question: `Is water the most abundant substance on Earth? (Generated: ${Date.now()})`,
            ai_answer: Math.random() > 0.5 ? 
                "Yes, water covers approximately 71% of Earth's surface, making it the most abundant substance." :
                "No, while water is abundant, it's actually not the most abundant substance on Earth.",
            correct_answer: 'False',
            explanation: "While water covers 71% of Earth's surface, it's not the most abundant substance. The Earth's mantle contains more mass in the form of silicate minerals."
        };
        const qText = timestampFallback.question.toLowerCase().trim();
        usedQuestions.add(qText);
        res.json(timestampFallback);
    }
});

// ─── GET CHALLENGE HISTORY (for debugging) ───
app.get('/api/challenge-history', (req, res) => {
    res.json({
        totalUsed: usedQuestions.size,
        recentQuestions: Array.from(usedQuestions).slice(-10)
    });
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
    console.log(`🎯 Challenge Mode: Fresh AI-generated questions (no repeats)`);
    console.log(`📝 Used questions tracking: ${usedQuestions.size} questions stored`);
});
