const Form = require('./models/Form');
const Questionnaire = require('./models/Questionnaire');
const Question = require('./models/Quetions');
const Option = require('./models/Options');

// Translation service - using mock for now, replace with Google Translate API
async function translateText(text, targetLanguage) {
    try {
        // Mock translation for testing - replace with actual Google Translate API
        const mockTranslations = {
            'hi': `${text} [Hindi]`,
            'es': `${text} [Spanish]`
        };
        
        // Simulate API delay
        await new Promise(resolve => setTimeout(resolve, 100));
        
        return mockTranslations[targetLanguage] || text;
    } catch (error) {
        console.error('Translation error:', error);
        return text;
    }
}

// Create form with questions and auto-translate
async function createFormWithQuestions(formTitle, questionsData) {
    try {
        // 1. Create Form
        const form = new Form({ title: formTitle });
        await form.save();

        // 2. Create Questionnaire entries for each question group
        const results = [];
        
        for (const questionData of questionsData) {
            // Create questionnaire entry (common ID for all translations)
            const questionnaire = new Questionnaire({ 
                form_id: form._id.toString() 
            });
            await questionnaire.save();

            // 3. Create questions in all languages
            const languages = ['en', 'hi', 'es'];
            const questionGroup = [];

            for (const lang of languages) {
                let questionText = questionData.question_text;
                
                // Translate if not English
                if (lang !== 'en') {
                    questionText = await translateText(questionData.question_text, lang);
                }

                const question = new Question({
                    questionnaire_id: questionnaire._id.toString(),
                    question_text: questionText,
                    language: lang,
                    question_type: questionData.question_type
                });
                
                await question.save();
                questionGroup.push(question);

                // 4. Create options if provided
                if (questionData.options && questionData.options.length > 0) {
                    for (let i = 0; i < questionData.options.length; i++) {
                        let optionText = questionData.options[i];
                        
                        // Translate option if not English
                        if (lang !== 'en') {
                            optionText = await translateText(questionData.options[i], lang);
                        }

                        const option = new Option({
                            question_id: question._id,
                            option_text: optionText,
                            sort_order: i
                        });
                        
                        await option.save();
                    }
                }
            }

            results.push({
                questionnaire_id: questionnaire._id,
                questions: questionGroup
            });
        }

        return {
            form,
            questionnaires: results
        };
    } catch (error) {
        console.error('Error creating form with questions:', error);
        throw error;
    }
}

// Get form with all questions by language
async function getFormQuestions(formId, language = 'en') {
    try {
        const form = await Form.findById(formId);
        if (!form) throw new Error('Form not found');

        const questionnaires = await Questionnaire.find({ form_id: formId.toString() });
        const questionnaireIds = questionnaires.map(q => q._id.toString());

        const questions = await Question.find({
            questionnaire_id: { $in: questionnaireIds },
            language: language,
            is_approved: true,
            status: 'approved'
        }).sort({ createdAt: 1 });

        const questionsWithOptions = await Promise.all(questions.map(async (question) => {
            const options = await Option.find({ 
                question_id: question._id 
            }).sort({ sort_order: 1 });

            return {
                id: question._id.toString(),
                questionnaire_id: question.questionnaire_id,
                question: question.question_text,
                type: question.question_type,
                language: question.language,
                options: options.map(opt => opt.option_text)
            };
        }));

        return {
            form,
            questions: questionsWithOptions
        };
    } catch (error) {
        console.error('Error getting form questions:', error);
        throw error;
    }
}

module.exports = {
    createFormWithQuestions,
    getFormQuestions,
    translateText
};