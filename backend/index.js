require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const textToSpeech = require('@google-cloud/text-to-speech');
const { v1 } = require('@google-cloud/text-to-speech');
const { Translate } = require('@google-cloud/translate').v2;
const connectMongo = require('./db_service/connection');
const { adminRoutes } = require('./adminService');
// Model imports:
const Form = require('./models/Form');
const Questionnaire = require('./models/Questionnaire');
const Question = require('./models/Quetions'); 
const Option = require('./models/Options');
const { createFormWithQuestions, getFormQuestions } = require('./questionnaireService');
 
const app = express();
const port = process.env.PORT || 3001;
app.use(cors());
app.use(express.json()); // To parse JSON request bodies
 
// --- Ollama Setup ---
const OLLAMA_BASE_URL = process.env.OLLAMA_BASE_URL || 'http://localhost:11434';
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || 'llama2';

async function generateWithOllama(prompt, systemPrompt = 'You are an empathetic AI assistant guiding a user through a fixed ADHD questionnaire.') {
    try {
        const response = await fetch(`${OLLAMA_BASE_URL}/api/generate`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model: OLLAMA_MODEL,
                system: systemPrompt,
                prompt: prompt,
                stream: false,
                max_tokens: 500
            })
        });
        
        if (!response.ok) {
            throw new Error(`Ollama API error: ${response.status}`);
        }
        
        const data = await response.json();
        console.log('Ollama response data:', data);
        
        return { response: { text: () => data.response || '' } };
    } catch (error) {
        console.error('Ollama API error:', error);
        throw error;
    }
}
const ttsClient = new textToSpeech.TextToSpeechClient({
  projectId: process.env.GOOGLE_CLOUD_PROJECT_ID,
  credentials: {
    client_email: process.env.GOOGLE_CLOUD_CLIENT_EMAIL,
    private_key: process.env.GOOGLE_CLOUD_PRIVATE_KEY?.replace(/\\n/g, '\n')
  }
});

// --- Google Cloud Translate Setup ---
const translateClient = new Translate({
  projectId: process.env.GOOGLE_CLOUD_PROJECT_ID,
  credentials: {
    client_email: process.env.GOOGLE_CLOUD_CLIENT_EMAIL,
    private_key: process.env.GOOGLE_CLOUD_PRIVATE_KEY?.replace(/\\n/g, '\n')
  }
});
 
// const ttsClient = new TextToSpeechClient({ keyFilename: process.env.GOOGLE_APPLICATION_CREDENTIALS });
 
const sessions = new Map();
 
function generateSessionId() {
    return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
}
 
// Helper to safely parse LLM's JSON, handling potential markdown blocks
function safeParseLLMJson(text) {
    if (!text || typeof text !== 'string') {
        console.error("Invalid text for JSON parsing:", text);
        return null;
    }
    
    try {
        // First try to find JSON in markdown blocks
        const jsonMatch = text.match(/```json\n([\s\S]*?)\n```/);
        if (jsonMatch && jsonMatch[1]) {
            return JSON.parse(jsonMatch[1]);
        }
        
        // Find the first { and find the matching closing }
        const firstBrace = text.indexOf('{');
        if (firstBrace === -1) {
            return JSON.parse(text);
        }
        
        let braceCount = 0;
        let endIndex = firstBrace;
        
        for (let i = firstBrace; i < text.length; i++) {
            if (text[i] === '{') braceCount++;
            if (text[i] === '}') braceCount--;
            if (braceCount === 0) {
                endIndex = i;
                break;
            }
        }
        
        const jsonText = text.substring(firstBrace, endIndex + 1);
        return JSON.parse(jsonText);
    } catch (e) {
        console.error("Failed to parse LLM JSON:", e, "Raw text:", text);
        return null;
    }
}
 
app.post('/api/start-session', async (req, res) => {
    console.log("Starting new session with request ");
    const { language = 'en', formId } = req.body;
    
    try {
        let questions;
        
        if (formId) {
            // Get questions for specific form
            const formData = await getFormQuestions(formId, language);
            questions = formData.questions;
        } else {
            // Fallback to old method for backward compatibility
            const questionDocs = await Question.find({ 
                language: language, 
                is_approved: true,
                status: 'approved'
            }).sort({ createdAt: 1 });
            
            questions = questionDocs;
        }
        console.log("Questions found:", questions.length);
        console.log("Raw questions:", questions.map(q => ({ id: q._id, text: q.question_text, type: q.question_type, qid: q.questionnaire_id })));
        
        // Check if Q69 is in the questions
        const q69Questions = questions.filter(q => q.questionnaire_id === 'Q69');
        console.log('Q69 questions found:', q69Questions.length);
        q69Questions.forEach(q => console.log(`Q69 Question: "${q.question_text}" (${q.language})`));
    
         const questionsWithOptions = await Promise.all(questions.map(async (question) => {
            const options = await Option.find({ 
                questionnaire_id: question.questionnaire_id,
                language: language,
                is_approved: true,
                status: 'approved'
            }).sort({ sort_order: 1 });
            
            console.log(`🔍 Question "${question.question_text}" (${question.question_type}) found ${options.length} options:`, options.map(o => o.option_text));

            return {
                id: question._id.toString(),
                question: question.question_text,
                type: question.question_type,
                options: options.map(opt => opt.option_text),
                language: question.language,
                qid: question.questionnaire_id
            };
        }));

        // Get questionnaire_ids where ALL languages are approved
        const fullyApprovedQuestionnaireIds = await Question.aggregate([
            { $group: { 
                _id: '$questionnaire_id', 
                totalQuestions: { $sum: 1 },
                approvedQuestions: { $sum: { $cond: [{ $and: ['$is_approved', { $eq: ['$status', 'approved'] }] }, 1, 0] } }
            }},
            { $match: { $expr: { $eq: ['$totalQuestions', '$approvedQuestions'] } } },
            { $project: { _id: 1 } }
        ]);
        
        const approvedQids = fullyApprovedQuestionnaireIds.map(item => item._id.toString());
        console.log('🔍 DEBUG: Fully approved questionnaire IDs:', approvedQids);
        console.log('🔍 DEBUG: Is Q69 in approved list?', approvedQids.includes('Q69'));
        console.log('🔍 DEBUG: Total questionnaires found:', questionsWithOptions.length);
        questionsWithOptions.forEach(q => {
            console.log(`🔍 Question: "${q.question}" | QID: ${q.qid} | Approved: ${approvedQids.includes(q.qid.toString())}`);
        });

        // Filter questions to only include those from fully approved questionnaire groups
        const validQuestions = questionsWithOptions.filter(q => {
            const isFullyApproved = approvedQids.includes(q.qid.toString());
            
            if (!isFullyApproved) {
                console.log(`❌ Filtering out question with questionnaire_id: ${q.qid} - not all translations approved`);
                return false;
            }
            
            // Check for valid options
            if (q.type === 'freetext') {
                console.log(`✅ Including freetext question: "${q.question}"`);
                return true;
            }
            
            const hasOptions = q.options && q.options.length > 0;
            console.log(`${hasOptions ? '✅' : '❌'} Question "${q.question}" has ${q.options?.length || 0} options`);
            return hasOptions;
        });
        console.log('🎯 Final valid questions for session:', validQuestions.length);
        console.log('🎯 Valid questions details:', validQuestions.map(q => ({ id: q.id, question: q.question, type: q.type, options: q.options })));

        if (validQuestions.length === 0) {
            console.log('⚠️ No fully approved questions found, trying with individual question approval only');
            // Fallback: just use questions that are individually approved
            const fallbackQuestions = questionsWithOptions.filter(q => {
                if (q.type === 'freetext') {
                    console.log(`✅ Including freetext question (fallback): "${q.question}"`);
                    return true;
                }
                const hasOptions = q.options && q.options.length > 0;
                console.log(`${hasOptions ? '✅' : '❌'} Question "${q.question}" has ${q.options?.length || 0} options (fallback)`);
                return hasOptions;
            });
            
            if (fallbackQuestions.length === 0) {
                return res.status(400).json({ 
                    error: `No approved questions with valid options found for language: ${language}` 
                });
            }
            
            validQuestions = fallbackQuestions;
            console.log('🔄 Using fallback questions:', validQuestions.length);
        }
                const sessionId = generateSessionId();
                sessions.set(sessionId, {
                    conversationHistory: [],
                    responses: {},
                    currentQuestionIndex: 0,
                    lastPredictedOption: null,
                    lastQuestionOptions: [],
                    reviewMode: false,
                    language: language,
                    questions: validQuestions // Store only valid approved questions in session
                });
        
        console.log(`New session started: ${sessionId} (Language: ${language}, Valid Questions: ${validQuestions.length})`);
        res.json({ sessionId, language, totalQuestions: validQuestions.length });
    } catch (error) {
        console.error('Error starting session:', error);
        res.status(500).json({ error: 'Failed to start session' });
    }
});

async function validateQuestionApproval(questionId) {
    try {
        const question = await Question.findById(questionId);
        if (!question || !question.is_approved || question.status !== 'approved') {
            return false;
        }
        
        // For non-freetext questions, also check if options are approved
        if (question.question_type !== 'freetext') {
            const approvedOptions = await Option.find({
                question_id: questionId,
                is_approved: true,
                status: 'approved'
            });
            return approvedOptions.length > 0;
        }
        
        return true;
    } catch (error) {
        console.error('Error validating question approval:', error);
        return false;
    }
}
 
app.post('/api/chat', async (req, res) => {
    // Add questionIdToReAnswer to destructuring
    const { sessionId, userMessage, action, currentQuestionId, awaitingConfirmation, questionIdToReAnswer } = req.body;
 
    console.log("Backend received:", { sessionId, userMessage, action, currentQuestionId, awaitingConfirmation, questionIdToReAnswer });
 
    if (!sessionId) {
        console.error("Backend: Session ID is missing in request.");
        return res.status(400).json({ assistantMessage: "Session ID is required.", action: "error" });
    }
 
    let session = sessions.get(sessionId);
    if (!session) {
        console.error("Backend: Session not found for ID:", sessionId);
        return res.status(404).json({ assistantMessage: "Session not found. Please start a new session.", action: "error" });
    }

    const questions = session.questions || [];

    if (questions.length === 0) {
        console.error("Backend: No questions available for session:", sessionId);
        return res.status(400).json({ 
            assistantMessage: "No questions available for this session.", 
            action: "error" 
        });
    }
 
    let conversationHistory = session.conversationHistory;
    let userResponses = session.responses;
 
    let assistantMessage = ""; // Initialize assistantMessage here to prevent undefined errors
    let nextQuestionText = null; // Renamed from nextQuestion for clarity with question object
    let actionToFrontend = action;
    let questionIdToFrontend = currentQuestionId;
    let currentQuestionIndex = session.currentQuestionIndex; // Session's overall progress index
    let predictedOption = session.lastPredictedOption;
    let geminiAssistantMessage = ""; // Initialize this too, for consistent scope
 
    // IMPORTANT: Dynamically determine the current question object based on the action
    let currentQuestionObj = null;
    let actualQuestionIndex = session.currentQuestionIndex; // Default to normal flow for session
 
    if (action === 're_answer_specific_question' && questionIdToReAnswer !== null && questionIdToReAnswer !== undefined) {
        // If re-answering, the "current" question is the one being re-answered
        currentQuestionObj = questions.find(q => q.id === questionIdToReAnswer);
        actualQuestionIndex = questions.findIndex(q => q.id === questionIdToReAnswer); // Temporarily adjust index for this request
        if (currentQuestionObj) {
            questionIdToFrontend = currentQuestionObj.id; // Ensure frontend knows which Q is being re-answered
            session.lastQuestionOptions = currentQuestionObj.options; // Ensure options are for the re-answered Q
        } else {
            console.warn(`Backend: Question with ID ${questionIdToReAnswer} not found for re-answer.`);
            assistantMessage = "I'm sorry, I couldn't find the question you wanted to re-answer. Please try again or start a new session.";
            actionToFrontend = "error";
            return res.status(400).json({ assistantMessage, action: actionToFrontend, questionId: null, nextQuestion: null, responses: userResponses });
        }
    } else if (currentQuestionId !== null && currentQuestionId !== undefined) {
        // For regular 'answer' actions, use currentQuestionId from frontend if provided
        currentQuestionObj = questions.find(q => q.id === currentQuestionId);
        actualQuestionIndex = questions.findIndex(q => q.id === currentQuestionId);
    } else if (action === 'confirm_readiness' && session.currentQuestionIndex === 0) {
        // For 'confirm_readiness' leading to the first question
        currentQuestionObj = questions[0];
        actualQuestionIndex = 0;
    } else {
        // Fallback: use the session's currentQuestionIndex for other actions or if context is missing
        currentQuestionObj = questions[session.currentQuestionIndex];
        actualQuestionIndex = session.currentQuestionIndex;
    }
    console.log('quetion', questions.length)
    try {
        // Add user message to conversation history BEFORE sending to Gemini for context
        conversationHistory.push({ role: 'user', parts: [{ text: userMessage }] });
 
        if (action === 'init_questionnaire') {
            const initPrompt = `RESPOND ONLY WITH JSON. NO OTHER TEXT.

Return this exact JSON object:
{
  "assistantMessage": "Hello! I'm here to guide you through a short questionnaire designed to help us better understand your daily experiences with how you process information and interact with your environment. This isn't a diagnostic tool, so there are no right or wrong answers. Your honest responses are the most valuable. This questionnaire will help you better understand yourself. Are you ready to begin?",
  "action": "ask_readiness",
  "questionId": null,
  "currentQuestionIndex": 0
}`;
 
            console.log("Backend: Sending prompt to Ollama for init_questionnaire.");
            const initResult = await generateWithOllama(initPrompt);
            const initResponseText = initResult.response.text();
            console.log("Backend: Ollama Raw Response (init_questionnaire):", initResponseText);
 
            const initData = safeParseLLMJson(initResponseText);
 
            if (!initData) {
                // Fallback if Ollama doesn't return JSON
                console.warn("Ollama didn't return JSON, using fallback response");
                assistantMessage = "Hello! I'm here to guide you through a short questionnaire designed to help us better understand your daily experiences with how you process information and interact with your environment. This isn't a diagnostic tool, so there are no right or wrong answers. Your honest responses are the most valuable. This questionnaire will help you better understand yourself. Are you ready to begin?";
                actionToFrontend = "ask_readiness";
                questionIdToFrontend = null;
                currentQuestionIndex = 0;
                session.currentQuestionIndex = currentQuestionIndex;
                session.lastQuestionOptions = [];
            } else {
                assistantMessage = initData.assistantMessage;
                actionToFrontend = initData.action;
                questionIdToFrontend = initData.questionId;
                currentQuestionIndex = initData.currentQuestionIndex;
                session.currentQuestionIndex = currentQuestionIndex;
                session.lastQuestionOptions = [];
            }
 
        } else if (action === 'confirm_readiness') {
            const readinessConfirmationPrompt = `RESPOND ONLY WITH JSON. NO OTHER TEXT.

User said: "${userMessage}"

If they seem ready (yes/ready/start), return:
{
  "assistantMessage": "Great! Let's begin.",
  "action": "confirm_readiness",
  "questionId": null,
  "currentQuestionIndex": 0
}

If not ready, return:
{
  "assistantMessage": "No problem. Are you ready to begin the questionnaire?",
  "action": "clarify",
  "questionId": null,
  "currentQuestionIndex": 0
}`;
 
            console.log("Backend: Sending prompt to Ollama for readiness confirmation.");
            const readinessResult = await generateWithOllama(readinessConfirmationPrompt);
            const readinessResponseText = readinessResult.response.text();
            console.log("Backend: Ollama Raw Response (readiness confirmation):", readinessResponseText);
 
            const readinessData = safeParseLLMJson(readinessResponseText);
 
            if (!readinessData) {
                // Fallback: check if user seems ready based on common responses
                const isReady = /\b(yes|ready|start|begin|ok|sure)\b/i.test(userMessage);
                if (isReady) {
                    assistantMessage = "Great! Let's begin.";
                    actionToFrontend = "confirm_readiness";
                } else {
                    assistantMessage = "No problem. Are you ready to begin the questionnaire?";
                    actionToFrontend = "clarify";
                }
                questionIdToFrontend = null;
                currentQuestionIndex = 0;
            } else {
                assistantMessage = readinessData.assistantMessage;
                actionToFrontend = readinessData.action;
                questionIdToFrontend = readinessData.questionId;
                currentQuestionIndex = readinessData.currentQuestionIndex;
            }
 
            if (actionToFrontend === 'confirm_readiness') {
                if (questions.length > 0) {
                    const firstQuestion = questions[0];
                    nextQuestionText = firstQuestion.question;
                    questionIdToFrontend = firstQuestion.id;
                    actionToFrontend = 'ask_question';
                    currentQuestionIndex = 0;
                    if (firstQuestion.type === 'freetext') {
                            assistantMessage = `${assistantMessage} Question 1: ${nextQuestionText}. Please provide your answer in your own words.`;
                        } else {
                            assistantMessage = `${assistantMessage} Question 1: ${nextQuestionText}. The options are: ${firstQuestion.options.join(', ')}.`;
                        }
                    session.lastQuestionOptions = firstQuestion.options;
                    session.currentQuestionIndex = currentQuestionIndex;
                } else {
                    assistantMessage = "The questionnaire is empty. Please configure questions.";
                    actionToFrontend = 'complete';
                    session.currentQuestionIndex = 0;
                    session.lastQuestionOptions = [];
                }
            } else {
                session.lastQuestionOptions = [];
                session.currentQuestionIndex = 0;
            }
 
        // THIS IS THE MODIFIED BLOCK FOR 'answer' AND 're_answer_specific_question'
        } else if (action === 'answer' || action === 're_answer_specific_question') {
            if (currentQuestionObj) {
                const isApproved = await validateQuestionApproval(currentQuestionObj.id);
                if (!isApproved) {
                    console.warn(`Question ${currentQuestionObj.id} is no longer approved. Removing from session.`);
                    
                    // Remove this question from session
                    const updatedQuestions = questions.filter(q => q.id !== currentQuestionObj.id);
                    session.questions = updatedQuestions;
                    
                    // Find next valid question
                    let nextValidIndex = actualQuestionIndex;
                    while (nextValidIndex < updatedQuestions.length) {
                        const isNextValid = await validateQuestionApproval(updatedQuestions[nextValidIndex].id);
                        if (isNextValid) break;
                        nextValidIndex++;
                    }
                    
                    if (nextValidIndex < updatedQuestions.length) {
                        // Move to next valid question
                        const nextQ = updatedQuestions[nextValidIndex];
                        session.currentQuestionIndex = nextValidIndex;
                        assistantMessage = `I'm sorry, there was an issue with the previous question. Let's continue with the next one. Question ${nextValidIndex + 1}: ${nextQ.question}. ${nextQ.type === 'freetext' ? 'Please provide your answer in your own words.' : `The options are: ${nextQ.options.join(', ')}.`}`;
                        actionToFrontend = 'ask_question';
                        questionIdToFrontend = nextQ.id;
                        nextQuestionText = nextQ.question;
                        session.lastQuestionOptions = nextQ.options || [];
                        
                        return res.json({
                            assistantMessage,
                            action: actionToFrontend,
                            questionId: questionIdToFrontend,
                            currentQuestionIndex: session.currentQuestionIndex,
                            nextQuestion: nextQuestionText,
                            predictedOption: null,
                            responses: userResponses,
                        });
                    } else {
                        // No more valid questions, complete the questionnaire
                        assistantMessage = "Thank you.Let's complete the questionnaire with your current responses.";
                        actionToFrontend = 'complete';
                        questionIdToFrontend = null;
                        nextQuestionText = null;
                        session.currentQuestionIndex = updatedQuestions.length;
                        
                        return res.json({
                            assistantMessage,
                            action: actionToFrontend,
                            questionId: questionIdToFrontend,
                            currentQuestionIndex: session.currentQuestionIndex,
                            nextQuestion: nextQuestionText,
                            predictedOption: null,
                            responses: userResponses,
                        });
                    }
                }
            }
            if (!currentQuestionObj) {
                console.warn("Backend: No currentQuestionObj found for 'answer' or 're_answer_specific_question' action.");
                assistantMessage = "I'm sorry, I couldn't find the context for that question. Can we restart?";
                actionToFrontend = "error";
                questionIdToFrontend = null;
                session.lastQuestionOptions = [];
                throw new Error("Invalid or outdated question context for answer/re_answer action.");
            }
 
            let answerPrompt;
            if (currentQuestionObj.type === 'freetext') {
                answerPrompt = `You are an empathetic AI assistant guiding a user through a fixed ADHD questionnaire.
                The current question being answered is: "${currentQuestionObj.question}".
                This is a FREE TEXT question - the user can provide any response in their own words.
                There are a total of ${questions.length} questions. The current question is question number ${actualQuestionIndex + 1}.`;
            } else {
                answerPrompt = `You are an empathetic AI assistant guiding a user through a fixed ADHD questionnaire.
                The current question being answered is: "${currentQuestionObj.question}".
                The user's response options are: ${currentQuestionObj.options.join(', ')}.
                There are a total of ${questions.length} questions. The current question is question number ${actualQuestionIndex + 1}.`;
            }
 
            answerPrompt += `
                Based on the user's last input "${userMessage}", categorize their answer.`;
            
            if (currentQuestionObj.type === 'freetext') {
                answerPrompt += `
                For FREE TEXT questions, you MUST respond with one of the following actions:
                - "ask_question": If the user provides any meaningful response (even if brief), and there are MORE questions remaining after this one. Current question is ${actualQuestionIndex + 1} of ${questions.length} total questions.
                    The "assistantMessage" should be a *simple acknowledgement* (e.g., "Thank you for sharing.", "I understand.", "Got it."). The backend will append the next question.
                - "complete": If the user provides any meaningful response, and this is the LAST question. Current question is ${actualQuestionIndex + 1} of ${questions.length} total questions. ONLY use "complete" if ${actualQuestionIndex + 1} equals ${questions.length}.
                    The "assistantMessage" should be a *simple acknowledgement* (e.g., "Thank you for your response.", "I appreciate your input."). The backend will generate the completion message.
                - "repeat_question_gemini_detected": If the user's input clearly asks to repeat the question (e.g., "repeat that", "say it again", "what was the question?", "can you repeat?").
                    The "assistantMessage" should be a confirmation (e.g., "Certainly, here is the question again." or "No problem, listening again for this question.").
                - "clarify": If the input is completely irrelevant, uninterpretable, or asks a non-explanation related question that is *not* a repeat request, ask for clarification by encouraging them to share their thoughts or experiences related to the question.`;
            } else {
                answerPrompt += `
                You MUST respond with one of the following actions:
                - "ask_question": If the user's input clearly indicates one of the fixed options, and there are MORE questions remaining after this one. Current question is ${actualQuestionIndex + 1} of ${questions.length} total questions.
                    The "assistantMessage" should be a *simple acknowledgement* (e.g., "Understood.", "Okay.", "Got it."). The backend will append the next question.
                - "complete": If the user's input clearly indicates one of the fixed options, and this is the LAST question. Current question is ${actualQuestionIndex + 1} of ${questions.length} total questions. ONLY use "complete" if ${actualQuestionIndex + 1} equals ${questions.length}.
                    The "assistantMessage" should be a *simple acknowledgement* (e.g., "Understood.", "Great."). The backend will generate the completion message.
                - "clarify_and_confirm": If the input is vague or could refer to multiple options, infer the most likely option.
                    The assistantMessage should then ask for confirmation of the inferred option AND provide the list of options for clarity.
                    (e.g., "I think you mean [Inferred Option]. Is that correct (yes/no), or would you like to choose from ${currentQuestionObj.options.join(', ')}?").
                - "repeat_question_gemini_detected": If the user's input clearly asks to repeat the question (e.g., "repeat that", "say it again", "what was the question?", "can you repeat?").
                    The "assistantMessage" should be a confirmation (e.g., "Certainly, here is the question again." or "No problem, listening again for this question.").
                - "clarify": If the input is completely irrelevant, uninterpretable, or asks a non-explanation related question that is *not* a repeat request, ask for clarification by prompting them to choose from the given options or rephrase their answer.`;
            }
            
            answerPrompt += `
 
                Provide your response as a JSON object with the following keys:
                - "assistantMessage": [string, the text the assistant should say to the user *before* the next question is appended by the backend, or the full clarification message.]
                - "predictedOption": [string, the inferred option for "clarify_and_confirm" action, otherwise null.]
                - "action": [string, "ask_question", "clarify_and_confirm", "clarify", "complete", "repeat_question_gemini_detected"]
                - "questionId": [string, the ID of the *current* question for "clarify", "clarify_and_confirm", "repeat_question_gemini_detected", or the ID of the *next* question for "ask_question"/"complete".]
                - "confirmedAnswer": [string, for options-based questions: the fixed option if the answer is clear. For free text questions: the user's actual response. Otherwise null. This is for your internal backend use to save the response.]
 
                Strictly output only the JSON object. Do not include any other text outside the JSON.
 
                Recent Conversation History:
                ${conversationHistory.map(entry => `${entry.role}: ${entry.parts[0].text}`).join('\n')}
            `;
 
            console.log("Backend: Sending prompt to Ollama for answer processing (answer/re_answer_specific_question).");
            const answerResult = await generateWithOllama(answerPrompt);
            const answerResponseText = answerResult.response.text();
            console.log("Backend: Ollama Raw Response (answer processing):", answerResponseText);
 
            const answerData = safeParseLLMJson(answerResponseText);
 
            if (!answerData) {
                // Fallback: treat as a valid answer and move to next question
                console.warn("Ollama didn't return JSON for answer processing, using fallback");
                
                // Save the user's response
                userResponses[currentQuestionObj.id] = {
                    question: currentQuestionObj.question,
                    answer: userMessage,
                    rawTranscript: userMessage
                };
                session.responses = userResponses;
                
                // Determine if there are more questions
                if (actualQuestionIndex + 1 < questions.length) {
                    geminiAssistantMessage = "Thank you.";
                    actionToFrontend = "ask_question";
                } else {
                    geminiAssistantMessage = "Thank you for your response.";
                    actionToFrontend = "complete";
                }
                predictedOption = null;
            } else {
                geminiAssistantMessage = answerData.assistantMessage;
                actionToFrontend = answerData.action;
                predictedOption = answerData.predictedOption || null;
                const confirmedAnswer = answerData.confirmedAnswer || null;
                
                // Save the confirmed answer for the specific question ID that was being answered/re-answered
                if (confirmedAnswer) {
                    userResponses[currentQuestionObj.id] = {
                        question: currentQuestionObj.question,
                        answer: confirmedAnswer,
                        rawTranscript: userMessage
                    };
                    session.responses = userResponses;
                }
            }

 
            session.lastPredictedOption = predictedOption; // Update last predicted option for confirmation flow
 
            // Handle the response based on the action determined by Gemini
            if (actionToFrontend === 'ask_question') {
                session.lastPredictedOption = null; // Clear if not needed
 
                // Find the next question (don't skip answered ones for now)
                let nextIndex = actualQuestionIndex + 1;
                console.log(`🎯 DEBUG: Current question index: ${actualQuestionIndex}, Next index: ${nextIndex}, Total questions: ${questions.length}`);
 
                if (nextIndex < questions.length) {
                    currentQuestionIndex = nextIndex; // Update for session and response
                    session.currentQuestionIndex = currentQuestionIndex; // Update session
                    const nextQ = questions[currentQuestionIndex];
                    nextQuestionText = nextQ.question;
                    questionIdToFrontend = nextQ.id;
                    session.lastQuestionOptions = nextQ.options || [];
                    const nextQuestionNumber = nextIndex + 1;
                    console.log(`✅ Moving to next question ${nextQuestionNumber}: "${nextQ.question}"`);
                    if (nextQ.type === 'freetext') {
                        assistantMessage = `${geminiAssistantMessage} Question ${nextQuestionNumber}: ${nextQuestionText}. Please provide your answer in your own words.`;
                    } else {
                        assistantMessage = `${geminiAssistantMessage} Question ${nextQuestionNumber}: ${nextQuestionText}. The options are: ${nextQ.options.join(', ')}.`;
                    }
                } else {
                    // All questions answered, transition to 'complete'
                    console.log(`🏁 All questions completed. Moving to complete state.`);
                    actionToFrontend = 'complete';
                    assistantMessage = "You've completed the questionnaire! I'm now summarizing your responses.";
                    nextQuestionText = null;
                    questionIdToFrontend = null;
                    session.lastQuestionOptions = [];
                    currentQuestionIndex = questions.length;
                    session.currentQuestionIndex = questions.length; // Indicate completion
                }
 
            } else if (actionToFrontend === 'complete') {
                console.log(`🏁 Gemini returned 'complete' action directly`);
                session.lastPredictedOption = null;
                session.lastQuestionOptions = [];
                nextQuestionText = null;
                questionIdToFrontend = null;
                currentQuestionIndex = questions.length;
                session.currentQuestionIndex = questions.length;
                assistantMessage = "You've completed the questionnaire! I'm now summarizing your responses."; // Final message handled below
 
            } else if (actionToFrontend === 'clarify_and_confirm' || actionToFrontend === 'clarify' || actionToFrontend === 'repeat_question_gemini_detected') {
                // For these actions, we remain on the current question
                // currentQuestionObj already holds the correct question being discussed
                questionIdToFrontend = currentQuestionObj.id;
                currentQuestionIndex = actualQuestionIndex; // Ensure index reflects current question
                session.currentQuestionIndex = actualQuestionIndex; // Update session
                session.lastQuestionOptions = currentQuestionObj.options;
                nextQuestionText = currentQuestionObj.question; // Repeat the question text for re_ask/clarify
                const questionNumber = actualQuestionIndex + 1;
                if (currentQuestionObj.type === 'freetext') {
                    assistantMessage = `${geminiAssistantMessage} Question ${questionNumber}: ${nextQuestionText}. Please provide your answer in your own words.`;
                } else {
                    assistantMessage = `${geminiAssistantMessage} Question ${questionNumber}: ${nextQuestionText}. The options are: ${currentQuestionObj.options.join(', ')}.`;
                }
            }
 
        } else if (action === 'confirm_vague_answer') { // Handles confirmation for vague answers
            // currentQuestionObj and actualQuestionIndex are already determined above
            if (!currentQuestionObj) {
                console.warn("Backend: Mismatch or invalid question ID for 'confirm_vague_answer' action:", currentQuestionId, "Session Index:", session.currentQuestionIndex);
                assistantMessage = "I seem to have lost track of the question. Can we restart?";
                actionToFrontend = 'clarify';
                questionIdToFrontend = null;
                currentQuestionIndex = session.currentQuestionIndex;
                session.currentQuestionIndex = currentQuestionIndex;
                session.lastPredictedOption = null;
                session.lastQuestionOptions = [];
                throw new Error("Invalid or outdated question context for 'confirm_vague_answer' action.");
            }
            let lastPredictedOption = session.lastPredictedOption;
            let questionOptionsForClarification = session.lastQuestionOptions;
 
            if (!lastPredictedOption) {
                console.warn("Backend: No lastPredictedOption found for vague confirmation. Clarifying.");
                assistantMessage = `I didn't get a clear confirmation. Please tell me if the previous answer was correct (say 'yes' or 'no') or choose from: ${questionOptionsForClarification.join(', ')}.`;
                actionToFrontend = 'clarify';
                questionIdToFrontend = currentQuestionObj.id;
                currentQuestionIndex = actualQuestionIndex; // Stay on the same question's index for this flow
            } else {
                const confirmationPrompt = `The user's previous answer was inferred as "${lastPredictedOption}" for the question "${currentQuestionObj.question}".
                    The user's latest response for confirmation is "${userMessage}".
                    Determine if the user's response ("${userMessage}") indicates confirmation (e.g., "yes", "correct", "that's right") or denial (e.g., "no", "incorrect", "try again", "rephrase").
                    If denial, also try to infer if they are providing a *different* valid option from: ${currentQuestionObj.options.join(', ')}.
                    There are a total of ${questions.length} questions. The current question is question number ${actualQuestionIndex + 1}.
 
                    If confirmed:
                    - Set "action" to "ask_question" if more questions remain (current question ${actualQuestionIndex + 1} of ${questions.length}), or "complete" if this is the last question.
                    - Provide a *simple acknowledgement* in "assistantMessage" (e.g., "Confirmed.", "Okay."). The backend will append the next question/completion.
                    - The confirmed answer is "${lastPredictedOption}".
 
                    If denied AND a new clear option is provided (e.g., user says "no, I mean Rarely"):
                    - Set "action" to "ask_question" if more questions remain (current question ${actualQuestionIndex + 1} of ${questions.length}), or "complete" if this is the last question.
                    - Provide a *simple acknowledgement* in "assistantMessage" (e.g., "Understood.", "Correction noted."). The backend will append the next question/completion.
                    - The confirmed answer is the *new* option.
 
                    If the user asks to repeat the question (e.g., "repeat that", "say it again", "what was the question?", "can you repeat?"):
                    - Set "action" to "repeat_question_gemini_detected".
                    - The "assistantMessage" should be a confirmation (e.g., "Certainly, here is the question again." or "No problem, listening again for this question.").
                    - Do NOT change the currentQuestionIndex or questionId.
 
                    If denied or unclear, and NO new clear option is provided AND not a repeat request:
                    - Set "action" to "clarify".
                    - Ask the user to rephrase their answer or choose from the options: ${currentQuestionObj.options.join(', ')}.
                    - The "assistantMessage" should clearly prompt them to re-answer the *current* question and include options.
 
                    Provide your response as a JSON object with:
                    - "assistantMessage": [string, acknowledgement or clarification]
                    - "action": ["ask_question", "clarify", "complete", "repeat_question_gemini_detected"]
                    - "questionId": [string, the ID of the next question or current question if clarifying]
                    - "currentQuestionIndex": [number, the 0-based index of the next question or current question if clarifying]
                    - "confirmedAnswer": [string, the fixed option if confirmed or corrected, otherwise null. This is for your internal backend use to save the response.]
 
                    Strictly output only the JSON object. Do not include any other text outside the JSON.
 
                    Recent Conversation History:
                    ${conversationHistory.map(entry => `${entry.role}: ${entry.parts[0].text}`).join('\n')}
                `;
 
                console.log("Backend: Sending prompt to Ollama for verbal confirmation of vague answer:", confirmationPrompt);
                const confirmResult = await generateWithOllama(confirmationPrompt);
                const confirmResponseText = confirmResult.response.text();
                console.log("Backend: Ollama Raw Response (verbal confirmation of vague answer):", confirmResponseText);
 
                const confirmData = safeParseLLMJson(confirmResponseText);
 
                if (!confirmData) {
                    throw new Error("Ollama response for confirm_vague_answer could not be parsed.");
                }
 
                geminiAssistantMessage = confirmData.assistantMessage;
                actionToFrontend = confirmData.action;
                // currentQuestionIndex and questionIdToFrontend from confirmData are directly used if provided
                currentQuestionIndex = confirmData.currentQuestionIndex !== undefined ? confirmData.currentQuestionIndex : actualQuestionIndex;
                questionIdToFrontend = confirmData.questionId !== undefined ? confirmData.questionId : currentQuestionObj.id;
 
                const confirmedAnswer = confirmData.confirmedAnswer || null;
 
                if (actionToFrontend === 'ask_question' || actionToFrontend === 'complete') {
                    if (confirmedAnswer) {
                        userResponses[currentQuestionObj.id] = {
                            question: currentQuestionObj.question,
                            answer: confirmedAnswer,
                            rawTranscript: userMessage
                        };
                        session.responses = userResponses;
                    } else { // Fallback if confirmedAnswer is somehow null but action implies answer
                        userResponses[currentQuestionObj.id] = {
                            question: currentQuestionObj.question,
                            answer: lastPredictedOption,
                            rawTranscript: userMessage
                        };
                        session.responses = userResponses;
                    }
                    session.lastPredictedOption = null; // Clear predicted option after confirmation
 
                    if (actionToFrontend === 'ask_question') {
                        // Find the next question
                        let nextIndex = actualQuestionIndex + 1;
 
                        if (nextIndex < questions.length) {
                            currentQuestionIndex = nextIndex; // Update for session and response
                            session.currentQuestionIndex = currentQuestionIndex; // Update session
                            const nextQ = questions[currentQuestionIndex];
                            nextQuestionText = nextQ.question;
                            questionIdToFrontend = nextQ.id;
                            session.lastQuestionOptions = nextQ.options || [];
                            const nextQuestionNumber = nextIndex + 1;
                            if (nextQ.type === 'freetext') {
                                assistantMessage = `${geminiAssistantMessage} Question ${nextQuestionNumber}: ${nextQuestionText}. Please provide your answer in your own words.`;
                            } else {
                                assistantMessage = `${geminiAssistantMessage} Question ${nextQuestionNumber}: ${nextQuestionText}. The options are: ${nextQ.options.join(', ')}.`;
                            }
                        } else {
                            actionToFrontend = 'complete';
                            assistantMessage = "That's the last question! I'm now summarizing your responses.";
                            nextQuestionText = null;
                            questionIdToFrontend = null;
                            session.lastQuestionOptions = [];
                            session.currentQuestionIndex = questions.length;
                        }
                    } else if (actionToFrontend === 'complete') {
                        session.lastQuestionOptions = [];
                        session.currentQuestionIndex = questions.length;
                        questionIdToFrontend = null;
                        assistantMessage = "You've completed the questionnaire! I'm now summarizing your responses."; // Final message handled below
                    }
                } else if (actionToFrontend === 'clarify' || actionToFrontend === 'repeat_question_gemini_detected') {
                    session.lastPredictedOption = null;
                    session.lastQuestionOptions = currentQuestionObj.options;
                    // currentQuestionIndex and questionIdToFrontend are already set from confirmData/currentQuestionObj
                    nextQuestionText = currentQuestionObj.question; // Repeat the question text for re_ask/clarify
                    const questionNumber = actualQuestionIndex + 1;
                    if (currentQuestionObj.type === 'freetext') {
                        assistantMessage = `${geminiAssistantMessage} Question ${questionNumber}: ${nextQuestionText}. Please provide your answer in your own words.`;
                    } else {
                        assistantMessage = `${geminiAssistantMessage} Question ${questionNumber}: ${nextQuestionText}. The options are: ${currentQuestionObj.options.join(', ')}.`;
                    }
                }
            }
        }
        else if (action === 'submit_final_responses') {
            let summaryMessage = "Your responses have been successfully submitted. Here's what you've provided:\n\n";
            for (const id in userResponses) {
                const responseData = userResponses[id];
                if (responseData && responseData.question && responseData.answer) {
                    summaryMessage += `Question: "${responseData.question}" -> Answered: "${responseData.answer}"\n\n`;
                }
            }
            assistantMessage = summaryMessage + "\nThank you for your time! The session is now complete.";
            actionToFrontend = 'final_submission_complete';
            sessions.delete(sessionId);
            session.currentQuestionIndex = questions.length;
            questionIdToFrontend = null;
            nextQuestionText = null;
            session.lastPredictedOption = null;
            session.lastQuestionOptions = [];
 
        } else if (action === 'repeat_question') { // This is your existing button-triggered repeat logic (KEEP THIS)
            // currentQuestionObj and actualQuestionIndex are already determined above
            if (!currentQuestionObj) {
                console.warn("Backend: Invalid question context for 'repeat_question' action:", session.currentQuestionIndex);
                // Return an error response immediately
                return res.status(400).json({ assistantMessage: "There's no active question to repeat.", action: "error", questionId: null, currentQuestionIndex: session.currentQuestionIndex, nextQuestion: null, responses: userResponses });
            }
            if (currentQuestionObj.type === 'freetext') {
                assistantMessage = `${currentQuestionObj.question} Please provide your answer in your own words.`;
            } else {
                assistantMessage = `${currentQuestionObj.question} The options are: ${currentQuestionObj.options.join(', ')}.`;
            }
            actionToFrontend = 're_ask';
            nextQuestionText = currentQuestionObj.question;
            questionIdToFrontend = currentQuestionObj.id;
            currentQuestionIndex = actualQuestionIndex; // Remain on the same question
            session.lastPredictedOption = null;
            session.lastQuestionOptions = currentQuestionObj.options;
 
        }
        // Fallback for any other unhandled action. This should be the very last `else if` or `else`.
        else if (['ask_readiness', 'ask_question', 'clarify_and_confirm', 'clarify', 're_ask'].includes(actionToFrontend)) {
            // These actions already have their assistantMessage set by Gemini and don't need further modification here
        }
        else {
            console.warn("Backend: Final Fallback for unhandled action:", actionToFrontend);
            assistantMessage = "I'm not sure how to handle that request. Can you please rephrase?";
            actionToFrontend = 'clarify';
            // Use currentQuestionObj for context if available, otherwise reset
            const activeQuestion = currentQuestionObj || questions[session.currentQuestionIndex];
            questionIdToFrontend = activeQuestion ? activeQuestion.id : null;
            currentQuestionIndex = session.currentQuestionIndex;
            session.lastPredictedOption = null;
            session.lastQuestionOptions = activeQuestion ? activeQuestion.options : [];
        }
 
        // Only add to conversation history if it's not a 'complete' action (where it's added earlier)
        // and if the message isn't already the last one (to prevent duplicates during retries/clarifications)
        if (actionToFrontend !== 'complete') {
            if (!conversationHistory.length || conversationHistory[conversationHistory.length - 1].parts[0].text !== assistantMessage) {
                conversationHistory.push({ role: 'model', parts: [{ text: assistantMessage }] });
            }
            session.conversationHistory = conversationHistory;
            sessions.set(sessionId, session);
        }
 
        console.log("Backend: Sending response to frontend ->",
            "Action:", actionToFrontend,
            "Question ID:", questionIdToFrontend,
            "Current Q Index (Session):", session.currentQuestionIndex, // This is the session's overall progress index
            "Actual Q Index Handled (Request):", actualQuestionIndex, // This is the specific Q index for this request
            "Next Question:", nextQuestionText ? nextQuestionText.substring(0, Math.min(nextQuestionText.length, 50)) + '...' : 'N/A', // Truncate for log
            "Assistant Message:", assistantMessage ? assistantMessage.substring(0, Math.min(assistantMessage.length, 50)) + '...' : 'N/A'); // Safely check assistantMessage
 
        res.json({
            assistantMessage: assistantMessage,
            action: actionToFrontend,
            questionId: questionIdToFrontend,
            currentQuestionIndex: session.currentQuestionIndex, // Send session's overall progress index
            nextQuestion: nextQuestionText,
            predictedOption: predictedOption,
            responses: userResponses,
        });
 
    } catch (e) {
        console.error("Backend: Error during /api/chat processing:", e);
        const errorAssistantMessage = `I'm sorry, I encountered an internal error: ${e.message}. Please try again.`;
        // Ensure conversation history is updated with the error message
        if (!conversationHistory.length || conversationHistory[conversationHistory.length - 1].parts[0].text !== errorAssistantMessage) {
            conversationHistory.push({ role: 'model', parts: [{ text: errorAssistantMessage }] });
        }
        session.conversationHistory = conversationHistory;
        sessions.set(sessionId, session); // Save session even on error
        res.status(500).json({
            assistantMessage: errorAssistantMessage,
            action: "error",
            questionId: currentQuestionId, // Keep current context if possible
            currentQuestionIndex: session.currentQuestionIndex,
            nextQuestion: null,
            predictedOption: null,
            responses: userResponses
        });
    }
});
 
 
app.post('/api/google-tts/speak', async (req, res) => {
    const { text, voiceName, ssmlGender, languageCode } = req.body;
    if (!text) {
        return res.status(400).json({ error: 'Missing text in the request body.' });
    }
 
    // Dynamic voice selection logic
    const voiceParams = {
        languageCode: languageCode || 'en-US',
    };
 
    if (voiceName) {
        // If a specific voice name is provided, use it
        voiceParams.name = voiceName;
    } else if (ssmlGender) {
        // Otherwise, use the SSML gender
        voiceParams.ssmlGender = v1.SsmlVoiceGender[ssmlGender] || v1.SsmlVoiceGender.NEUTRAL;
    } else {
        // Fallback to a default voice if neither is provided
        voiceParams.name = 'en-US-Wavenet-C';
    }
 
    const request = {
        input: { text: text },
        voice: voiceParams,
        audioConfig: { audioEncoding: 'MP3' },
    };
 
    try {
        const [response] = await ttsClient.synthesizeSpeech(request);
        const audioContent = response.audioContent;
        const audioBuffer = Buffer.from(audioContent, 'base64');
 
        res.setHeader('Content-Type', 'audio/mpeg');
        res.send(audioBuffer);
 
    } catch (error) {
        console.error("Error during Google Cloud TTS API call:", error);
        res.status(500).json({ error: 'Failed to generate speech audio.' });
    }
});
 
// Translation endpoint
app.post('/api/translate', async (req, res) => {
    const { text, targetLanguage } = req.body;
    
    if (!text || !targetLanguage) {
        return res.status(400).json({ error: 'Missing text or targetLanguage' });
    }

    try {
        const [translation] = await translateClient.translate(text, targetLanguage);
        console.log(`Translated text from ${text} to ${targetLanguage}:`, translation);
        res.json({ translatedText: translation });
    } catch (error) {
        console.error('Translation error:', error);
        res.status(500).json({ error: 'Translation failed' });
    }
});
 
// Form management endpoints
app.post('/api/forms', async (req, res) => {
    try {
        const { title, questions } = req.body;
        const result = await createFormWithQuestions(title, questions);
        res.json({
            success: true,
            form: result.form,
            questionnaires_created: result.questionnaires.length,
            total_questions: result.questionnaires.length * 3, // 3 languages each
            message: `Created form '${title}' with ${result.questionnaires.length} question groups (${result.questionnaires.length * 3} total questions)`
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Test endpoint to create sample form
app.post('/api/test-form', async (req, res) => {
    try {
        const sampleData = {
            title: "ADHD Assessment Form",
            questions: [
                {
                    question_text: "How often do you have trouble focusing?",
                    question_type: "multiple_choice",
                    options: ["Never", "Rarely", "Sometimes", "Often", "Very Often"]
                },
                {
                    question_text: "How often do you feel restless?",
                    question_type: "multiple_choice",
                    options: ["Never", "Rarely", "Sometimes", "Often", "Very Often"]
                },
                {
                    question_text: "Describe your daily routine",
                    question_type: "freetext"
                }
            ]
        };
        
        const result = await createFormWithQuestions(sampleData.title, sampleData.questions);
        res.json({
            success: true,
            message: "Test form created successfully!",
            form_id: result.form._id,
            questionnaires_created: result.questionnaires.length,
            total_questions: result.questionnaires.length * 3
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/forms/:formId/questions', async (req, res) => {
    try {
        const { formId } = req.params;
        const { language = 'en' } = req.query;
        const result = await getFormQuestions(formId, language);
        res.json(result);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/forms', async (req, res) => {
    try {
        const forms = await Form.find().sort({ createdAt: -1 });
        res.json(forms);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Delete form and all its related data
app.delete('/api/forms/:formId', async (req, res) => {
    try {
        const { formId } = req.params;
        
        // Find the form first
        const form = await Form.findById(formId);
        if (!form) {
            return res.status(404).json({ error: 'Form not found' });
        }
        
        // Find all questionnaires for this form
        const questionnaires = await Questionnaire.find({ form_id: formId });
        const questionnaireIds = questionnaires.map(q => q._id.toString());
        
        // Find all questions for these questionnaires
        const questions = await Question.find({ questionnaire_id: { $in: questionnaireIds } });
        const questionIds = questions.map(q => q._id);
        
        // Delete all options for these questions
        const deletedOptions = await Option.deleteMany({ question_id: { $in: questionIds } });
        
        // Delete all questions
        const deletedQuestions = await Question.deleteMany({ questionnaire_id: { $in: questionnaireIds } });
        
        // Delete all questionnaires
        const deletedQuestionnaires = await Questionnaire.deleteMany({ form_id: formId });
        
        // Delete the form itself
        await Form.findByIdAndDelete(formId);
        
        res.json({
            message: 'Form and all related data deleted successfully',
            deleted_form: form.title,
            deleted_questionnaires: deletedQuestionnaires.deletedCount,
            deleted_questions: deletedQuestions.deletedCount,
            deleted_options: deletedOptions.deletedCount
        });
        
    } catch (error) {
        console.error('Error deleting form:', error);
        res.status(500).json({ error: error.message });
    }
});

// Get approved questions for questionnaire
app.get('/api/forms/approved-questions', async (req, res) => {
    try {
        const { language = 'en' } = req.query;
        
        // Get questionnaire_ids where ALL languages are approved
        const fullyApprovedQuestionnaireIds = await Question.aggregate([
            { $group: { 
                _id: '$questionnaire_id', 
                totalQuestions: { $sum: 1 },
                approvedQuestions: { $sum: { $cond: [{ $and: ['$is_approved', { $eq: ['$status', 'approved'] }] }, 1, 0] } }
            }},
            { $match: { $expr: { $eq: ['$totalQuestions', '$approvedQuestions'] } } },
            { $project: { _id: 1 } }
        ]);
        
        const approvedQids = fullyApprovedQuestionnaireIds.map(item => item._id.toString());
        console.log(`DEBUG: Fully approved questionnaire IDs for ${language}:`, approvedQids);
        
        // Find questions for the specified language from fully approved questionnaire groups
        const questions = await Question.find({
            language: language,
            is_approved: true,
            status: 'approved',
            questionnaire_id: { $in: approvedQids }
        }).sort({ createdAt: 1 });
        console.log(`DEBUG: Found ${questions.length} questions for language ${language} from approved questionnaires`);
        questions.forEach(q => console.log(`  - Question: ${q.question_text.substring(0, 50)}... (QID: ${q.questionnaire_id})`));

        // Get options for each question
        const questionsWithOptions = await Promise.all(questions.map(async (question) => {
            const options = await Option.find({ 
                questionnaire_id: question.questionnaire_id,
                language: language,
                is_approved: true,
                status: 'approved'
            }).sort({ sort_order: 1 });

            return {
                ...question.toObject(),
                options: options.map(opt => opt.option_text),
                qid: question.questionnaire_id
            };
        }));
        
        console.log(`Found ${questionsWithOptions.length} approved questions for language: ${language}`);
        res.json(questionsWithOptions);
    } catch (error) {
        console.error('Error fetching approved questions:', error);
        res.status(500).json({ error: error.message });
    }
});

// REGISTER ADMIN ROUTES
adminRoutes(app);

// FIXED: Use the port variable consistently and add error handling
connectMongo().then(() => {
    console.log("Database Connected successfully");
    app.listen(port, () => {
        console.log(`Server is running on port ${port}`);
        console.log(`Admin API available at: http://localhost:${port}/api/admin/questions`);
        console.log(`Test endpoint: http://localhost:${port}/test`);
    });
}).catch((err) => {
    console.log("Database Connection Failed", err);
    process.exit(1);
});

