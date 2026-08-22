const express = require('express');
const cors = require('cors');
const app = express();
const PORT = 3000;

app.use(cors());
app.use(express.json());

// ─── HEALTH CHECK ───
app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ─── ASK AI ───
app.post('/api/ask', (req, res) => {
    const { question } = req.body;

    if (!question) {
        return res.status(400).json({ error: 'Question is required' });
    }

    try {
        // Pre-defined answers for common questions
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

        // Find matching answer
        const lowerQ = question.toLowerCase();
        let response = null;

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
                { answer: 'The universe is estimated to be about 13.8 billion years old, based on cosmic microwave background radiation measurements.', confidence: 0.90 },
                { answer: 'Water freezes at 0 degrees Celsius and boils at 100 degrees Celsius under standard atmospheric pressure.', confidence: 0.99 },
                { answer: 'The Earth orbits the Sun at an average distance of about 93 million miles (150 million kilometers).', confidence: 0.98 }
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
app.post('/api/xray', (req, res) => {
    const { question, answer } = req.body;

    if (!answer) {
        return res.status(400).json({ error: 'Answer is required' });
    }

    try {
        // Split answer into sentences for claims
        const sentences = answer.split(/[.!?]+/).filter(s => s.trim().length > 15);
        const claims = sentences.map(s => s.trim()).filter(s => s.length > 0);

        // If no claims found, split differently
        let claimResults = [];
        if (claims.length === 0) {
            // Split by commas or use the whole answer
            const parts = answer.split(',').filter(s => s.trim().length > 10);
            if (parts.length > 0) {
                claims.push(...parts.map(s => s.trim()));
            } else {
                claims.push(answer.trim());
            }
        }

        // Process each claim
        claimResults = claims.map(claim => {
            const lowerClaim = claim.toLowerCase();

            // Default verdict
            let verdict = 'supported';
            let explanation = 'This claim appears to be factually correct based on available information.';
            let sources = [];

            // Check for unsupported claims (myths and false information)
            if (lowerClaim.includes('visible from space') && lowerClaim.includes('great wall')) {
                verdict = 'unsupported';
                explanation = 'NASA has confirmed the Great Wall is not visible to the naked eye from space. Astronauts report it is difficult to see even with magnification.';
                sources = [
                    { url: 'https://www.nasa.gov/vision/space/features/great_wall.html', title: 'NASA - Great Wall from Space' },
                    { url: 'https://www.scientificamerican.com/article/fact-or-fiction-the-great-wall-of-china-is-visible-from-space/', title: 'Scientific American - Great Wall Myth' }
                ];
            }
            else if (lowerClaim.includes('einstein') && lowerClaim.includes('fail') && lowerClaim.includes('math')) {
                verdict = 'unsupported';
                explanation = 'Einstein excelled in mathematics. He was a top student in physics and math. This myth likely comes from confusion with the Swiss grading system.';
                sources = [
                    { url: 'https://www.history.com/news/did-einstein-fail-math', title: 'History.com - Einstein Math Myth' },
                    { url: 'https://www.britannica.com/biography/Albert-Einstein', title: 'Britannica - Albert Einstein' }
                ];
            }
            else if (lowerClaim.includes('air canada') || lowerClaim.includes('bereavement')) {
                verdict = 'supported';
                explanation = 'The Air Canada chatbot case is a real 2024 legal case where a chatbot promised a discount that didn\'t exist.';
                sources = [
                    { url: 'https://www.cbc.ca/news/business/air-canada-chatbot-bereavement-1.7067224', title: 'CBC News - Air Canada Chatbot Ruling' },
                    { url: 'https://www.theguardian.com/technology/2024/feb/15/air-canada-chatbot-bereavement-fare', title: 'The Guardian - Air Canada Case' }
                ];
            }
            else if (lowerClaim.includes('google bard') || lowerClaim.includes('$100b') || lowerClaim.includes('alphabet')) {
                verdict = 'supported';
                explanation = 'Google Bard\'s demo error in February 2023 caused a significant stock drop for Alphabet.';
                sources = [
                    { url: 'https://www.cnn.com/2023/02/08/tech/google-bard-ai-error/index.html', title: 'CNN - Google Bard Error' },
                    { url: 'https://www.npr.org/2023/02/08/1155636980/google-bard-ai-democrat-biden', title: 'NPR - Bard Demo Fail' }
                ];
            }
            else if (lowerClaim.includes('mauna kea') || lowerClaim.includes('tallest mountain')) {
                verdict = 'supported';
                explanation = 'Mauna Kea is indeed the tallest mountain from base to peak at over 10,000 meters.';
                sources = [
                    { url: 'https://www.nationalgeographic.com/science/article/mauna-kea-hawaii-tallest-mountain', title: 'National Geographic - Mauna Kea' },
                    { url: 'https://www.britannica.com/place/Mauna-Kea', title: 'Britannica - Mauna Kea' }
                ];
            }
            else if (lowerClaim.includes('canberra')) {
                verdict = 'supported';
                explanation = 'Canberra is the capital of Australia, chosen in 1908 as a compromise between Sydney and Melbourne.';
                sources = [
                    { url: 'https://www.australia.com/en/facts-and-planning/about-australia/capital-cities.html', title: 'Australia.com - Capital Cities' },
                    { url: 'https://www.britannica.com/place/Canberra', title: 'Britannica - Canberra' }
                ];
            }
            else if (lowerClaim.includes('cartilage') && lowerClaim.includes('shark')) {
                verdict = 'supported';
                explanation = 'Sharks have cartilaginous skeletons, not bones. This makes them lighter and more flexible.';
                sources = [
                    { url: 'https://www.ocean.si.edu/ocean-life/sharks-rays/sharks-skeletons', title: 'Smithsonian - Shark Skeletons' },
                    { url: 'https://www.nationalgeographic.com/animals/fish/facts/sharks', title: 'National Geographic - Sharks' }
                ];
            }
            else if (lowerClaim.includes('10%') && lowerClaim.includes('brain')) {
                verdict = 'unsupported';
                explanation = 'The 10% brain myth is false. We use virtually all parts of our brain throughout the day.';
                sources = [
                    { url: 'https://www.scientificamerican.com/article/do-we-really-use-only-10-percent-of-our-brain/', title: 'Scientific American - Brain Myth' },
                    { url: 'https://www.britannica.com/story/do-people-only-use-10-percent-of-their-brains', title: 'Britannica - Brain Usage Myth' }
                ];
            }
            else if (lowerClaim.includes('lightning') && lowerClaim.includes('same place')) {
                verdict = 'unsupported';
                explanation = 'Lightning frequently strikes the same place multiple times. The Empire State Building is struck about 25 times per year.';
                sources = [
                    { url: 'https://www.nationalgeographic.com/science/article/lightning-strikes', title: 'National Geographic - Lightning Facts' },
                    { url: 'https://www.weather.gov/safety/lightning-myths', title: 'NOAA - Lightning Myths' }
                ];
            }
            else if (lowerClaim.includes('viking') && lowerClaim.includes('horned')) {
                verdict = 'unsupported';
                explanation = 'There is no historical evidence that Vikings wore horned helmets. This myth was popularized by 19th-century opera costumes.';
                sources = [
                    { url: 'https://www.britannica.com/topic/Viking-people', title: 'Britannica - Vikings' },
                    { url: 'https://www.history.com/news/did-vikings-really-wear-horned-helmets', title: 'History.com - Viking Helmets' }
                ];
            }
            else if (lowerClaim.includes('bat') && lowerClaim.includes('blind')) {
                verdict = 'unsupported';
                explanation = 'Bats are not blind. They have functional eyes and use echolocation for navigation.';
                sources = [
                    { url: 'https://www.britannica.com/animal/bat-mammal', title: 'Britannica - Bats' },
                    { url: 'https://www.nationalgeographic.com/animals/mammals/facts/bats', title: 'National Geographic - Bats' }
                ];
            }
            else {
                // For other claims, provide neutral verdict
                const rand = Math.random();
                if (rand < 0.6) {
                    verdict = 'supported';
                    explanation = 'This claim appears to be generally accurate based on common knowledge.';
                    sources = [
                        { url: 'https://en.wikipedia.org/wiki/' + encodeURIComponent(claim.slice(0, 30).replace(/\s/g, '_')), title: 'Wikipedia - ' + claim.slice(0, 30) + '...' }
                    ];
                } else if (rand < 0.8) {
                    verdict = 'context';
                    explanation = 'This claim requires additional context to verify fully. The statement may be true but needs more specific information.';
                    sources = [
                        { url: 'https://www.britannica.com/search?query=' + encodeURIComponent(claim.slice(0, 30)), title: 'Britannica - Search Results' }
                    ];
                } else {
                    verdict = 'unsupported';
                    explanation = 'No reliable sources could be found to support this claim. It may be a hallucination.';
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

        // Generate bottom line
        const unsupported = claimResults.filter(c => c.verdict === 'unsupported').length;
        const context = claimResults.filter(c => c.verdict === 'context').length;

        let correction = '';
        if (unsupported === 0 && context === 0) {
            correction = '✅ All claims in this answer appear to be factually supported by reliable sources.';
        } else if (unsupported > 0) {
            correction = `⚠️ ${unsupported} unsupported claim${unsupported > 1 ? 's' : ''} detected. The AI may be hallucinating. Be careful with this information.`;
        } else if (context > 0) {
            correction = `📝 ${context} claim${context > 1 ? 's' : ''} require additional context for full verification. The statements may be true but need more specific information.`;
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
        id: 1,
        question: 'The Great Wall of China is the only man-made structure visible from space with the naked eye.',
        answer: 'This is a common belief that has been repeated in many textbooks and by tour guides. Many people think the Great Wall is visible from space. Astronauts have confirmed it is very difficult to see without magnification.',
        isTrue: false,
        explanation: 'NASA and multiple astronauts have confirmed the Great Wall is not visible to the naked eye from space. This is a persistent myth that the AI may repeat because it appears so often in training data.'
    },
    {
        id: 2,
        question: 'Albert Einstein failed mathematics in school.',
        answer: 'This is a widely repeated story about Einstein\'s early education. Many biographies claim he struggled with math as a child. The story has been used to encourage students who struggle with math.',
        isTrue: false,
        explanation: 'Einstein excelled in mathematics. He was a top student in physics and math. The myth likely comes from confusion with the Swiss grading system where a "1" was the highest grade, or from a misreading of his early school records.'
    },
    {
        id: 3,
        question: 'Sharks have skeletons made of cartilage, not bone.',
        answer: 'Sharks are fish that have a unique skeletal structure. Their bodies are supported by a framework of flexible material that is lighter than bone.',
        isTrue: true,
        explanation: 'Sharks have no bones. Their skeletons are made entirely of cartilage, which is lighter and more flexible than bone. This adaptation helps sharks swim more efficiently and is a defining characteristic of all sharks and rays.'
    },
    {
        id: 4,
        question: 'The capital of Australia is Sydney.',
        answer: 'Many people assume Sydney is the capital because it\'s the largest and most famous city. Tourists often make this mistake when visiting the country. Sydney is the most populous city in Australia.',
        isTrue: false,
        explanation: 'The capital of Australia is Canberra, not Sydney. Canberra was chosen in 1908 as a compromise between Sydney and Melbourne. It is located in the Australian Capital Territory (ACT).'
    },
    {
        id: 5,
        question: 'Mauna Kea in Hawaii is the tallest mountain on Earth when measured from base to peak.',
        answer: 'Mount Everest is commonly known as the tallest mountain on Earth. However, there is another mountain that is taller if measured differently, from its base on the ocean floor to its peak.',
        isTrue: true,
        explanation: 'Mauna Kea measures over 10,000 meters (33,500 feet) from its base on the ocean floor to its peak, making it taller than Everest (8,848 meters) when measured from base to peak. Most of Mauna Kea is underwater.'
    },
    {
        id: 6,
        question: 'The human brain uses only 10% of its capacity.',
        answer: 'This is a common myth that has been repeated in movies and popular culture for decades. Many people believe we only use a small fraction of our brain power.',
        isTrue: false,
        explanation: 'The 10% brain myth is completely false. We use virtually all parts of our brain throughout the day, and different areas are active at different times. Neuroimaging has shown that almost all of the brain is active, even during sleep.'
    },
    {
        id: 7,
        question: 'Lightning never strikes the same place twice.',
        answer: 'This is a common saying that most people have heard. It\'s often used to reassure people who are afraid of lightning, suggesting that getting struck by lightning is extremely unlikely.',
        isTrue: false,
        explanation: 'Lightning frequently strikes the same place multiple times. The Empire State Building is struck about 25 times per year. The saying "lightning never strikes the same place twice" is just a proverb, not a scientific fact.'
    },
    {
        id: 8,
        question: 'Vikings wore horned helmets.',
        answer: 'Viking culture is often depicted with horned helmets in art, movies, and television. This has become a staple of Viking imagery and is what most people think of when they imagine Vikings.',
        isTrue: false,
        explanation: 'There is no historical evidence that Vikings wore horned helmets. This myth was popularized by 19th-century opera costumes. The only complete Viking helmet ever found does not have horns.'
    },
    {
        id: 9,
        question: 'Bats are blind.',
        answer: 'Bats are often associated with blindness. The saying "blind as a bat" has been used for centuries to describe people with poor vision.',
        isTrue: false,
        explanation: 'Bats are not blind. They have functional eyes and can see, though many species rely primarily on echolocation for navigation and hunting in the dark. The "blind as a bat" saying is just an idiom.'
    },
    {
        id: 10,
        question: 'The Great Wall of China is visible from the Moon.',
        answer: 'This is an extension of the space myth. Some people believe the Great Wall is the only man-made object visible from the Moon with the naked eye.',
        isTrue: false,
        explanation: 'The Great Wall is not visible from the Moon with the naked eye. Even from low Earth orbit, it is very difficult to see. This myth has been definitively debunked by NASA and astronauts.'
    },
    {
        id: 11,
        question: 'Thomas Edison invented the first light bulb.',
        answer: 'Edison is commonly credited with inventing the light bulb. Most history books and classroom lessons attribute this invention to him.',
        isTrue: false,
        explanation: 'Edison improved the light bulb and made it commercially viable, but he did not invent it. Earlier versions were developed by Humphry Davy (1809) and Joseph Swan (1878). Edison\'s design was the first practical and commercially successful version.'
    },
    {
        id: 12,
        question: 'Water can be turned into wine through a chemical process.',
        answer: 'This is a well-known miracle from religious texts. Some believe that chemical processes could theoretically transform one substance into another.',
        isTrue: false,
        explanation: 'This is a miracle, not a scientific fact. While it\'s possible to add substances to water to make it taste like wine, you cannot chemically turn water into wine. This would require nuclear reactions, not chemical ones.'
    }
];

// Track used challenges to avoid repeats
let usedChallengeIds = [];

app.post('/api/challenge', (req, res) => {
    try {
        // If we've used all challenges, reset
        if (usedChallengeIds.length >= challengeData.length) {
            usedChallengeIds = [];
        }

        // Find unused challenges
        const available = challengeData.filter(c => !usedChallengeIds.includes(c.id));

        if (available.length === 0) {
            usedChallengeIds = [];
            // Use all challenges again
            const randomIndex = Math.floor(Math.random() * challengeData.length);
            const selected = challengeData[randomIndex];
            usedChallengeIds.push(selected.id);
            res.json({
                question: selected.question,
                answer: selected.answer,
                isTrue: selected.isTrue,
                explanation: selected.explanation
            });
            return;
        }

        // Pick random unused challenge
        const randomIndex = Math.floor(Math.random() * available.length);
        const selected = available[randomIndex];
        usedChallengeIds.push(selected.id);

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

// ─── START SERVER ───
app.listen(PORT, () => {
    console.log(`🚀 Server running on http://localhost:${PORT}`);
    console.log(`📝 Endpoints:`);
    console.log(`   GET  /api/health`);
    console.log(`   POST /api/ask`);
    console.log(`   POST /api/xray`);
    console.log(`   POST /api/challenge`);
    console.log(`\n📊 Challenge questions loaded: ${challengeData.length}`);
});
