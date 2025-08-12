const { Translate } = require('@google-cloud/translate').v2;
const Questionnaire = require('./models/Questionnaire');
const Question = require('./models/Quetions'); 
const Option = require('./models/Options');

const translateClient = new Translate({
  projectId: process.env.GOOGLE_CLOUD_PROJECT_ID,
  credentials: {
    client_email: process.env.GOOGLE_CLOUD_CLIENT_EMAIL,
    private_key: process.env.GOOGLE_CLOUD_PRIVATE_KEY?.replace(/\\n/g, '\n')
  }
});

// Supported languages
const SUPPORTED_LANGUAGES = ['en', 'es', 'hi', 'fr'];

// Function to detect language of the input text
const detectLanguage = async (text) => {
  try {
    const [detection] = await translateClient.detect(text);
    const detectedLang = detection.language;
    
    // Map detected language to our supported ones
    const languageMap = {
      'en': 'en',
      'es': 'es', 
      'hi': 'hi',
      'fr': 'fr'
    };
    
    return languageMap[detectedLang] || 'en'; // Default to English if not supported
  } catch (error) {
    console.error('Language detection failed:', error);
    return 'en'; // Default to English on error
  }
};

const adminRoutes = (app) => {

  app.get('/api/admin/questions', async (req, res) => {
    try {
      const allQuestions = await Question.find();
      
      // Populate with options for each question
      const questionsWithOptions = await Promise.all(allQuestions.map(async (question) => {
        const options = await Option.find({ question_id: question._id }).sort({ sort_order: 1 });
        return {
          ...question.toObject(),
          options: options.map(opt => opt.option_text)
        };
      }));
      
      res.json(questionsWithOptions);
    } catch (err) {
      console.error('Failed to fetch questions:', err);
      res.status(500).json({ error: 'Failed to fetch questions' });
    }
  });

  app.post('/api/admin/questions', async (req, res) => {
    const { title, question, type = 'options', options = [] } = req.body;
    console.log("Request body:", req.body);

    // Validation
    if (!title?.trim()) {
        return res.status(400).json({ error: 'Questionnaire title is required' });
    }

    if (!question?.trim()) {
        return res.status(400).json({ error: 'Question is required' });
    }

    if (type === 'options' && (!Array.isArray(options) || options.length < 2)) {
        return res.status(400).json({ error: 'Options-based questions require at least 2 options' });
    }

    try {
        // 🔸 Step 1: Detect the language of the input question
        const detectedLanguage = await detectLanguage(question.trim());
        console.log(`Detected language: ${detectedLanguage} for question: "${question.trim()}"`);

        // 🔸 Step 2: Create questionnaire first
        const questionnaireDoc = await Questionnaire.create({ title: title.trim() });
        const qid = questionnaireDoc._id;

        // 🔸 Step 3: Create base question data template
        const baseQuestionData = {
            question_type: type,
            created_at: new Date().toISOString(),
            created_by: null,
            updated_by: null,
            qid: qid
        };

        // 🔸 Step 4: Create questions for all languages
        const createdQuestions = [];

        for (const langCode of SUPPORTED_LANGUAGES) {
            let questionText = question.trim();
            let questionOptions = [...options];
            
            // Translate if not the detected language
            if (langCode !== detectedLanguage) {
                try {
                    // Translate question text
                    const [translatedQuestion] = await translateClient.translate(question.trim(), {
                        from: detectedLanguage,
                        to: langCode
                    });
                    questionText = translatedQuestion;

                    // Translate options if applicable
                    if (type === 'options' && options.length > 0) {
                        const [translatedOptions] = await translateClient.translate(options, {
                            from: detectedLanguage,
                            to: langCode
                        });
                        questionOptions = Array.isArray(translatedOptions) ? translatedOptions : [translatedOptions];
                    }
                } catch (translateError) {
                    console.error(`Translation failed for language ${langCode}:`, translateError);
                    questionText = `Translation pending for ${langCode}`;
                    questionOptions = options.map(() => `Translation pending for ${langCode}`);
                }
            }

            // 🔸 Step 5: Create question document for this language
            const questionDoc = new Question({
                ...baseQuestionData,
                question_text: questionText,
                language: langCode,
                is_approved: langCode === detectedLanguage, // Only detected language is approved by default
                status: langCode === detectedLanguage ? 'approved' : 'pending'
            });

            await questionDoc.save();
            createdQuestions.push(questionDoc);

            // 🔸 Step 6: Create options for this language (if applicable)
            if (type === 'options' && questionOptions.length > 0) {
                const optionDocs = questionOptions.map((opt, i) => ({
                    question_id: questionDoc._id,
                    option_text: opt,
                    sort_order: i,
                    language: langCode,
                    is_approved: langCode === detectedLanguage, // Only detected language options are approved
                    status: langCode === detectedLanguage ? 'approved' : 'pending',
                    created_at: new Date().toISOString(),
                    created_by: null,
                    updated_by: null
                }));
                await Option.insertMany(optionDocs);
            }
        }

        // 🔸 Step 7: Return all created questions
        const response = {
            message: 'Questions created successfully in all languages',
            detected_language: detectedLanguage,
            questionnaire_id: qid,
            questions: createdQuestions.map(q => ({
                _id: q._id,
                question_text: q.question_text,
                language: q.language,
                question_type: q.question_type,
                is_approved: q.is_approved,
                created_at: q.created_at,
                created_by: q.created_by,
                updated_by: q.updated_by,
                status: q.status,
                qid: q.qid
            })),
            total_questions_created: createdQuestions.length,
            languages_created: SUPPORTED_LANGUAGES
        };

        res.status(201).json(response);

    } catch (err) {
        console.error('Failed to save question:', err);
        res.status(500).json({ 
            error: 'Internal server error', 
            details: err.message 
        });
    }
  });

  // 🔹 GET: Get questions by language
  app.get('/api/admin/questions/language/:language', async (req, res) => {
    const { language } = req.params;

    try {
      const questions = await Question.find({ language: language });
      
      const questionsWithOptions = await Promise.all(questions.map(async (question) => {
        const options = await Option.find({ 
          question_id: question._id, 
          language: language 
        }).sort({ sort_order: 1 });
        
        return {
          ...question.toObject(),
          options: options.map(opt => ({
            _id: opt._id,
            option_text: opt.option_text,
            sort_order: opt.sort_order,
            is_approved: opt.is_approved,
            status: opt.status
          }))
        };
      }));

      res.json(questionsWithOptions);
    } catch (err) {
      console.error('Failed to fetch questions by language:', err);
      res.status(500).json({ error: 'Failed to fetch questions by language' });
    }
  });

  // 🔹 GET: Get questions by questionnaire ID and language
  app.get('/api/admin/questions/questionnaire/:qid/:language', async (req, res) => {
    const { qid, language } = req.params;

    try {
      const questions = await Question.find({ qid: qid, language: language });
      
      const questionsWithOptions = await Promise.all(questions.map(async (question) => {
        const options = await Option.find({ 
          question_id: question._id, 
          language: language 
        }).sort({ sort_order: 1 });
        
        return {
          ...question.toObject(),
          options: options.map(opt => ({
            _id: opt._id,
            option_text: opt.option_text,
            sort_order: opt.sort_order,
            is_approved: opt.is_approved,
            status: opt.status
          }))
        };
      }));

      res.json(questionsWithOptions);
    } catch (err) {
      console.error('Failed to fetch questions by questionnaire and language:', err);
      res.status(500).json({ error: 'Failed to fetch questions by questionnaire and language' });
    }
  });

  // 🔹 PUT: Update question
  app.put('/api/admin/questions/:id', async (req, res) => {
    const { id } = req.params;
    const { question_text, question_type, options = [], retranslate = false } = req.body;

    if (!question_text?.trim()) {
      return res.status(400).json({ error: 'Question text is required' });
    }

    try {
      const existing = await Question.findById(id);
      if (!existing) {
        return res.status(404).json({ error: 'Question not found' });
      }

      console.log('Updating question:', { id, retranslate, language: existing.language });

      if (retranslate) {
        // UPDATE ALL LANGUAGE VERSIONS - retranslate to other languages
        
        // 1. Update the current question
        const updatedQuestion = await Question.findByIdAndUpdate(id, {
          $set: {
            question_text: question_text.trim(),
            question_type: question_type || existing.question_type,
            updated_by: null,
            updated_at: new Date().toISOString(),
            is_approved: true, // Keep original language approved
            status: 'approved'
          }
        }, { new: true });

        // 2. Update options for current question
        if (question_type === 'options' || existing.question_type === 'options') {
          await Option.deleteMany({ question_id: id });

          if (options.length > 0) {
            const optionDocs = options.map((opt, i) => ({
              question_id: id,
              option_text: opt.trim(),
              sort_order: i,
              language: existing.language,
              is_approved: true, // Keep original language approved
              status: 'approved',
              created_at: new Date().toISOString(),
              created_by: null,
              updated_by: null
            }));
            await Option.insertMany(optionDocs);
          }
        }

        // 3. Find all other language versions of this question (same qid, different language)
        const relatedQuestions = await Question.find({ 
          qid: existing.qid, 
          language: { $ne: existing.language } 
        });

        console.log(`Found ${relatedQuestions.length} related questions to retranslate`);

        // 4. Translate to each other language
        for (const relatedQuestion of relatedQuestions) {
          try {
            console.log(`Translating to ${relatedQuestion.language}`);
            
            // Translate question text
            const [translatedQuestion] = await translateClient.translate(question_text.trim(), {
              from: existing.language,
              to: relatedQuestion.language
            });

            // Translate options if applicable
            let translatedOptions = [];
            if ((question_type === 'options' || existing.question_type === 'options') && options.length > 0) {
              const [translatedOpts] = await translateClient.translate(options, {
                from: existing.language,
                to: relatedQuestion.language
              });
              translatedOptions = Array.isArray(translatedOpts) ? translatedOpts : [translatedOpts];
            }

            // Update the related question
            await Question.findByIdAndUpdate(relatedQuestion._id, {
              $set: {
                question_text: translatedQuestion,
                question_type: question_type || existing.question_type,
                updated_by: null,
                updated_at: new Date().toISOString(),
                is_approved: false, // Translations need approval
                status: 'pending'
              }
            });

            // Update options for translated question
            if ((question_type === 'options' || existing.question_type === 'options')) {
              await Option.deleteMany({ question_id: relatedQuestion._id });

              if (translatedOptions.length > 0) {
                const translatedOptionDocs = translatedOptions.map((opt, i) => ({
                  question_id: relatedQuestion._id,
                  option_text: opt,
                  sort_order: i,
                  language: relatedQuestion.language,
                  is_approved: false, // Translations need approval
                  status: 'pending',
                  created_at: new Date().toISOString(),
                  created_by: null,
                  updated_by: null
                }));
                await Option.insertMany(translatedOptionDocs);
              }
            }

          } catch (translateError) {
            console.error(`Translation failed for language ${relatedQuestion.language}:`, translateError);
            
            // Update with error message
            await Question.findByIdAndUpdate(relatedQuestion._id, {
              $set: {
                question_text: `Translation error for ${relatedQuestion.language}`,
                updated_at: new Date().toISOString(),
                is_approved: false,
                status: 'error'
              }
            });
          }
        }

        // Get updated question with options
        const finalQuestion = await Question.findById(id);
        const finalOptions = await Option.find({ question_id: id }).sort({ sort_order: 1 });
        
        const response = {
          ...finalQuestion.toObject(),
          options: finalOptions.map(opt => ({
            _id: opt._id,
            option_text: opt.option_text,
            sort_order: opt.sort_order,
            is_approved: opt.is_approved,
            status: opt.status
          })),
          retranslated: true,
          updated_languages: relatedQuestions.length
        };

        res.json(response);

      } else {
        // UPDATE ONLY THIS LANGUAGE VERSION (original behavior)
        const updatedQuestion = await Question.findByIdAndUpdate(id, {
          $set: {
            question_text: question_text.trim(),
            question_type: question_type || existing.question_type,
            updated_by: null,
            updated_at: new Date().toISOString(),
            is_approved: false, // Reset approval status
            status: 'pending'
          }
        }, { new: true });

        // Update options if provided and question type is options
        if (question_type === 'options' || existing.question_type === 'options') {
          // Delete existing options
          await Option.deleteMany({ question_id: id });

          // Create new options
          if (options.length > 0) {
            const optionDocs = options.map((opt, i) => ({
              question_id: id,
              option_text: opt.trim(),
              sort_order: i,
              language: existing.language,
              is_approved: false, // Reset approval status
              status: 'pending',
              created_at: new Date().toISOString(),
              created_by: null,
              updated_by: null
            }));
            await Option.insertMany(optionDocs);
          }
        }

        // Get updated question with options
        const updatedOptions = await Option.find({ question_id: id }).sort({ sort_order: 1 });
        
        const response = {
          ...updatedQuestion.toObject(),
          options: updatedOptions.map(opt => ({
            _id: opt._id,
            option_text: opt.option_text,
            sort_order: opt.sort_order,
            is_approved: opt.is_approved,
            status: opt.status
          }))
        };

        res.json(response);
      }

    } catch (err) {
      console.error('Update failed:', err);
      res.status(500).json({ error: 'Update failed' });
    }
  });

  // 🔹 POST: Approve question
  app.post('/api/admin/questions/:id/approve', async (req, res) => {
    const { id } = req.params;

    try {
      const question = await Question.findById(id);
      if (!question) {
        return res.status(404).json({ error: 'Question not found' });
      }

      // Approve question
      const approvedQuestion = await Question.findByIdAndUpdate(id, {
        $set: {
          is_approved: true,
          status: 'approved',
          updated_at: new Date().toISOString()
        }
      }, { new: true });

      // Approve all options for this question
      await Option.updateMany(
        { question_id: id },
        {
          $set: {
            is_approved: true,
            status: 'approved',
            updated_at: new Date().toISOString()
          }
        }
      );

      res.json({ 
        message: 'Question and options approved successfully', 
        question: approvedQuestion 
      });
    } catch (err) {
      console.error('Approval failed:', err);
      res.status(500).json({ error: 'Approval failed' });
    }
  });

  // 🔹 DELETE: Delete question and its options
  app.delete('/api/admin/questions/:id', async (req, res) => {
    const { id } = req.params;

    try {
      const deleted = await Question.findByIdAndDelete(id);
      if (!deleted) {
        return res.status(404).json({ error: 'Question not found' });
      }

      // Delete all options for this question
      const deletedOptions = await Option.deleteMany({ question_id: id });

      res.json({ 
        message: 'Question and options deleted successfully', 
        deleted_question: deleted,
        deleted_options_count: deletedOptions.deletedCount
      });
    } catch (err) {
      console.error('Delete failed:', err);
      res.status(500).json({ error: 'Delete failed' });
    }
  });

  // 🔹 GET: Get all options for a question
  app.get('/api/admin/questions/:id/options', async (req, res) => {
    const { id } = req.params;

    try {
      const options = await Option.find({ question_id: id }).sort({ sort_order: 1 });
      res.json(options);
    } catch (err) {
      console.error('Failed to fetch options:', err);
      res.status(500).json({ error: 'Failed to fetch options' });
    }
  });

  // 🔹 DELETE: Delete all questions and options for a questionnaire (more efficient)
  app.delete('/api/admin/questionnaire/:qid/all-questions', async (req, res) => {
    const { qid } = req.params;

    try {
      const questions = await Question.find({ qid: qid });
      const questionIds = questions.map(q => q._id);

      // Delete all options first
      const deletedOptions = await Option.deleteMany({ 
        question_id: { $in: questionIds } 
      });

      // Delete all questions
      const deletedQuestions = await Question.deleteMany({ qid: qid });

      res.json({ 
        message: 'All questions and options for questionnaire deleted successfully',
        deleted_questions_count: deletedQuestions.deletedCount,
        deleted_options_count: deletedOptions.deletedCount,
        questionnaire_id: qid
      });
    } catch (err) {
      console.error('Delete questionnaire questions failed:', err);
      res.status(500).json({ error: 'Delete questionnaire questions failed' });
    }
  });

  // 🔹 DELETE: Delete all questions and options for a questionnaire
  app.delete('/api/admin/questionnaire/:qid/questions', async (req, res) => {
    const { qid } = req.params;

    try {
      const questions = await Question.find({ qid: qid });
      const questionIds = questions.map(q => q._id);

      // Delete all options first
      const deletedOptions = await Option.deleteMany({ 
        question_id: { $in: questionIds } 
      });

      // Delete all questions
      const deletedQuestions = await Question.deleteMany({ qid: qid });

      res.json({ 
        message: 'All questions and options for questionnaire deleted successfully',
        deleted_questions_count: deletedQuestions.deletedCount,
        deleted_options_count: deletedOptions.deletedCount
      });
    } catch (err) {
      console.error('Delete questionnaire questions failed:', err);
      res.status(500).json({ error: 'Delete questionnaire questions failed' });
    }
  });
};

module.exports = { adminRoutes };