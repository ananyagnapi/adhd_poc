require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { GoogleGenerativeAI } = require('@google/generative-ai');

const app = express();
const port = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json()); // To parse JSON request bodies

// --- Google Gemini Setup ---
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
if (!GEMINI_API_KEY) {
    console.error("GEMINI_API_KEY is not set in .env file.");
    process.exit(1);
}
const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
const model = genAI.getGenerativeModel({
    model: "gemini-1.5-flash",
    generationConfig: { responseMimeType: "application/json" }
});

// --- Questios ---
const questions = [
    { id: 1, question: "How often do you find it difficult to focus on a task when there are distractions around you?", options: ["Never", "Rarely", "Sometimes", "Often", "Very Often"] },
    { id: 2, question: "How often do you forget appointments or important dates?", options: ["Never", "Rarely", "Sometimes", "Often", "Very Often"] },
    { id: 3, question: "How often do you interrupt others or finish their sentences?", options: ["Never", "Rarely", "Sometimes", "Often", "Very Often"] },
];


const sessions = new Map();

function generateSessionId() {
    return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
}

// --- API Endpoints ---

// 1. Start a new session
app.post('/api/start-session', (req, res) => {
    const sessionId = generateSessionId();
    sessions.set(sessionId, {
        conversationHistory: [],
        responses: {},
        currentQuestionIndex: 0, // This is the 0-based index of the question *to be asked next*
        lastPredictedOption: null, // Stores the predicted option from Gemini for VAGUE answer confirmation
        lastQuestionOptions: [] // Store options for current question if clarification is needed
    });
    console.log(`New session started: ${sessionId}`);
    res.json({ sessionId });
});

// 2. Main chat endpoint
app.post('/api/chat', async (req, res) => {
    const { sessionId, userMessage, action, currentQuestionId, awaitingVagueConfirmation } = req.body;

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

    let assistantMessage;
    let nextQuestion = null; // Text of the next question, determined by backend
    let actionToFrontend = action;
    let questionIdToFrontend = currentQuestionId; // Will be the ID of the question currently being addressed
    let currentQuestionIndex = session.currentQuestionIndex; // Index of the question to be asked/answered
    let predictedOption = session.lastPredictedOption; // Get the last predicted option for potential verbal confirmation
    let currentQuestionOptions = session.lastQuestionOptions; // Get options for the current question

    try {
        // Add user message to conversation history BEFORE sending to Gemini for context
        conversationHistory.push({ role: 'user', parts: [{ text: userMessage }] });

        if (action === 'init_questionnaire') {
            const initPrompt = `You are an empathetic AI assistant guiding a user through a fixed ADHD questionnaire.
                Start by introducing the questionnaire, explaining its purpose (to understand daily experiences with information processing and environment interaction, not for diagnosis, emphasizing honesty, no right/wrong answers), and ask if they are ready to begin.
                The questionnaire has ${questions.length} questions.
                Provide your response as a JSON object with:
                - "assistantMessage": [string]
                - "action": ["ask_readiness"]
                - "questionId": [null]
                - "currentQuestionIndex": [0]

                Strictly output only the JSON object. Do not include any other text outside the JSON.`;

            const initResult = await model.generateContent(initPrompt);
            const initResponseText = initResult.response.text();
            console.log("Backend: Gemini Raw Response (init_questionnaire prompt):", initResponseText);

            const initData = JSON.parse(initResponseText);
            assistantMessage = initData.assistantMessage;
            actionToFrontend = initData.action;
            questionIdToFrontend = initData.questionId;
            currentQuestionIndex = 0; // Always start at 0
            session.currentQuestionIndex = currentQuestionIndex;

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

            console.log("Backend: Sending prompt to Gemini for readiness confirmation:", readinessConfirmationPrompt);
            const readinessResult = await model.generateContent(readinessConfirmationPrompt);
            const readinessResponseText = readinessResult.response.text();
            console.log("Backend: Gemini Raw Response (readiness confirmation):", readinessResponseText);

            const readinessData = JSON.parse(readinessResponseText);
            assistantMessage = readinessData.assistantMessage;
            actionToFrontend = readinessData.action;

            if (actionToFrontend === 'confirm_readiness') {
                // If ready, immediately ask the first question
                currentQuestionIndex = 0; // Set to the first question
                nextQuestion = questions[currentQuestionIndex].question;
                questionIdToFrontend = questions[currentQuestionIndex].id;
                actionToFrontend = 'ask_question'; // Transition to asking the first question
                // Backend constructs the full message including the question
                assistantMessage = `${assistantMessage} Question ${currentQuestionIndex + 1}: ${nextQuestion}.`;
                session.lastQuestionOptions = questions[currentQuestionIndex].options; // Store options for current question
                session.currentQuestionIndex = currentQuestionIndex; // Update session index
            } else {
                // Clarify readiness
                questionIdToFrontend = null;
                currentQuestionIndex = 0; // Remain at initial state for readiness
                session.lastQuestionOptions = []; // Clear options
            }

        } else if (action === 'answer') { // Handles initial answer to a question
            const currentQuestionObj = questions[session.currentQuestionIndex];
            if (!currentQuestionObj || currentQuestionObj.id !== currentQuestionId) {
                console.warn("Backend: Mismatch or invalid question ID for 'answer' action:", currentQuestionId, "Session Index:", session.currentQuestionIndex);
                return res.status(400).json({ assistantMessage: "Invalid or outdated question context. Please try again.", action: "error", questionId: null, currentQuestionIndex: session.currentQuestionIndex });
            }

            const answerPrompt = `You are an empathetic AI assistant guiding a user through a fixed ADHD questionnaire.
                The current question being answered is: "${currentQuestionObj.question}".
                The user's response options are: ${currentQuestionObj.options.join(', ')}.
                There are a total of ${questions.length} questions. The current question is question number ${session.currentQuestionIndex + 1}.

                Based on the user's last input "${userMessage}", categorize their answer into one of the options.
                You MUST respond with one of the following actions:
                - "ask_question": If the user's input clearly indicates one of the fixed options, and there are more questions.
                    The "assistantMessage" should be a *simple acknowledgement* (e.g., "Understood.", "Okay.", "Got it."). The backend will append the next question.
                - "complete": If the user's input clearly indicates one of the fixed options, and this is the last question.
                    The "assistantMessage" should be a *simple acknowledgement* (e.g., "Understood.", "Great."). The backend will generate the completion message.
                - "clarify_and_confirm": If the input is vague or could refer to multiple options, infer the most likely option.
                    The assistantMessage should then ask for confirmation of the inferred option AND provide the list of options for clarity.
                    (e.g., "I think you mean [Inferred Option]. Is that correct (yes/no), or would you like to choose from ${currentQuestionObj.options.join(', ')}?").
                - "clarify": If the input is completely irrelevant, uninterpretable, or asks a non-explanation related question, ask for clarification by prompting them to choose from the given options or rephrase their answer.

                Provide your response as a JSON object with the following keys:
                - "assistantMessage": [string, the text the assistant should say to the user *before* the next question is appended by the backend, or the full clarification message.]
                - "predictedOption": [string, the inferred option for "clarify_and_confirm" action, otherwise null.]
                - "action": [string, "ask_question", "clarify_and_confirm", "clarify", "complete"]
                - "questionId": [number, the ID of the *next* question for "ask_question"/"complete", or *current* question for "clarify_and_confirm"/"clarify"]
                - "currentQuestionIndex": [number, the 0-based index of the *next* question for "ask_question"/"complete", or *current* question for "clarify_and_confirm"/"clarify"]
                - "confirmedAnswer": [string, the fixed option if the answer is clear, otherwise null. This is for your internal backend use to save the response.]

                Strictly output only the JSON object. Do not include any other text outside the JSON.

                Recent Conversation History:
                ${conversationHistory.map(entry => `${entry.role}: ${entry.parts[0].text}`).join('\n')}
            `;

            console.log("Backend: Sending prompt to Gemini for answer processing:", answerPrompt);
            const answerResult = await model.generateContent(answerPrompt);
            const answerResponseText = answerResult.response.text();
            console.log("Backend: Gemini Raw Response (answer processing):", answerResponseText);

            const answerData = JSON.parse(answerResponseText);
            let geminiAssistantMessage = answerData.assistantMessage; // Store Gemini's direct message
            actionToFrontend = answerData.action;
            questionIdToFrontend = answerData.questionId;
            predictedOption = answerData.predictedOption || null; // Store predicted option if provided
            const confirmedAnswer = answerData.confirmedAnswer || null; // The clear answer if confirmed by Gemini

            if (confirmedAnswer) {
                userResponses[currentQuestionObj.id] = {
                    question: currentQuestionObj.question,
                    answer: confirmedAnswer,
                    rawTranscript: userMessage // The initial answer
                };
                session.responses = userResponses;
            }

            if (actionToFrontend === 'ask_question') {
                session.lastPredictedOption = null; // Clear if not needed
                // Calculate next question index correctly for 'ask_question'
                currentQuestionIndex = session.currentQuestionIndex + 1;
                session.currentQuestionIndex = currentQuestionIndex; // Update session index
                if (currentQuestionIndex < questions.length) {
                    nextQuestion = questions[currentQuestionIndex].question;
                    questionIdToFrontend = questions[currentQuestionIndex].id;
                    session.lastQuestionOptions = questions[currentQuestionIndex].options;
                    // BACKEND CONSTRUCTS THE FULL ASSISTANT MESSAGE
                    assistantMessage = `${geminiAssistantMessage} Question ${currentQuestionIndex + 1}: ${nextQuestion}.`;
                } else {
                    // This scenario should be caught by 'complete' action from Gemini,
                    // but as a safety, if we somehow get 'ask_question' for a non-existent question:
                    actionToFrontend = 'complete'; // Force complete
                    assistantMessage = "That's the last question! I'm now summarizing your responses.";
                    nextQuestion = null;
                    questionIdToFrontend = null;
                    session.lastQuestionOptions = [];
                }
            } else if (actionToFrontend === 'complete') {
                session.lastPredictedOption = null; // Clear if not needed
                session.lastQuestionOptions = [];
                nextQuestion = null; // No next question on complete
                questionIdToFrontend = null; // No current question on complete
                session.currentQuestionIndex = questions.length; // Mark as completed
                // BACKEND CONSTRUCTS THE FULL ASSISTANT MESSAGE FOR COMPLETION
                assistantMessage = "You've completed the questionnaire! I'm now summarizing your responses."; // Simple acknowledgement before summary logic
            } else if (actionToFrontend === 'clarify_and_confirm') {
                session.lastPredictedOption = predictedOption; // Store for verbal confirmation
                session.lastQuestionOptions = currentQuestionObj.options; // Keep current options handy
                assistantMessage = geminiAssistantMessage; // Gemini provides the full message here
                // questionIdToFrontend and currentQuestionIndex should remain for the current question
                // Do NOT increment currentQuestionIndex here, as we are still on the same question
            } else if (actionToFrontend === 'clarify') {
                session.lastPredictedOption = null; // Clear any pending prediction
                session.lastQuestionOptions = currentQuestionObj.options; // Keep current options handy
                assistantMessage = geminiAssistantMessage; // Gemini provides the full message here
                // Do NOT increment currentQuestionIndex here, as we are still on the same question
            }


        } else if (action === 'confirm_vague_answer') { // Handles confirmation for vague answers
            const currentQuestionObj = questions[session.currentQuestionIndex];
            if (!currentQuestionObj || currentQuestionObj.id !== currentQuestionId) {
                console.warn("Backend: Mismatch or invalid question ID for 'confirm_vague_answer' action:", currentQuestionId, "Session Index:", session.currentQuestionIndex);
                assistantMessage = "I seem to have lost track of the question. Can we restart?";
                actionToFrontend = 'clarify'; // Or 'error'
                questionIdToFrontend = null;
                currentQuestionIndex = 0;
                session.currentQuestionIndex = currentQuestionIndex;
                session.lastPredictedOption = null;
                session.lastQuestionOptions = [];
            }

            let lastPredictedOption = session.lastPredictedOption;
            let questionOptionsForClarification = session.lastQuestionOptions;

            if (!lastPredictedOption) {
                console.warn("Backend: No lastPredictedOption found for vague confirmation. Clarifying.");
                assistantMessage = `I didn't get a clear confirmation. Please tell me if the previous answer was correct (say 'yes' or 'no') or choose from: ${questionOptionsForClarification.join(', ')}.`;
                actionToFrontend = 'clarify';
                questionIdToFrontend = currentQuestionObj.id; // Keep current question context
                currentQuestionIndex = session.currentQuestionIndex;
            } else {
                const confirmationPrompt = `The user's previous answer was inferred as "${lastPredictedOption}" for the question "${currentQuestionObj.question}".
                    The user's latest response for confirmation is "${userMessage}".
                    Determine if the user's response ("${userMessage}") indicates confirmation (e.g., "yes", "correct", "that's right") or denial (e.g., "no", "incorrect", "try again", "rephrase").
                    If denial, also try to infer if they are providing a *different* valid option from: ${currentQuestionObj.options.join(', ')}.
                    There are a total of ${questions.length} questions. The current question is question number ${session.currentQuestionIndex + 1}.

                    If confirmed:
                    - Set "action" to "ask_question" if more questions, or "complete" if last question.
                    - Provide a *simple acknowledgement* in "assistantMessage" (e.g., "Confirmed.", "Okay."). The backend will append the next question/completion.
                    - The confirmed answer is "${lastPredictedOption}".

                    If denied AND a new clear option is provided (e.g., user says "no, I mean Rarely"):
                    - Set "action" to "ask_question" if more questions, or "complete" if last question.
                    - Provide a *simple acknowledgement* in "assistantMessage" (e.g., "Understood.", "Correction noted."). The backend will append the next question/completion.
                    - The confirmed answer is the *new* option.

                    If denied or unclear, and NO new clear option is provided:
                    - Set "action" to "clarify".
                    - Ask the user to rephrase their answer or choose from the options: ${currentQuestionObj.options.join(', ')}.
                    - The "assistantMessage" should clearly prompt them to re-answer the *current* question and include options.

                    Provide your response as a JSON object with:
                    - "assistantMessage": [string, acknowledgement or clarification]
                    - "action": ["ask_question", "clarify", "complete"]
                    - "questionId": [number, the ID of the next question or current question if clarifying]
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

                const confirmData = JSON.parse(confirmResponseText);
                let geminiAssistantMessage = confirmData.assistantMessage; // Store Gemini's direct message
                actionToFrontend = confirmData.action;
                // nextQuestion = confirmData.nextQuestion || null; // No longer taking nextQuestion from Gemini
                // currentQuestionIndex and confirmedAnswer should come directly from Gemini's response
                currentQuestionIndex = confirmData.currentQuestionIndex; // Update from Gemini's response
                questionIdToFrontend = confirmData.questionId;
                const confirmedAnswer = confirmData.confirmedAnswer || null;

                if (actionToFrontend === 'ask_question' || actionToFrontend === 'complete') {
                    if (confirmedAnswer) {
                        userResponses[currentQuestionObj.id] = {
                            question: currentQuestionObj.question,
                            answer: confirmedAnswer, // Use the confirmed/corrected answer
                            rawTranscript: userMessage // The "yes", "no, [new_option]"
                        };
                        session.responses = userResponses; // Update session with new response
                    } else {
                        // Fallback if Gemini somehow didn't provide confirmedAnswer but said ask_question/complete
                        userResponses[currentQuestionObj.id] = {
                            question: currentQuestionObj.question,
                            answer: lastPredictedOption, // Use the last predicted if no new one
                            rawTranscript: userMessage
                        };
                        session.responses = userResponses;
                    }
                    session.lastPredictedOption = null; // Clear predicted option after confirmation

                    // Logic to handle next question or completion
                    if (actionToFrontend === 'ask_question') {
                        // Gemini should have returned the *next* index.
                        // We check bounds locally to be safe.
                        if (currentQuestionIndex < questions.length) {
                            nextQuestion = questions[currentQuestionIndex].question; // Get next question text
                            session.lastQuestionOptions = questions[currentQuestionIndex].options;
                            session.currentQuestionIndex = currentQuestionIndex;
                            // BACKEND CONSTRUCTS THE FULL ASSISTANT MESSAGE
                            assistantMessage = `${geminiAssistantMessage} Question ${currentQuestionIndex + 1}: ${nextQuestion}.`;
                        } else {
                            // Should not happen if Gemini correctly sets 'complete', but as a fallback
                            actionToFrontend = 'complete';
                            assistantMessage = "That's the last question! I'm now summarizing your responses.";
                            nextQuestion = null;
                            questionIdToFrontend = null;
                            session.lastQuestionOptions = [];
                            session.currentQuestionIndex = questions.length;
                        }
                    } else if (actionToFrontend === 'complete') {
                        session.lastQuestionOptions = [];
                        session.currentQuestionIndex = questions.length; // Mark as completed
                        questionIdToFrontend = null; // No current question on complete
                        // BACKEND CONSTRUCTS THE FULL ASSISTANT MESSAGE FOR COMPLETION
                        assistantMessage = "You've completed the questionnaire! I'm now summarizing your responses."; // Simple acknowledgement before summary logic
                    }
                } else if (actionToFrontend === 'clarify') {
                    // User denied or unclear, needs to re-answer the same question
                    session.lastPredictedOption = null; // Clear the predicted option
                    session.lastQuestionOptions = currentQuestionObj.options; // Keep current options
                    // currentQuestionIndex and questionIdToFrontend should remain for current question
                    session.currentQuestionIndex = questions.findIndex(q => q.id === currentQuestionId);
                    assistantMessage = geminiAssistantMessage; // Gemini provides the full clarification message
                }
            }

        } else if (action === 'repeat_question') {
            const currentQuestionObj = questions[session.currentQuestionIndex];
            if (!currentQuestionObj) {
                console.warn("Backend: Invalid question context for 'repeat_question' action:", session.currentQuestionIndex);
                return res.status(400).json({ assistantMessage: "There's no active question to repeat.", action: "error", questionId: null, currentQuestionIndex: session.currentQuestionIndex });
            }

            assistantMessage = `${currentQuestionObj.question} The options are: ${currentQuestionObj.options.join(', ')}.`;
            actionToFrontend = 're_ask'; // Indicate to frontend that it's a re-ask
            nextQuestion = currentQuestionObj.question; // The question text itself
            questionIdToFrontend = currentQuestionObj.id; // The ID of the current question
            currentQuestionIndex = session.currentQuestionIndex; // Remain on the same question
            session.lastPredictedOption = null; // Clear any pending prediction
            session.lastQuestionOptions = currentQuestionObj.options; // Keep current options handy

        } else {
            console.warn("Backend: Unhandled action:", action);
            assistantMessage = "I'm not sure how to handle that request. Can you please rephrase?";
            actionToFrontend = 'clarify'; // Fallback for unhandled actions
            // Use the session's currentQuestionIndex for context
            const activeQuestion = questions[session.currentQuestionIndex];
            questionIdToFrontend = activeQuestion ? activeQuestion.id : null;
            currentQuestionIndex = session.currentQuestionIndex;
            session.lastPredictedOption = null;
            session.lastQuestionOptions = activeQuestion ? activeQuestion.options : [];
        }

        // Handle 'complete' action finalization (moved outside conditional blocks to ensure it always runs for 'complete')
        if (actionToFrontend === 'complete') {
            let summaryMessage = "You've completed the questionnaire! Here's a summary of your responses:\n\n";
            for (const id in userResponses) {
                const responseData = userResponses[id];
                if (responseData && responseData.question && responseData.answer) {
                    summaryMessage += `Question: "${responseData.question}" -> Answered: "${responseData.answer}"\n\n`;
                }
            }
            assistantMessage = summaryMessage + "\nThank you for your time!"; // Overwrite any previous assistant message for 'complete'
            // Clear session data upon completion
            sessions.delete(sessionId);
            // The final message is pushed before sending response
            conversationHistory.push({ role: 'model', parts: [{ text: assistantMessage }] });
        } else {
            // Push model's response to history for ongoing sessions
            conversationHistory.push({ role: 'model', parts: [{ text: assistantMessage }] });
            session.conversationHistory = conversationHistory;
            sessions.set(sessionId, session); // Re-save updated session
        }


        console.log("Backend: Sending response to frontend ->",
            "Action:", actionToFrontend,
            "Question ID:", questionIdToFrontend,
            "Current Q Index:", currentQuestionIndex,
            "Next Question:", nextQuestion ? nextQuestion.substring(0, Math.min(nextQuestion.length, 50)) + '...' : 'N/A', // Truncate for log
            "Assistant Message:", assistantMessage.substring(0, Math.min(assistantMessage.length, 50)) + '...'); // Truncate for log


        res.json({
            assistantMessage: assistantMessage,
            action: actionToFrontend,
            questionId: questionIdToFrontend,
            currentQuestionIndex: currentQuestionIndex,
            nextQuestion: nextQuestion,
            predictedOption: predictedOption,
            responses: userResponses,
        });

    } catch (e) {
        console.error("Backend: Error during /api/chat processing:", e);
        const errorAssistantMessage = `I'm sorry, I encountered an error: ${e.message}. Please try again.`;
        if (!conversationHistory.some(entry => entry.role === 'model' && entry.parts[0].text === errorAssistantMessage)) {
            conversationHistory.push({ role: 'model', parts: [{ text: errorAssistantMessage }] });
        }
        session.conversationHistory = conversationHistory;
        sessions.set(sessionId, session);
        res.status(500).json({
            assistantMessage: errorAssistantMessage,
            action: "error",
            questionId: currentQuestionId,
            currentQuestionIndex: session.currentQuestionIndex,
            nextQuestion: null,
            predictedOption: null,
            responses: userResponses
        });
    }
});


// --- Server Start ---
app.listen(port, () => {
    console.log(`Backend server running on http://localhost:${port}`);
    if (GEMINI_API_KEY) {
        console.log("Make sure your Gemini API Key is set in .env: YES");
    } else {
        console.log("Make sure your Gemini API Key is set in .env: NO (Server might not function correctly)");
    }
});