require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const textToSpeech = require('@google-cloud/text-to-speech');
const { v1 } = require('@google-cloud/text-to-speech');
const { Translate } = require('@google-cloud/translate').v2;
 
 
const app = express();
const port = process.env.PORT || 3001;
app.use(cors());
app.use(express.json()); // To parse JSON request bodies
 
// --- Google Gemini Setup ---
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
if (!GEMINI_API_KEY) {
    console.error("GEMINI_API_KEY is not set in .env file. Please create a .env file with GEMINI_API_KEY='your_api_key'");
    process.exit(1);
}
const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-1.5-pro-latest" });
 
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
// --- Google Cloud Text-to-Speech Setup ---
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
 
// Helper to safely parse Gemini's JSON, handling potential markdown blocks
function safeParseGeminiJson(text) {
    try {
        const jsonMatch = text.match(/```json\n([\s\S]*?)\n```/);
        if (jsonMatch && jsonMatch[1]) {
            return JSON.parse(jsonMatch[1]);
        }
        return JSON.parse(text); // Try parsing directly if no markdown block
    } catch (e) {
        console.error("Failed to parse Gemini JSON:", e, "Raw text:", text);
        return null;
    }
}
 
// 1. Start a new session
app.post('/api/start-session', (req, res) => {
    const sessionId = generateSessionId();
    sessions.set(sessionId, {
        conversationHistory: [],
        responses: {},
        currentQuestionIndex: 0, // This is the 0-based index of the question *to be asked next*
        lastPredictedOption: null, // Stores the predicted option from Gemini for VAGUE answer confirmation
        lastQuestionOptions: [], // Store options for current question if clarification is needed
        reviewMode: false // New state variable: true if in review, false otherwise
    });
    console.log(`New session started: ${sessionId}`);
    res.json({ sessionId });
});
 
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
 
    try {
        // Add user message to conversation history BEFORE sending to Gemini for context
        conversationHistory.push({ role: 'user', parts: [{ text: userMessage }] });
 
        if (action === 'init_questionnaire') {
            const initPrompt = `You are an empathetic AI assistant guiding a user through a fixed ADHD questionnaire.
                Start by introducing the questionnaire, explaining its purpose (to understand daily experiences with information processing and environment interaction, not for diagnosis, emphasizing honesty, no right/wrong answers), and ask if they are ready to begin.
                The questionnaire has ${questions.length} questions.
 
                Your response MUST be a JSON object and NOTHING ELSE.
                The JSON object MUST have the following exact structure and values for this initial introduction:
                {
                  "assistantMessage": "Hello! I'm here to guide you through a short questionnaire designed to help us better understand your daily experiences with how you process information and interact with your environment. This isn't a diagnostic tool, so there are no right or wrong answers. Your honest responses are the most valuable. This questionnaire will help you better understand yourself. Are you ready to begin?",
                  "action": "ask_readiness",
                  "questionId": null,
                  "currentQuestionIndex": 0
                }
 
                STRICTLY output only the JSON object. Do NOT include any markdown formatting (e.g., \`\`\`json), comments, or any extra text before or after the JSON. Provide the JSON directly.`;
 
            console.log("Backend: Sending prompt to Gemini for init_questionnaire.");
            const initResult = await model.generateContent(initPrompt);
            const initResponseText = initResult.response.text();
            console.log("Backend: Gemini Raw Response (init_questionnaire):", initResponseText);
 
            const initData = safeParseGeminiJson(initResponseText);
 
            if (!initData) {
                throw new Error("Gemini response for init_questionnaire could not be parsed.");
            }
 
            assistantMessage = initData.assistantMessage;
            actionToFrontend = initData.action;
            questionIdToFrontend = initData.questionId;
            currentQuestionIndex = initData.currentQuestionIndex; // Should be 0
            session.currentQuestionIndex = currentQuestionIndex; // Update session index
            session.lastQuestionOptions = []; // No options at this stage
 
        } else if (action === 'confirm_readiness') {
            const readinessConfirmationPrompt = `The user's response was "${userMessage}". You previously asked if they were ready to start the questionnaire.
                Determine if their response indicates they are ready (e.g., "yes", "I am", "ready", "start").
                If they are ready:
                - Set "action" to "confirm_readiness".
                - Provide a short, positive "assistantMessage" acknowledging they are ready.
                If they are not ready or the response is unclear:
                - Set "action" to "clarify".
                - Ask them again if they are ready to begin the questionnaire.
 
                Provide your response as a JSON object with:
                - "assistantMessage": [string]
                - "action": ["confirm_readiness" or "clarify"]
                - "questionId": [null]
                - "currentQuestionIndex": [0]
 
                Strictly output only the JSON object. Do not include any other text outside the JSON.`;
 
            console.log("Backend: Sending prompt to Gemini for readiness confirmation.");
            const readinessResult = await model.generateContent(readinessConfirmationPrompt);
            const readinessResponseText = readinessResult.response.text();
            console.log("Backend: Gemini Raw Response (readiness confirmation):", readinessResponseText);
 
            const readinessData = safeParseGeminiJson(readinessResponseText);
 
            if (!readinessData) {
                throw new Error("Gemini response for confirm_readiness could not be parsed.");
            }
 
            assistantMessage = readinessData.assistantMessage;
            actionToFrontend = readinessData.action;
            questionIdToFrontend = readinessData.questionId;
            currentQuestionIndex = readinessData.currentQuestionIndex; // Should still be 0
 
            if (actionToFrontend === 'confirm_readiness') {
                if (questions.length > 0) {
                    const firstQuestion = questions[0];
                    nextQuestionText = firstQuestion.question;
                    questionIdToFrontend = firstQuestion.id;
                    actionToFrontend = 'ask_question';
                    currentQuestionIndex = 0;
                    if (firstQuestion.type === 'freetext') {
                        assistantMessage = `${assistantMessage} Question ${parseInt(firstQuestion.id) + 1}: ${nextQuestionText}. Please provide your answer in your own words.`;
                    } else {
                        assistantMessage = `${assistantMessage} Question ${parseInt(firstQuestion.id) + 1}: ${nextQuestionText}. The options are: ${firstQuestion.options.join(', ')}.`;
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
            // currentQuestionObj and actualQuestionIndex are already determined above
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
                There are a total of ${questions.length} questions. The current question is question number ${parseInt(currentQuestionObj.id) + 1}.`;
            } else {
                answerPrompt = `You are an empathetic AI assistant guiding a user through a fixed ADHD questionnaire.
                The current question being answered is: "${currentQuestionObj.question}".
                The user's response options are: ${currentQuestionObj.options.join(', ')}.
                There are a total of ${questions.length} questions. The current question is question number ${parseInt(currentQuestionObj.id) + 1}.`;
            }
 
            answerPrompt += `
                Based on the user's last input "${userMessage}", categorize their answer.`;
            
            if (currentQuestionObj.type === 'freetext') {
                answerPrompt += `
                For FREE TEXT questions, you MUST respond with one of the following actions:
                - "ask_question": If the user provides any meaningful response (even if brief), and there are more questions remaining after this one.
                    The "assistantMessage" should be a *simple acknowledgement* (e.g., "Thank you for sharing.", "I understand.", "Got it."). The backend will append the next question.
                - "complete": If the user provides any meaningful response, and this is the *last* question.
                    The "assistantMessage" should be a *simple acknowledgement* (e.g., "Thank you for your response.", "I appreciate your input."). The backend will generate the completion message.
                - "repeat_question_gemini_detected": If the user's input clearly asks to repeat the question (e.g., "repeat that", "say it again", "what was the question?", "can you repeat?").
                    The "assistantMessage" should be a confirmation (e.g., "Certainly, here is the question again." or "No problem, listening again for this question.").
                - "clarify": If the input is completely irrelevant, uninterpretable, or asks a non-explanation related question that is *not* a repeat request, ask for clarification by encouraging them to share their thoughts or experiences related to the question.`;
            } else {
                answerPrompt += `
                You MUST respond with one of the following actions:
                - "ask_question": If the user's input clearly indicates one of the fixed options, and there are more questions remaining after this one.
                    The "assistantMessage" should be a *simple acknowledgement* (e.g., "Understood.", "Okay.", "Got it."). The backend will append the next question.
                - "complete": If the user's input clearly indicates one of the fixed options, and this is the *last* question.
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
 
            console.log("Backend: Sending prompt to Gemini for answer processing (answer/re_answer_specific_question).");
            const answerResult = await model.generateContent(answerPrompt);
            const answerResponseText = answerResult.response.text();
            console.log("Backend: Gemini Raw Response (answer processing):", answerResponseText);
 
            const answerData = safeParseGeminiJson(answerResponseText);
 
            if (!answerData) {
                throw new Error("Gemini response for answer/re_answer could not be parsed.");
            }
 
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
 
            session.lastPredictedOption = predictedOption; // Update last predicted option for confirmation flow
 
            // Handle the response based on the action determined by Gemini
            if (actionToFrontend === 'ask_question') {
                session.lastPredictedOption = null; // Clear if not needed
 
                // Find the next *unanswered* question or just the next sequential one
                // This logic handles both regular progression and continuing after a re-answer
                let nextIndex = actualQuestionIndex + 1; // Start checking from the next logical question
                while (nextIndex < questions.length && userResponses[questions[nextIndex].id]) {
                    // Skip questions that are already answered
                    nextIndex++;
                }
 
                if (nextIndex < questions.length) {
                    currentQuestionIndex = nextIndex; // Update for session and response
                    session.currentQuestionIndex = currentQuestionIndex; // Update session
                    const nextQ = questions[currentQuestionIndex];
                    nextQuestionText = nextQ.question;
                    questionIdToFrontend = nextQ.id;
                    session.lastQuestionOptions = nextQ.options || [];
                    if (nextQ.type === 'freetext') {
                        assistantMessage = `${geminiAssistantMessage} Question ${parseInt(nextQ.id) + 1}: ${nextQuestionText}. Please provide your answer in your own words.`;
                    } else {
                        assistantMessage = `${geminiAssistantMessage} Question ${parseInt(nextQ.id) + 1}: ${nextQuestionText}. The options are: ${nextQ.options.join(', ')}.`;
                    }
                } else {
                    // All questions answered, transition to 'complete'
                    actionToFrontend = 'complete';
                    assistantMessage = "You've completed the questionnaire! I'm now summarizing your responses.";
                    nextQuestionText = null;
                    questionIdToFrontend = null;
                    session.lastQuestionOptions = [];
                    currentQuestionIndex = questions.length;
                    session.currentQuestionIndex = questions.length; // Indicate completion
                }
 
            } else if (actionToFrontend === 'complete') {
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
                if (actionToFrontend === 'repeat_question_gemini_detected') {
                    if (currentQuestionObj.type === 'freetext') {
                        assistantMessage = `${geminiAssistantMessage} Question ${parseInt(currentQuestionObj.id) + 1}: ${nextQuestionText}. Please provide your answer in your own words.`;
                    } else {
                        assistantMessage = `${geminiAssistantMessage} Question ${parseInt(currentQuestionObj.id) + 1}: ${nextQuestionText}. The options are: ${currentQuestionObj.options.join(', ')}.`;
                    }
                } else {
                    assistantMessage = geminiAssistantMessage; // Gemini provides the full message
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
                    There are a total of ${questions.length} questions. The current question is question number ${parseInt(currentQuestionObj.id) + 1}.
 
                    If confirmed:
                    - Set "action" to "ask_question" if more questions, or "complete" if last question.
                    - Provide a *simple acknowledgement* in "assistantMessage" (e.g., "Confirmed.", "Okay."). The backend will append the next question/completion.
                    - The confirmed answer is "${lastPredictedOption}".
 
                    If denied AND a new clear option is provided (e.g., user says "no, I mean Rarely"):
                    - Set "action" to "ask_question" if more questions, or "complete" if last question.
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
 
                console.log("Backend: Sending prompt to Gemini for verbal confirmation of vague answer:", confirmationPrompt);
                const confirmResult = await model.generateContent(confirmationPrompt);
                const confirmResponseText = confirmResult.response.text();
                console.log("Backend: Gemini Raw Response (verbal confirmation of vague answer):", confirmResponseText);
 
                const confirmData = safeParseGeminiJson(confirmResponseText);
 
                if (!confirmData) {
                    throw new Error("Gemini response for confirm_vague_answer could not be parsed.");
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
                        // Find the next *unanswered* question or just the next sequential one
                        let nextIndex = actualQuestionIndex + 1;
                        while (nextIndex < questions.length && userResponses[questions[nextIndex].id]) {
                            nextIndex++;
                        }
 
                        if (nextIndex < questions.length) {
                            currentQuestionIndex = nextIndex; // Update for session and response
                            session.currentQuestionIndex = currentQuestionIndex; // Update session
                            const nextQ = questions[currentQuestionIndex];
                            nextQuestionText = nextQ.question;
                            questionIdToFrontend = nextQ.id;
                            session.lastQuestionOptions = nextQ.options || [];
                            if (nextQ.type === 'freetext') {
                                assistantMessage = `${geminiAssistantMessage} Question ${parseInt(nextQ.id) + 1}: ${nextQuestionText}. Please provide your answer in your own words.`;
                            } else {
                                assistantMessage = `${geminiAssistantMessage} Question ${parseInt(nextQ.id) + 1}: ${nextQuestionText}. The options are: ${nextQ.options.join(', ')}.`;
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
                    if (actionToFrontend === 'repeat_question_gemini_detected') {
                        if (currentQuestionObj.type === 'freetext') {
                            assistantMessage = `${geminiAssistantMessage} Question ${parseInt(currentQuestionObj.id) + 1}: ${nextQuestionText}. Please provide your answer in your own words.`;
                        } else {
                            assistantMessage = `${geminiAssistantMessage} Question ${parseInt(currentQuestionObj.id) + 1}: ${nextQuestionText}. The options are: ${currentQuestionObj.options.join(', ')}.`;
                        }
                    } else {
                        assistantMessage = geminiAssistantMessage; // Gemini provides the full message
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

app.put('/api/admin/questions/:id', async(req, res) => {
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

app.listen(port, () => {
    console.log(`Backend server running on http://localhost:${port}`);
    console.log(`Ensure your GEMINI_API_KEY is set in your .env file.`);
    console.log(`Admin panel available at: http://localhost:5173/admin`);
});