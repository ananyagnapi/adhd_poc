// backend/server.js
const express = require('express');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const dotenv = require('dotenv');
const cors = require('cors');

dotenv.config(); // Load environment variables from .env file

const app = express();
const port = process.env.PORT || 3001; // Backend will run on port 3001

// Check for API key
if (!process.env.GEMINI_API_KEY) {
    console.error("GEMINI_API_KEY is not set in the .env file!");
    process.exit(1); // Exit if no API key
}

// Initialize Gemini API - Changed model to 'gemini-pro' for wider availability
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-1.5-pro-latest" });

// Middleware
app.use(cors({
    origin: 'http://localhost:5173', // Allow requests from your React frontend
    credentials: true
}));
app.use(express.json()); // To parse JSON request bodies

// --- Questionnaire Data (Can be loaded from a DB or file in a real app) ---
// This is your fixed set of questions.
const questionnaire = [
    { id: 1, question: "How often do you find it difficult to focus on a task when there are distractions around you?", explanation: "This question is asking if background noise, conversations, or movement make it hard for you to concentrate on what you need to do." },
    { id: 2, question: "Do you frequently feel overwhelmed by changes to your usual routine or plans?", explanation: "This question asks if unexpected changes to your day or schedule make you feel stressed or flustered." },
    { id: 3, question: "How often do you struggle to understand unspoken social rules or cues during conversations?", explanation: "This question is about whether you find it hard to pick up on hints, body language, or meanings that aren't directly said when you're talking with people." },
    { id: 4, question: "Do you often experience strong reactions to certain sounds, lights, or textures?", explanation: "This question asks if particular sensory inputs, like loud noises, bright lights, or the feel of certain fabrics, make you feel uncomfortable or intense." },
    { id: 5, question: "How often do you have difficulty organizing your thoughts or belongings?", explanation: "This question is about whether you find it challenging to put your ideas in order, or to keep your items and spaces tidy." },
];
const fixedOptions = ["Never", "Rarely", "Sometimes", "Often", "Very Often"];

// Store conversation history and state per session
// IMPORTANT: In a production app, use a proper session store (e.g., Redis, database)
const sessions = {}; // key: sessionId, value: { conversationHistory: [], currentQuestionIndex: 0, responses: {}, currentQuestionId: null }

// Helper function to generate a unique session ID
const generateSessionId = () => Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);

// --- API Endpoints ---

// Endpoint to start a new session
app.post('/api/start-session', (req, res) => {
    const sessionId = generateSessionId();
    sessions[sessionId] = {
        conversationHistory: [],
        currentQuestionIndex: 0,
        responses: {},
        currentQuestionId: null // Tracks the ID of the question currently being asked
    };
    console.log(`New session started: ${sessionId}`);
    res.json({ sessionId });
});

// Endpoint to handle chat interactions with the AI agent
app.post('/api/chat', async (req, res) => {
    const { sessionId, userMessage, action, currentQuestionId } = req.body;

    // Log incoming request for debugging
    console.log("Backend: /api/chat received -> Session:", sessionId, "User Message:", userMessage, "Action:", action, "Current Q ID:", currentQuestionId);

    if (!sessionId || !sessions[sessionId]) {
        console.error(`Invalid or missing session ID: ${sessionId}`);
        return res.status(400).json({ error: "Invalid session ID. Please start a new session." });
    }

    const session = sessions[sessionId];
    let { conversationHistory, currentQuestionIndex, responses } = session;

    // The active question is either the one associated with currentQuestionId (if provided)
    // or the one at the currentQuestionIndex in the questionnaire array.
    let activeQuestion = questionnaire.find(q => q.id === currentQuestionId) || questionnaire[session.currentQuestionIndex];
    if (!activeQuestion && session.currentQuestionIndex < questionnaire.length) {
        // If no activeQuestion found by ID but there should be one based on index
        activeQuestion = questionnaire[session.currentQuestionIndex];
    }

    try {
        let promptText = "";
        let assistantMessage = "";
        let predictedOption = "";
        let nextAction = "";
        let geminiResponse = {};

        // Add user message to history, but only if it's actual user input (not 'init_questionnaire')
        if (userMessage && userMessage !== "init_questionnaire" && userMessage !== "initiate") { // 'initiate' is just a trigger
            conversationHistory.push({ role: "user", parts: [{ text: userMessage }] });
        }

        if (action === "init_questionnaire") {
            // Initial prompt: Introduce and ask if ready to start
            promptText = `You are an empathetic AI assistant for an ADHD questionnaire.
            The user has just started the application.
            First, introduce yourself warmly and briefly explain the purpose of the questionnaire: it helps understand daily experiences related to information processing and environmental interaction, emphasizing that honest answers provide better support for diverse thinking.
            Then, crucially, **ask the user if they are ready to begin the questionnaire**. Do NOT ask the first question yet.

            Provide your response as a JSON object with:
            - "assistantMessage": [string, the full intro and readiness question]
            - "action": ["ask_readiness"] // New action type
            - "questionId": [null or undefined] // No question asked yet
            - "currentQuestionIndex": [0] // Still at the beginning

            Strictly output only the JSON object. Do not include any other text outside the JSON.`;

            const result = await model.generateContent(promptText);
            const responseText = result.response.text();
            console.log("Backend: Gemini Raw Response (init_questionnaire prompt):", responseText);
            try {
                const jsonMatch = responseText.match(/```json\n([\s\S]*?)\n```/);
                geminiResponse = jsonMatch && jsonMatch[1] ? JSON.parse(jsonMatch[1]) : JSON.parse(responseText);

                // Normalize assistantMessage and action if they are arrays
                if (Array.isArray(geminiResponse.assistantMessage)) {
                    geminiResponse.assistantMessage = geminiResponse.assistantMessage[0];
                }
                if (Array.isArray(geminiResponse.action)) {
                    geminiResponse.action = geminiResponse.action[0];
                }
            } catch (parseError) {
                console.error("Backend: Failed to parse Gemini init response as JSON:", parseError);
                geminiResponse = {
                    assistantMessage: "Hello! I'm your AI assistant for this questionnaire. It helps us understand your daily experiences. Are you ready to begin?",
                    action: "ask_readiness",
                    questionId: null,
                    currentQuestionIndex: 0
                };
            }

            assistantMessage = geminiResponse.assistantMessage;
            nextAction = geminiResponse.action;
            session.currentQuestionIndex = geminiResponse.currentQuestionIndex; // Should be 0
            session.currentQuestionId = geminiResponse.questionId; // Should be null

        } else if (action === "explain" && activeQuestion) {
            // If user explicitly asks for explanation
            // The frontend should have sent 'explain' action
            assistantMessage = `Explanation for the current question: ${activeQuestion.explanation}`;
            nextAction = "re_ask"; // Re-ask the same question after explanation

            promptText = `The user asked for an explanation for the question: "${activeQuestion.question}". Here is the explanation you provided: "${activeQuestion.explanation}". Now, please re-prompt the user with the original question, which is: "${activeQuestion.question}".
            Provide your response as a JSON object with:
            - "assistantMessage": [string, the explanation + re-prompt]
            - "nextQuestion": [string, the text of the current question]
            - "action": ["re_ask"]
            - "questionId": [number, the ID of the current question]
            - "currentQuestionIndex": [number, the current 0-based index]

            Strictly output only the JSON object. Do not include any other text outside the JSON.
            `;
            const result = await model.generateContent(promptText);
            const responseText = result.response.text();
            console.log("Backend: Gemini Raw Response (explain prompt):", responseText);
            try {
                const jsonMatch = responseText.match(/```json\n([\s\S]*?)\n```/);
                geminiResponse = jsonMatch && jsonMatch[1] ? JSON.parse(jsonMatch[1]) : JSON.parse(responseText);

                // Normalize assistantMessage and action if they are arrays
                if (Array.isArray(geminiResponse.assistantMessage)) {
                    geminiResponse.assistantMessage = geminiResponse.assistantMessage[0];
                }
                if (Array.isArray(geminiResponse.action)) {
                    geminiResponse.action = geminiResponse.action[0];
                }
            } catch (parseError) {
                console.error("Backend: Failed to parse Gemini explain response as JSON:", parseError);
                geminiResponse = {
                    assistantMessage: `Explanation: ${activeQuestion.explanation} Now, please answer: ${activeQuestion.question}`,
                    nextQuestion: activeQuestion.question,
                    action: "re_ask",
                    questionId: activeQuestion.id,
                    currentQuestionIndex: session.currentQuestionIndex
                };
            }
            assistantMessage = geminiResponse.assistantMessage;
            nextAction = geminiResponse.action;

        } else {
            // General conversation flow:
            // 1. User confirms readiness (action: 'confirm_readiness' from frontend)
            // 2. User answers a question (action: 'answer' from frontend)

            if (action === "confirm_readiness" || (session.currentQuestionId === null && session.currentQuestionIndex === 0)) {
                // This block handles:
                // - Frontend explicitly sending 'confirm_readiness'
                // - Frontend sending 'answer' when it should be 'confirm_readiness' (backend re-evaluates)

                promptText = `The user's response was "${userMessage}". You previously asked if they were ready to start the questionnaire.
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

                console.log("Backend: Sending prompt to Gemini for readiness confirmation:", promptText);
                const result = await model.generateContent(promptText);
                const responseText = result.response.text();
                console.log("Backend: Gemini Raw Response (readiness confirmation):", responseText);

                try {
                    const jsonMatch = responseText.match(/```json\n([\s\S]*?)\n```/);
                    if (jsonMatch && jsonMatch[1]) {
                        geminiResponse = JSON.parse(jsonMatch[1]);
                    } else {
                        geminiResponse = JSON.parse(responseText);
                    }

                    // Normalize assistantMessage and action if they are arrays
                    if (Array.isArray(geminiResponse.assistantMessage)) {
                        geminiResponse.assistantMessage = geminiResponse.assistantMessage[0];
                    }
                    if (Array.isArray(geminiResponse.action)) {
                        geminiResponse.action = geminiResponse.action[0];
                    }

                } catch (parseError) {
                    console.error("Backend: Failed to parse Gemini readiness confirmation response as JSON:", parseError);
                    console.error("Backend: Problematic response text:", responseText);
                    // Fallback for parsing errors
                    geminiResponse = {
                        assistantMessage: "I had trouble understanding that. Are you ready to begin the questionnaire?",
                        action: "clarify", // Default to clarify on parse error
                        questionId: null,
                        currentQuestionIndex: 0
                    };
                }

                // If Gemini confirmed readiness, NOW transition to asking the first question
                if (geminiResponse.action === "confirm_readiness") {
                    const firstQuestion = questionnaire[0]; // Get the first question
                    session.currentQuestionId = firstQuestion.id;
                    session.currentQuestionIndex = 0;

                    assistantMessage = geminiResponse.assistantMessage + ` Now, let's begin. Question 1: ${firstQuestion.question}.`;
                    nextAction = "ask_question"; // Set action to ask the question
                    geminiResponse.nextQuestion = firstQuestion.question; // Add nextQuestion for frontend
                    geminiResponse.questionId = firstQuestion.id; // Add questionId for frontend
                    geminiResponse.currentQuestionIndex = 0; // Add currentQuestionIndex for frontend

                } else if (geminiResponse.action === "clarify") {
                    assistantMessage = geminiResponse.assistantMessage;
                    nextAction = geminiResponse.action;
                } else {
                    // Fallback if Gemini gives an unexpected action for readiness
                    assistantMessage = "I'm not sure how to proceed. Are you ready to begin?";
                    nextAction = "clarify";
                }


            } else if (activeQuestion) {
                // This is the existing logic for processing answers to actual questions
                const optionsList = fixedOptions.join(', ');
                promptText = `You are an empathetic AI assistant guiding a user through a fixed ADHD questionnaire.
                The current question being answered is: "${activeQuestion.question}".
                The user's response options are: ${optionsList}.

                Based on the user's last input "${userMessage}", you need to categorize their answer into one of the options.
                If the user's input clearly indicates one of the options, state the option you inferred and ask for confirmation from the user (e.g., "I heard X, did you mean Y?").
                If the input is ambiguous, unclear, or asks a non-explanation related question, ask for clarification by prompting them to choose from the given options, or rephrase their answer.

                Provide your response as a JSON object with the following keys:
                - "assistantMessage": [string, the text the assistant should say to the user]
                - "predictedOption": [string, the categorized option, e.g., "Sometimes". Only if an option is clearly identified.]
                - "action": [string, e.g., "confirm_answer", "clarify"]
                - "questionId": [number, the ID of the question that was just processed]
                - "currentQuestionIndex": [number, the 0-based index of the question that was just processed]

                Strictly output only the JSON object. Do not include any other text outside the JSON.
                `;

                if (conversationHistory.length > 0) {
                    const recentHistory = conversationHistory.slice(-4); // Last 4 turns
                    promptText += "\nRecent Conversation History:\n" + recentHistory.map(entry => `${entry.role}: ${entry.parts[0].text}`).join('\n');
                }

                console.log("Backend: Sending prompt to Gemini for answer processing:", promptText);
                const result = await model.generateContent(promptText);
                const responseText = result.response.text();
                console.log("Backend: Gemini Raw Response (answer processing):", responseText);

                try {
                    const jsonMatch = responseText.match(/```json\n([\s\S]*?)\n```/);
                    if (jsonMatch && jsonMatch[1]) {
                        geminiResponse = JSON.parse(jsonMatch[1]);
                    } else {
                        geminiResponse = JSON.parse(responseText);
                    }

                    // Normalize assistantMessage and action if they are arrays
                    if (Array.isArray(geminiResponse.assistantMessage)) {
                        geminiResponse.assistantMessage = geminiResponse.assistantMessage[0];
                    }
                    if (Array.isArray(geminiResponse.action)) {
                        geminiResponse.action = geminiResponse.action[0];
                    }

                } catch (parseError) {
                    console.error("Backend: Failed to parse Gemini answer response as JSON:", parseError);
                    console.error("Backend: Problematic response text:", responseText);

                    // Fallback for parsing errors:
                    predictedOption = mapFallbackToOption(userMessage);
                    assistantMessage = `I apologize, I had trouble fully processing your response. Based on "${userMessage}", I predict: "${predictedOption}". Did I get that right?`;
                    nextAction = "confirm_answer";
                    geminiResponse = { assistantMessage, predictedOption, action: nextAction, questionId: activeQuestion.id, currentQuestionIndex: session.currentQuestionIndex };
                }
                assistantMessage = geminiResponse.assistantMessage || "I'm not sure what to say.";
                predictedOption = geminiResponse.predictedOption || "";
                nextAction = geminiResponse.action || "clarify"; // Default to clarify if action is missing

            } else {
                // This case should ideally not be hit if init_questionnaire works.
                assistantMessage = "I'm not sure which question we are on. Let's start over.";
                nextAction = "start_over";
                session.currentQuestionIndex = 0;
                session.currentQuestionId = null;
            }
        }

        // Add assistant's response to history
        conversationHistory.push({ role: "model", parts: [{ text: assistantMessage }] });

        console.log("Backend: Sending response to frontend -> Action:", nextAction, "Question:", geminiResponse.nextQuestion, "Assistant Message:", assistantMessage);
        res.json({
            assistantMessage: assistantMessage,
            predictedOption: predictedOption,
            nextQuestion: geminiResponse.nextQuestion, // Will be present for 'ask_question' or 're_ask'
            action: nextAction,
            questionId: geminiResponse.questionId,
            currentQuestionIndex: geminiResponse.currentQuestionIndex,
            responses: responses // Send current responses for UI update
        });

    } catch (e) {
        console.error("Backend: Gemini API error:", e);
        res.status(500).json({ assistantMessage: "I'm sorry, I'm having trouble connecting to the AI. Please try again.", action: "error" });
    }
});

// Endpoint to explicitly confirm an answer (from frontend confirmation button)
app.post('/api/confirm-answer', async (req, res) => {
    const { sessionId, questionId, confirmedOption, rawTranscript } = req.body;

    if (!sessionId || !sessions[sessionId]) {
        console.error(`Backend: Invalid or missing session ID for confirm: ${sessionId}`);
        return res.status(400).json({ error: "Invalid session ID." });
    }

    const session = sessions[sessionId];
    const { responses, currentQuestionIndex } = session;
    const questionForSaving = questionnaire.find(q => q.id === questionId);

    if (questionForSaving) {
        responses[questionId] = {
            question: questionForSaving.question,
            answer: confirmedOption,
            rawTranscript: rawTranscript
        };
        session.responses = responses; // Update session state
        // Update local storage in frontend later
    }

    // Now, tell Gemini to prepare the next question or completion message
    let nextAssistantMessage = "";
    let nextQuestionText = "";
    let nextAction = "ask_question";
    let newQuestionId = undefined;
    let newCurrentQuestionIndex = currentQuestionIndex + 1; // Increment for the next question

    try {
        let promptText = "";
        if (newCurrentQuestionIndex < questionnaire.length) {
            const nextQ = questionnaire[newCurrentQuestionIndex];
            nextQuestionText = nextQ.question;
            newQuestionId = nextQ.id;

            promptText = `The user has just confirmed their answer for question ${questionId} as "${confirmedOption}".
            The next question in the questionnaire is: "${nextQ.question}".
            Please acknowledge the user's confirmation and then present the next question.

            Provide your response as a JSON object with:
            - "assistantMessage": [string, acknowledgement + next question]
            - "nextQuestion": [string, the text of the next question]
            - "action": ["ask_question"]
            - "questionId": [number, the ID of the next question]
            - "currentQuestionIndex": [number, the 0-based index of the next question]

            Strictly output only the JSON object. Do not include any other text outside the JSON.
            `;
        } else {
            promptText = `The user has just confirmed their final answer as "${confirmedOption}".
            All questions in the questionnaire are now complete.
            Please provide a final completion message, thanking the user and stating the questionnaire is finished.

            Provide your response as a JSON object with:
            - "assistantMessage": [string, the completion message]
            - "action": ["complete"]
            - "responses": [object, the full collected responses for this session]

            Strictly output only the JSON object. Do not include any other text outside the JSON.
            `;
            nextAction = "complete";
        }

        console.log("Backend: Sending prompt to Gemini for confirmation processing:", promptText);
        const result = await model.generateContent(promptText);
        const responseText = result.response.text();
        console.log("Backend: Gemini Raw Response (confirm):", responseText);

        let geminiRes;
        try {
            const jsonMatch = responseText.match(/```json\n([\s\S]*?)\n```/);
            geminiRes = jsonMatch && jsonMatch[1] ? JSON.parse(jsonMatch[1]) : JSON.parse(responseText);

            // Normalize assistantMessage and action if they are arrays
            if (Array.isArray(geminiRes.assistantMessage)) {
                geminiRes.assistantMessage = geminiRes.assistantMessage[0];
            }
            if (Array.isArray(geminiRes.action)) {
                geminiRes.action = geminiRes.action[0];
            }

        } catch (parseError) {
            console.error("Backend: Failed to parse Gemini confirmation response as JSON:", parseError);
            // Fallback if Gemini's JSON parsing fails
            if (nextAction === "complete") {
                geminiRes = { assistantMessage: "You have completed all questions. Thank you for your responses!", action: "complete" };
            } else {
                geminiRes = {
                    assistantMessage: `Got it! Your answer is: ${confirmedOption}. Moving to the next question. Question ${newCurrentQuestionIndex + 1}: ${nextQuestionText}.`,
                    nextQuestion: nextQuestionText,
                    action: "ask_question",
                    questionId: newQuestionId,
                    currentQuestionIndex: newCurrentQuestionIndex
                };
            }
        }

        nextAssistantMessage = geminiRes.assistantMessage;
        nextAction = geminiRes.action;

        if (nextAction === "ask_question") {
            session.currentQuestionIndex = newCurrentQuestionIndex; // Update session index
            session.currentQuestionId = newQuestionId; // Update current question ID
        } else if (nextAction === "complete") {
            // No index update needed if complete
        }

        session.conversationHistory.push({ role: "model", parts: [{ text: nextAssistantMessage }] });

        console.log("Backend: Sending confirmation response to frontend -> Action:", nextAction, "Question:", geminiRes.nextQuestion, "Assistant Message:", nextAssistantMessage);
        res.json({
            assistantMessage: nextAssistantMessage,
            nextQuestion: geminiRes.nextQuestion,
            action: nextAction,
            questionId: newQuestionId,
            currentQuestionIndex: newCurrentQuestionIndex,
            responses: responses // Send back all updated responses
        });

    } catch (e) {
        console.error("Backend: Error with Gemini API during confirmation:", e);
        res.status(500).json({ assistantMessage: "There was an issue processing your confirmation. Please try again.", action: "error" });
    }
});

// Fallback mapping in case Gemini's JSON parsing fails or gives irrelevant output
const mapFallbackToOption = (text) => {
    const lowerText = text.toLowerCase();
    const scores = {
        "Never": 0, "Rarely": 0, "Sometimes": 0, "Often": 0, "Very Often": 0,
    };
    if (lowerText.includes("very often") || lowerText.includes("almost always") || lowerText.includes("all the time") || lowerText.includes("very much") || lowerText.includes("constantly") || lowerText.includes("every day")) scores["Very Often"] += 5;
    if (lowerText.includes("often") || lowerText.includes("frequently") || lowerText.includes("a lot") || lowerText.includes("many times")) scores["Often"] += 5;
    if (lowerText.includes("sometimes") || lowerText.includes("occasionally") || lowerText.includes("once in a while") || lowerText.includes("now and then") || lowerText.includes("a bit")) scores["Sometimes"] += 5;
    if (lowerText.includes("rarely") || lowerText.includes("hardly ever") || lowerText.includes("seldom") || lowerText.includes("not often") || lowerText.includes("infrequently") || lowerText.includes("almost never")) scores["Rarely"] += 5;
    if (lowerText.includes("never") || lowerText.includes("not at all") || lowerText.includes("no time") || (lowerText.includes("don't") && !lowerText.includes("sometimes"))) scores["Never"] += 5;

    let bestOption = "Sometimes";
    let highestScore = 0;
    for (const option of fixedOptions) {
        if (scores[option] > highestScore) {
            highestScore = scores[option];
            bestOption = option;
        }
    }

    if (highestScore === 0) {
        for (const option of fixedOptions) {
            const regex = new RegExp(`\\b${option.toLowerCase().replace(' ', '\\s*')}\\b`);
            if (regex.test(lowerText)) {
                bestOption = option;
                break;
            }
        }
    }
    return bestOption;
};

// Start the server
app.listen(port, () => {
    console.log(`Backend server running on http://localhost:${port}`);
    console.log(`Make sure your Gemini API Key is set in .env: ${!!process.env.GEMINI_API_KEY ? "YES" : "NO - PLEASE SET IT!"}`);
});