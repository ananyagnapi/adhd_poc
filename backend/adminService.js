const { Translate } = require('@google-cloud/translate').v2;

// --- Google Cloud Translate Setup ---
const translateClient = new Translate({
  projectId: process.env.GOOGLE_CLOUD_PROJECT_ID,
  credentials: {
    client_email: process.env.GOOGLE_CLOUD_CLIENT_EMAIL,
    private_key: process.env.GOOGLE_CLOUD_PRIVATE_KEY?.replace(/\\n/g, '\n')
  }
});

// --- Questions ---
let questions = [
    { 
        id: "0", 
        question: "How often do you find it difficult to focus on a task when there are distractions around you?", 
        type: "options", 
        options: ["Never", "Rarely", "Sometimes", "Often", "Very Often"],
        translations: {
            es: { question: "¿Con qué frecuencia te resulta difícil concentrarte en una tarea cuando hay distracciones a tu alrededor?", options: ["Nunca", "Raramente", "A veces", "A menudo", "Muy a menudo"], approved: false },
            hi: { question: "आपके आसपास विकर्षण होने पर किसी कार्य पर ध्यान केंद्रित करना कितनी बार कठिन लगता है?", options: ["कभी नहीं", "शायद ही कभी", "कभी कभी", "अक्सर", "बहुत अक्सर"], approved: false }
        }
    },
    { 
        id: "1", 
        question: "How often do you forget appointments or important dates?", 
        type: "options", 
        options: ["Never", "Rarely", "Sometimes", "Often", "Very Often"],
        translations: {
            es: { question: "¿Con qué frecuencia olvidas citas o fechas importantes?", options: ["Nunca", "Raramente", "A veces", "A menudo", "Muy a menudo"], approved: false },
            hi: { question: "आप कितनी बार अपॉइंटमेंट या महत्वपूर्ण तारीखें भूल जाते हैं?", options: ["कभी नहीं", "शायद ही कभी", "कभी कभी", "अक्सर", "बहुत अक्सर"], approved: false }
        }
    }
];

// Helper function to get next available ID
function getNextQuestionId() {
    const maxId = questions.length > 0 ? Math.max(...questions.map(q => parseInt(q.id))) : -1;
    return (maxId + 1).toString();
}

const adminRoutes = (app) => {
    // Admin endpoints for question management
    app.get('/api/admin/questions', (req, res) => {
        res.json(questions);
    });

    app.post('/api/admin/questions', async (req, res) => {
        const { question, type, options, language } = req.body;
        
        if (!question || !question.trim()) {
            return res.status(400).json({ error: 'Question is required' });
        }

        if (type === 'options' && (!options || !Array.isArray(options) || options.length < 2)) {
            return res.status(400).json({ error: 'Options-based questions require at least 2 options' });
        }

        const newQuestion = {
            id: getNextQuestionId(),
            question: question.trim(),
            type: type || 'options'
        };

        if (type === 'options') {
            newQuestion.options = options.map(opt => opt.trim()).filter(opt => opt.length > 0);
        }

        // Auto-translate to other languages if adding in English
        if (language === 'en') {
            newQuestion.translations = {};
            try {
                // Translate to Spanish
                const [esQuestion] = await translateClient.translate(newQuestion.question, 'es');
                newQuestion.translations.es = { question: esQuestion, approved: false };
                
                if (newQuestion.options) {
                    const [esOptions] = await translateClient.translate(newQuestion.options, 'es');
                    newQuestion.translations.es.options = esOptions;
                }

                // Translate to Hindi
                const [hiQuestion] = await translateClient.translate(newQuestion.question, 'hi');
                newQuestion.translations.hi = { question: hiQuestion, approved: false };
                
                if (newQuestion.options) {
                    const [hiOptions] = await translateClient.translate(newQuestion.options, 'hi');
                    newQuestion.translations.hi.options = hiOptions;
                }
            } catch (error) {
                console.error('Translation error:', error);
            }
        }

        questions.push(newQuestion);
        res.status(201).json(newQuestion);
    });

    app.put('/api/admin/questions/:id', async (req, res) => {
        const { id } = req.params;
        const { question, type, options, language } = req.body;
        
        if (!question || !question.trim()) {
            return res.status(400).json({ error: 'Question is required' });
        }

        if (type === 'options' && (!options || !Array.isArray(options) || options.length < 2)) {
            return res.status(400).json({ error: 'Options-based questions require at least 2 options' });
        }

        const questionIndex = questions.findIndex(q => q.id === id.split('_')[0]);
        if (questionIndex === -1) {
            return res.status(404).json({ error: 'Question not found' });
        }

        const targetLanguage = language || 'en';
        
        if (targetLanguage === 'en') {
            questions[questionIndex].question = question.trim();
            questions[questionIndex].type = type || 'options';
            if (type === 'options') {
                questions[questionIndex].options = options.map(opt => opt.trim()).filter(opt => opt.length > 0);
            }
            
            // Auto-translate updated English question
            try {
                const [esQuestion] = await translateClient.translate(question.trim(), 'es');
                if (!questions[questionIndex].translations) questions[questionIndex].translations = {};
                questions[questionIndex].translations.es = { question: esQuestion, approved: false };
                
                if (type === 'options') {
                    const [esOptions] = await translateClient.translate(questions[questionIndex].options, 'es');
                    questions[questionIndex].translations.es.options = esOptions;
                }

                const [hiQuestion] = await translateClient.translate(question.trim(), 'hi');
                questions[questionIndex].translations.hi = { question: hiQuestion, approved: false };
                
                if (type === 'options') {
                    const [hiOptions] = await translateClient.translate(questions[questionIndex].options, 'hi');
                    questions[questionIndex].translations.hi.options = hiOptions;
                }
            } catch (error) {
                console.error('Translation error:', error);
            }
        } else {
            if (!questions[questionIndex].translations) {
                questions[questionIndex].translations = {};
            }
            questions[questionIndex].translations[targetLanguage] = {
                question: question.trim(),
                approved: false
            };
            if (type === 'options') {
                questions[questionIndex].translations[targetLanguage].options = options.map(opt => opt.trim()).filter(opt => opt.length > 0);
            }
        }

        res.json(questions[questionIndex]);
    });

    app.post('/api/admin/questions/:id/approve', (req, res) => {
        const { id } = req.params;
        const { language } = req.body;
        
        const question = questions.find(q => q.id === id);
        if (!question) {
            return res.status(404).json({ error: 'Question not found' });
        }

        if (question.translations && question.translations[language]) {
            question.translations[language].approved = true;
        }
        
        res.json({ message: 'Translation approved', question });
    });

    app.delete('/api/admin/questions/:id', (req, res) => {
        const { id } = req.params;
        const questionIndex = questions.findIndex(q => q.id === id);
        
        if (questionIndex === -1) {
            return res.status(404).json({ error: 'Question not found' });
        }

        const deletedQuestion = questions.splice(questionIndex, 1)[0];
        
        // Reorder IDs to maintain sequence
        questions.forEach((q, index) => {
            q.id = index.toString();
        });
        
        res.json({ message: 'Question deleted in all languages', deletedQuestion });
    });
};

module.exports = { adminRoutes, questions };