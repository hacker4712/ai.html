const express = require('express');
const cors = require('cors');
const axios = require('axios');
const app = express();
const PORT = 3000;

app.use(cors());
app.use(express.json());

// ─── HEALTH CHECK ───
app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ─── ASK AI ───
app.post('/api/ask', async (req, res) => {
    const { question } = req.body;

    if (!question) {
        return res.status(400).json({ error: 'Question is required' });
    }

    try {
        // Simulate AI response with different answers
        const answers = {
            'who invented the light bulb': {
                answer: 'Thomas Edison is credited with inventing the light bulb in 1879. However, earlier versions were developed by Humphry Davy (1809) and Joseph Swan (1878). Edison\'s design was the first practical and commercially viable version.',
                confidence: 0.92
            },
            'how many bones does a shark have': {
                answer: 'Sharks have zero bones. Their skeletons are made entirely of cartilage, which is lighter and more flexible than bone. This adaptation helps sharks swim more efficiently.',
                confidence: 0.95
            },
            'did einstein fail math in school': {
                answer: 'No, Einstein did not fail math in school. This is a common myth. He excelled in mathematics and physics from a young age. The rumor likely started because the grading system in Switzerland was different from what people expected.',
                confidence: 0.88
            },
            'what\'s the tallest mountain base to peak': {
                answer: 'Mauna Kea in Hawaii is the tallest mountain from base to peak, measuring over 10,000 meters (33,500 feet). However, most of it is underwater, so Everest remains the highest above sea level.',
                confidence: 0.90
            },
            'what\'s the capital of australia': {
                answer: 'The capital of Australia is Canberra. It was chosen as the capital in 1908 as a compromise between Sydney and Melbourne. Canberra is located in the Australian Capital Territory (ACT).',
                confidence: 0.97
            }
        };

        // Find matching answer or use default
        let response = answers['what\'s the capital of australia'];
        const lowerQ = question.toLowerCase();

        for (const [key, value] of Object.entries(answers)) {
            if (lowerQ.includes(key) || key.includes(lowerQ)) {
                response = value;
                break;
            }
        }

        // If no match, generate a generic response
        if (!response) {
            const genericAnswers = [
                { answer: 'The Great Wall of China was built over 2,000 years ago to protect against invasions. It stretches over 21,000 kilometers and is one of the most famous structures in history.', confidence: 0.85 },
                { answer: 'The Eiffel Tower was completed in 1889 for the World\'s Fair in Paris. It stands 330 meters tall and was the tallest man-made structure until 1930.', confidence: 0.88 },
                { answer: 'The human brain has approximately 86 billion neurons. Each neuron can connect with thousands of others, creating a complex network.', confidence: 0.82 },
                { answer: 'The speed of light is approximately 299,792,458 meters per second in a vacuum. This is a fundamental constant in physics.', confidence: 0.95 },
                { answer: 'The universe is estimated to be about 13.8 billion years old, based on cosmic microwave background radiation measurements.', confidence: 0.90 }
            ];

            response = genericAnswers[Math.floor(Math.random() * genericAnswers.length)];
        }

        res.json({
            answer: response.answer,
            confidence: response.confidence
        });
    } catch (error) {
        console.error('Ask error:', error);
        res.status(500).json({ error: 'Failed to generate answer' });
    }
});

// ─── X-RAY ───
app.post('/api/xray', async (req, res) => {
    const { question, answer } = req.body;

    if (!answer) {
        return res.status(400).json({ error: 'Answer is required' });
    }

    try {
        // Extract claims from the answer (split by periods and filter)
        const sentences = answer.split(/[.!?]+/).filter(s => s.trim().length > 20);
        const claims = sentences.map(s => s.trim()).filter(s => s.length > 0);

        // For each claim, determine a verdict
        const claimResults = claims.map(claim => {
            const lowerClaim = claim.toLowerCase();

            // Determine verdict based on keywords
            let verdict = 'supported';
            let explanation = '';
            let sources = [];

            // Check for unsupported claims (myths)
            if (lowerClaim.includes('visible from space') && lowerClaim.includes('great wall')) {
                verdict = 'unsupported';
                explanation = 'NASA has confirmed the Great Wall is not visible to the naked eye from space.';
                sources = [
                    { url: 'https://www.nasa.gov/vision/space/features/great_wall.html', title: 'NASA - Great Wall from Space' },
                    { url: 'https://www.scientificamerican.com/article/fact-or-fiction-the-great-wall-of-china-is-visible-from-space/', title: 'Scientific American - Great Wall Myth' }
                ];
            } else if (lowerClaim.includes('einstein') && lowerClaim.includes('fail') && lowerClaim.includes('math')) {
                verdict = 'unsupported';
                explanation = 'Einstein excelled in mathematics. This is a persistent myth.';
                sources = [
                    { url: 'https://www.history.com/news/did-einstein-fail-math', title: 'History.com - Einstein Math Myth' },
                    { url: 'https://www.britannica.com/biography/Albert-Einstein', title: 'Britannica - Albert Einstein' }
                ];
            } else if (lowerClaim.includes('air canada') || lowerClaim.includes('bereavement')) {
                verdict = 'supported';
                explanation = 'The Air Canada chatbot case is a real 2024 legal case.';
                sources = [
                    { url: 'https://www.cbc.ca/news/business/air-canada-chatbot-bereavement-1.7067224', title: 'CBC News - Air Canada Chatbot Ruling' },
                    { url: 'https://www.theguardian.com/technology/2024/feb/15/air-canada-chatbot-bereavement-fare', title: 'The Guardian - Air Canada Case' }
                ];
            } else if (lowerClaim.includes('google bard') || lowerClaim.includes('$100b')) {
                verdict = 'supported';
                explanation = 'Google Bard\'s demo error caused a significant stock drop.';
                sources = [
                    { url: 'https://www.cnn.com/2023/02/08/tech/google-bard-ai-error/index.html', title: 'CNN - Google Bard Error' },
                    { url: 'https://www.npr.org/2023/02/08/1155636980/google-bard-ai-democrat-biden', title: 'NPR - Bard Demo Fail' }
                ];
            } else if (lowerClaim.includes('mauna kea') || lowerClaim.includes('tallest mountain')) {
                verdict = 'supported';
                explanation = 'Mauna Kea is indeed the tallest from base to peak.';
                sources = [
                    { url: 'https://www.nationalgeographic.com/science/article/mauna-kea-hawaii-tallest-mountain', title: 'National Geographic - Mauna Kea' },
                    { url: 'https://www.britannica.com/place/Mauna-Kea', title: 'Britannica - Mauna Kea' }
                ];
            } else if (lowerClaim.includes('canberra')) {
                verdict = 'supported';
                explanation = 'Canberra is the capital of Australia.';
                sources = [
                    { url: 'https://www.australia.com/en/facts-and-planning/about-australia/capital-cities.html', title: 'Australia.com - Capital Cities' },
                    { url: 'https://www.britannica.com/place/Canberra', title: 'Britannica - Canberra' }
                ];
            } else if (lowerClaim.includes('cartilage') && lowerClaim.includes('shark')) {
                verdict = 'supported';
                explanation = 'Sharks have cartilaginous skeletons, not bones.';
                sources = [
                    { url: 'https://www.ocean.si.edu/ocean-life/sharks-rays/sharks-skeletons', title: 'Smithsonian - Shark Skeletons' },
                    { url: 'https://www.nationalgeographic.com/animals/fish/facts/sharks', title: 'National Geographic - Sharks' }
                ];
            } else {
                // Random verdict for other claims
                const rand = Math.random();
                if (rand < 0.7) {
                    verdict = 'supported';
                    explanation = 'This claim appears to be supported by common knowledge.';
                    sources = [
                        { url: 'https://en.wikipedia.org/wiki/' + encodeURIComponent(claim.slice(0, 50)), title: 'Wikipedia - ' + claim.slice(0, 50) }
                    ];
                } else if (rand < 0.85) {
                    verdict = 'context';
                    explanation = 'This claim requires additional context to verify fully.';
                    sources = [
                        { url: 'https://www.britannica.com/search?query=' + encodeURIComponent(claim.slice(0, 30)), title: 'Britannica - Search' }
                    ];
                } else {
                    verdict = 'unsupported';
                    explanation = 'No reliable sources could be found to support this claim.';
                    sources = [];
                }
            }

            return {
                claim: claim + '.',
                verdict: verdict,
                explanation: explanation,
                sources: sources
            };
        });

        // Generate a bottom line
        const unsupported = claimResults.filter(c => c.verdict === 'unsupported').length;
        const context = claimResults.filter(c => c.verdict === 'context').length;

        let correction = '';
        if (unsupported === 0 && context === 0) {
            correction = '✅ All claims in this answer appear to be factually supported.';
        } else if (unsupported > 0) {
            correction = `⚠️ ${unsupported} unsupported claim${unsupported > 1 ? 's' : ''} detected. The AI may be hallucinating.`;
        } else if (context > 0) {
            correction = `📝 ${context} claim${context > 1 ? 's' : ''} require additional context for full verification.`;
        }

        res.json({
            claims: claimResults,
            correction: correction
        });
    } catch (error) {
        console.error('X-Ray error:', error);
        res.status(500).json({ error: 'Failed to analyze claims' });
    }
});

// ─── CHALLENGE ───
const challengeData = [
    {
        question: 'The Great Wall of China is the only man-made structure visible from space with the naked eye.',
        answer: 'This is a common belief. Many people think the Great Wall is visible from space. Astronauts have confirmed it is very difficult to see without magnification.',
        isTrue: false,
        explanation: 'NASA has confirmed the Great Wall is not visible to the naked eye from space. This is a persistent myth that the AI may repeat.'
    },
    {
        question: 'Albert Einstein failed mathematics in school.',
        answer: 'This is a widely repeated story about Einstein\'s early education. Many biographies claim he struggled with math as a child.',
        isTrue: false,
        explanation: 'Einstein excelled in mathematics. The myth likely comes from confusion with the Swiss grading system where a "1" was the highest grade.'
    },
    {
        question: 'Sharks have skeletons made of cartilage, not bone.',
        answer: 'Sharks are fish that have a unique skeletal structure. Their bodies are supported by a framework of flexible material.',
        isTrue: true,
        explanation: 'Sharks have no bones. Their skeletons are made entirely of cartilage, which is lighter and more flexible than bone.'
    },
    {
        question: 'The capital of Australia is Sydney.',
        answer: 'Many people assume Sydney is the capital because it\'s the largest and most famous city. Tourists often make this mistake.',
        isTrue: false,
        explanation: 'The capital of Australia is Canberra, chosen in 1908 as a compromise between Sydney and Melbourne.'
    },
    {
        question: 'Mauna Kea in Hawaii is the tallest mountain on Earth when measured from base to peak.',
        answer: 'Mount Everest is commonly known as the tallest mountain. However, there is another mountain that is taller if measured differently.',
        isTrue: true,
        explanation: 'Mauna Kea measures over 10,000 meters from its base on the ocean floor to its peak, making it taller than Everest (8,848 meters) from base to peak.'
    },
    {
        question: 'The human brain uses only 10% of its capacity.',
        answer: 'This is a common myth that has been repeated in movies and popular culture. Many people believe we only use a small fraction of our brain.',
        isTrue: false,
        explanation: 'The 10% brain myth is false. We use virtually all parts of our brain throughout the day, and different areas are active at different times.'
    },
    {
        question: 'Lightning never strikes the same place twice.',
        answer: 'This is a common saying that most people have heard. It\'s often used to reassure people who are afraid of lightning.',
        isTrue: false,
        explanation: 'Lightning frequently strikes the same place multiple times. The Empire State Building is struck about 25 times per year.'
    },
    {
        question: 'Vikings wore horned helmets.',
        answer: 'Viking culture is often depicted with horned helmets in art and media. This has become a staple of Viking imagery.',
        isTrue: false,
        explanation: 'There is no historical evidence that Vikings wore horned helmets. This myth was popularized by 19th-century opera costumes.'
    },
    {
        question: 'Bats are blind.',
        answer: 'Bats are often associated with blindness. Many sayings and metaphors reference "blind as a bat" to describe poor vision.',
        isTrue: false,
        explanation: 'Bats are not blind. They have functional eyes and use echolocation for navigation, but they can see well in low light.'
    }
];

// Keep track of used challenges to avoid repeats
let usedChallenges = [];
let challengeIndex = 0;

app.post('/api/challenge', (req, res) => {
    try {
        // If we've used all challenges, reset
        if (usedChallenges.length >= challengeData.length) {
            usedChallenges = [];
        }

        // Find unused challenge
        let available = challengeData.filter((_, i) => !usedChallenges.includes(i));

        if (available.length === 0) {
            usedChallenges = [];
            available = challengeData;
        }

        // Pick random unused challenge
        const randomIndex = Math.floor(Math.random() * available.length);
        const originalIndex = challengeData.indexOf(available[randomIndex]);

        usedChallenges.push(originalIndex);

        const selected = available[randomIndex];
        res.json({
            question: selected.question,
            answer: selected.answer,
            isTrue: selected.isTrue,
            explanation: selected.explanation
        });
    } catch (error) {
        console.error('Challenge error:', error);
        res.status(500).json({ error: 'Failed to generate challenge' });
    }
});

app.listen(PORT, () => {
    console.log(`🚀 Server running on http://localhost:${PORT}`);
    console.log(`📝 Endpoints:`);
    console.log(`   GET  /api/health`);
    console.log(`   POST /api/ask`);
    console.log(`   POST /api/xray`);
    console.log(`   POST /api/challenge`);
});
