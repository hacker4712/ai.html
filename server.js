require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const { GoogleGenerativeAI } = require('@google/generative-ai');

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// ─── YOUR API KEY ───
const HARDCODED_KEY = 'AQ.Ab8RN6K0OwsfSP1RAB4Oabv9wJhOhltaY4GJLiTYijjcdahGVg';
const API_KEY = process.env.GOOGLE_API_KEY || HARDCODED_KEY;

if (!API_KEY) {
    console.error('❌ API Key is missing!');
} else {
    console.log('✅ API Key is configured');
}

// Initialize Gemini
const genAI = new GoogleGenerativeAI(API_KEY);

// ─── HELPER: Generate content with Gemini ───
async function generateGeminiResponse(prompt, temperature = 0.7, maxTokens = 500) {
    try {
        // ✅ USING CORRECT MODEL FOR THIS KEY
        const model = genAI.getGenerativeModel({ 
            model: 'gemini-1.5-pro',
            generationConfig: {
                temperature: temperature,
                maxOutputTokens: maxTokens,
            }
        });
        
        const result = await model.generateContent(prompt);
        const response = await result.response;
        return response.text();
    } catch (error) {
        console.error('Gemini API Error:', error);
        throw error;
    }
}

// ─── HELPER: Generate JSON from Gemini ───
async function generateGeminiJSON(prompt, temperature = 0.3, maxTokens = 800) {
    try {
        const model = genAI.getGenerativeModel({ 
            model: 'gemini-1.5-pro',
            generationConfig: {
                temperature: temperature,
                maxOutputTokens: maxTokens,
            }
        });
        
        const result = await model.generateContent(prompt);
        const response = await result.response;
        const text = response.text();
        
        const jsonMatch = text.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
            return JSON.parse(jsonMatch[0]);
        }
        return JSON.parse(text);
    } catch (error) {
        console.error('Gemini JSON Error:', error);
        throw error;
    }
}

// ─── HEALTH CHECK ───
app.get('/api/health', (req, res) => {
    res.json({ 
        status: 'ok', 
        message: 'Server is running with Gemini API',
        timestamp: new Date().toISOString(),
        apiKeySet: !!API_KEY,
        provider: 'Google Gemini',
        model: 'gemini-1.5-pro'
    });
});

// ─── ASK AI ───
app.post('/api/ask', async (req, res) => {
    const { question, mode } = req.body;
    
    if (!question) {
        return res.status(400).json({ error: 'Question is required' });
    }

    if (!API_KEY) {
        return res.status(500).json({ error: 'Google API key is not configured' });
    }

    let systemPrompt = 'You are a helpful assistant. Provide a concise answer. Avoid lengthy context.';
    if (mode === 'detailed') {
        systemPrompt = 'You are a helpful assistant. Provide a comprehensive, well-reasoned answer with context, evidence, and sources. If you are unsure, clearly state that you are unsure.';
    }

    try {
        const fullPrompt = `${systemPrompt}\n\nQuestion: ${question}`;
        const answer = await generateGeminiResponse(fullPrompt, 0.7, 500);
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

    if (!API_KEY) {
        return res.status(500).json({ error: 'Google API key is not configured' });
    }

    const prompt = `Analyze the following answer to the question "${question}" for factual accuracy and potential hallucinations.
    Break it down into individual claims. For each claim, classify it as "supported" (factually correct), "context" (needs more context or is partially true), or "unsupported" (hallucination / false).
    Provide a brief explanation for each classification.
    Return the result strictly as a JSON object with a "claims" array.
    Example: { "claims": [ { "text": "The sky is blue.", "status": "supported", "explain": "This is true due to Rayleigh scattering." } ] }
    Answer: "${answer}"`;

    try {
        const result = await generateGeminiJSON(prompt, 0.3, 800);
        res.json(result);
    } catch (error) {
        console.error('Error in /api/analyze:', error);
        res.status(500).json({ error: error.message || 'Failed to analyze answer' });
    }
});

// ─── GENERATE CHALLENGE ───
app.post('/api/challenge', async (req, res) => {
    if (!API_KEY) {
        return res.status(500).json({ error: 'Google API key is not configured' });
    }

    const prompt = `Generate a tricky multiple-choice question about a common AI hallucination or misconception.
    The AI has provided a confident but incorrect answer. Provide the question, the AI's wrong answer, the correct answer, and an explanation.
    Return strictly as JSON: { "question": "...", "ai_answer": "...", "correct_answer": "...", "explanation": "..." }`;

    try {
        const result = await generateGeminiJSON(prompt, 0.8, 600);
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
    console.log(`✅ API Provider: Google Gemini`);
    console.log(`✅ Model: gemini-1.5-pro`);
    console.log(`✅ API Key: ${API_KEY ? '✓ Set' : '✗ Missing'}`);
});
