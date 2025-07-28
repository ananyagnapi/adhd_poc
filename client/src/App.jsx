import React, { useState, useEffect, useRef, useCallback } from 'react';
import Lottie from 'lottie-react';
import './App.css';

// Ensure you have an 'avatar.json' file in your 'src/assets/' folder
// You can download Lottie JSON files from LottieFiles.com
import avatarAnimation from './assets/avatar.json';

// Backend URL
const API_BASE_URL = 'http://localhost:3001/api'; // Make sure this matches your backend port

// --- Animated Avatar Component ---
const Avatar = ({ talking, listening }) => {
  const lottieRef = useRef();

  useEffect(() => {
    if (lottieRef.current) {
      if (talking) {
        lottieRef.current.setSpeed(1);
        lottieRef.current.play();
      } else if (listening) {
        lottieRef.current.setSpeed(0.5); // Slower speed for listening animation
        lottieRef.current.play();
      } else {
        lottieRef.current.setSpeed(0.2); // Even slower for idle animation
        lottieRef.current.play();
      }
    }
  }, [talking, listening]);

  return (
    <div className="avatar">
      <Lottie
        lottieRef={lottieRef}
        animationData={avatarAnimation}
        loop={true}
        autoplay={true}
        style={{ width: '100%', height: '100%' }}
      />
    </div>
  );
};

// --- Main App Component ---
function App() {
  // State variables for managing UI and conversation flow
  const [currentQuestion, setCurrentQuestion] = useState("");
  const [assistantMessage, setAssistantMessage] = useState("Click 'Start Form' to begin the questionnaire.");
  const [userTranscript, setUserTranscript] = useState(""); // Stores what the speech recognition heard
  const [isListening, setIsListening] = useState(false); // Tracks if speech recognition is active
  const [isSpeaking, setIsSpeaking] = useState(false); // Tracks if speech synthesis is active
  const [userInputText, setUserInputText] = useState(""); // Stores manual text input
  const [showConfirmation, setShowConfirmation] = useState(false); // Controls visibility of "Did you mean?" section
  const [predictedOption, setPredictedOption] = useState(""); // The predicted answer option (e.g., "Often")
  const [storedResponses, setStoredResponses] = useState({}); // Stores user answers to questions
  const [formStarted, setFormStarted] = useState(false); // Controls if the form conversation has begun
  const [sessionId, setSessionId] = useState(null); // New state for session ID from backend
  const [currentQuestionData, setCurrentQuestionData] = useState(null); // Stores {id, question} of current question

  // Refs for Web Speech API instances
  const synth = useRef(window.speechSynthesis); // SpeechSynthesisUtterance API
  const recognitionRef = useRef(null); // SpeechRecognition API
  const currentUtteranceRef = useRef(null); // Reference to the currently speaking utterance

  // Ref to ensure useEffect runs only once on mount
  const isMounted = useRef(false);

  // --- ORDER OF FUNCTIONS MATTERS HERE ---

  // 1. speakText: Has no dependencies on other useCallback functions here
  const speakText = useCallback((textToSpeak, onEndCallback = null) => {
    console.log("speakText called:", textToSpeak);
    if (!textToSpeak) { if (onEndCallback) onEndCallback(); return; }
    if (synth.current.speaking) {
      console.log("Cancelling ongoing speech to make way for new speech.");
      synth.current.cancel(); // Cancel any existing speech
    }

    const utterance = new SpeechSynthesisUtterance(textToSpeak);
    utterance.lang = 'en-US';
    utterance.pitch = 1;
    utterance.rate = 1;

    utterance.onstart = () => { setIsSpeaking(true); console.log("SpeechSynthesis: Speaking started."); };
    utterance.onend = () => {
      setIsSpeaking(false);
      console.log("SpeechSynthesis: Speaking ended. Calling onEndCallback.");
      if (onEndCallback) {
        onEndCallback(); // Execute callback ONLY after speech truly ends
      }
    };
    utterance.onerror = (event) => {
      console.error('Speech synthesis error:', event.error, 'for text:', textToSpeak);
      setIsSpeaking(false);
      // Even on error, still try to call callback to not block the flow
      if (onEndCallback) { onEndCallback(); }
    };

    currentUtteranceRef.current = utterance;
    synth.current.speak(utterance);
  }, []); // No dependencies for speakText itself


  // 3. stopListening: Simple function, no dependencies on other useCallback functions
  const stopListening = useCallback(() => {
    if (recognitionRef.current && isListening) {
      recognitionRef.current.stop();
      setIsListening(false); // Make sure to set false when stopped
      console.log("SpeechRecognition: Stopped listening.");
    }
  }, [isListening]);


  // 4. sendToBackend: Depends on speakText, startListening, but actions are coordinated via speakText's callback
  const sendToBackend = useCallback(async (message, actionType, confirmedOption = null, overrideSessionId = null) => {

    const currentSessionId = overrideSessionId || sessionId;
    if (!currentSessionId) {
      console.error("No session ID. Cannot send message to backend.");
      setAssistantMessage("Please start the form first to get a session ID.");
      speakText("Please start the form first to get a session ID.");
      return;
    }

    // Set speaking to true to block user input/listening until assistant responds
    setIsSpeaking(true);
    setIsListening(false); // Stop listening if it was active
    setUserInputText(""); // Clear input field
    setUserTranscript(""); // Clear transcript
    setShowConfirmation(false); // Hide confirmation while waiting for backend response

    try {
      const payload = {
        sessionId: currentSessionId,
        userMessage: message,
        action: actionType,
        currentQuestionId: currentQuestionData?.id,
        confirmedOption: confirmedOption
      };
      console.log("Sending payload to backend:", payload);

      const response = await fetch(`${API_BASE_URL}/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      console.log("Received data from backend:", data);

      // Normalize assistantMessage and action if they are arrays from Gemini's response
      const normalizedAssistantMessage = Array.isArray(data.assistantMessage) ? data.assistantMessage[0] : data.assistantMessage;
      const normalizedAction = Array.isArray(data.action) ? data.action[0] : data.action;

      setAssistantMessage(normalizedAssistantMessage);

      // Crucially, all state updates for the next interaction phase happen INSIDE this callback
      speakText(normalizedAssistantMessage, () => {
        // Handle actions based on backend's response (using normalizedAction)
        if (normalizedAction === 'ask_readiness') {
          setCurrentQuestion("");
          setCurrentQuestionData(null);
        } else if (normalizedAction === 'ask_question' || normalizedAction === 're_ask') {
          console.log("Frontend: Action is 'ask_question' or 're_ask'. Setting question to:", data.nextQuestion);
          setCurrentQuestion(data.nextQuestion);
          setCurrentQuestionData({ id: data.questionId, question: data.nextQuestion });
          // Only start listening if it's an 'ask_question' or 're_ask'
          if (recognitionRef.current && recognitionRef.current.startListeningDirectly) {
            recognitionRef.current.startListeningDirectly();
          }
        } else if (normalizedAction === 'confirm_answer' && data.predictedOption) {
          setPredictedOption(data.predictedOption);
          setShowConfirmation(true); // Show confirmation UI
        } else if (normalizedAction === 'complete') {
          setCurrentQuestion("Questionnaire complete.");
          setFormStarted(false); // Disable further input
          setSessionId(null); // Clear session ID as conversation is complete
        } else if (normalizedAction === 'clarify') { // Clarify for questions or readiness
            if (currentQuestionData) {
                setCurrentQuestion(currentQuestionData.question); // Re-set current question in UI
            } else if (!currentQuestionData && formStarted) { // If in readiness phase and clarify
                setCurrentQuestion(""); // No question yet, just a prompt to re-ask for readiness
            }
            // If clarify, always try to listen again after the message
            if (recognitionRef.current && recognitionRef.current.startListeningDirectly) {
                recognitionRef.current.startListeningDirectly();
            }
        } else {
          console.warn("Unhandled action from backend:", normalizedAction);
          // Default to re-enable listening if not specifically handled
          if (currentQuestionData) {
            setCurrentQuestion(currentQuestionData.question);
          }
          if (recognitionRef.current && recognitionRef.current.startListeningDirectly) {
            recognitionRef.current.startListeningDirectly();
          }
        }

        // Always update stored responses based on what backend sends back (if provided)
        if (data.responses) {
          setStoredResponses(data.responses);
          localStorage.setItem('userQuestionnaireResponses', JSON.stringify(data.responses));
        }
      }); // End of speakText callback

    } catch (error) {
      console.error("Error communicating with backend:", error);
      setAssistantMessage("I'm sorry, I couldn't connect right now. Please check your internet connection and the backend server. Error: " + error.message);
      speakText("I'm sorry, I couldn't connect right now. Please check your internet connection and the backend server.", () => {
        // Attempt to restart listening if connection lost, assuming current question is still relevant
        if (!isListening && currentQuestion) {
          if (recognitionRef.current && recognitionRef.current.startListeningDirectly) {
            setTimeout(recognitionRef.current.startListeningDirectly, 2000);
          }
        }
      });
      setIsSpeaking(false);
      setShowConfirmation(false);
    }
  }, [sessionId, speakText, currentQuestionData, isListening, currentQuestion, setAssistantMessage, setStoredResponses, setUserTranscript, setShowConfirmation]);


  // 2. startListening: This is where you trigger the recognition start
  // This must be defined BEFORE initializeSpeechRecognition because it's used there.
  const startListening = useCallback(() => {
    if (recognitionRef.current && !isListening && !isSpeaking) {
      recognitionRef.current.start();
      setIsListening(true);
      setAssistantMessage("Listening for your response...");
      setUserTranscript(""); // Clear transcript on new listening start
      console.log("SpeechRecognition: Started listening.");
    } else if (isSpeaking) {
      setAssistantMessage("I'm speaking, please wait.");
    } else if (isListening) {
      setAssistantMessage("I'm already listening.");
    }
  }, [isListening, isSpeaking, setUserTranscript, setAssistantMessage]);


  // 5. initializeSpeechRecognition: Returns the recognition object.
  const initializeSpeechRecognition = useCallback(() => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setAssistantMessage("Speech recognition is not supported in this browser. Please use text input.");
      console.warn("SpeechRecognition API not available.");
      return null;
    }

    const recognition = new SpeechRecognition();
    recognition.lang = 'en-US';
    recognition.interimResults = false;
    recognition.continuous = false;

    recognition.onresult = (event) => {
      const transcript = Array.from(event.results).map(result => result[0].transcript).join('');
      // Store the transcript in a ref to be processed on `onend`
      if (recognitionRef.current) {
        recognitionRef.current.lastTranscript = transcript;
      }
    };

    recognition.onerror = (event) => {
      console.error('Speech recognition error:', event.error);
      setIsListening(false);
      setAssistantMessage(`Error listening: ${event.error.message}. Please try again or type your answer.`);
      speakText(`Error listening: ${event.error.message}. Please try again or type your answer.`);
    };

    recognition.onend = () => {
      setIsListening(false);
      console.log("SpeechRecognition: Ended listening.");

      if (recognitionRef.current && recognitionRef.current.lastTranscript) {
        const transcript = recognitionRef.current.lastTranscript;
        setUserTranscript(transcript); // Update UI state with final transcript

        // Determine action based on current state (waiting for readiness or an answer)
        let actionToSend = 'answer'; // Default for questions
        if (!currentQuestionData && formStarted) {
          actionToSend = 'confirm_readiness';
        }
        console.log("Frontend: SpeechRecognition.onend -> Sending action:", actionToSend, "with transcript:", transcript);
        sendToBackend(transcript, actionToSend);
        recognitionRef.current.lastTranscript = null; // Clear after use
      } else {
        // If onend fires but no transcript was captured (e.g., silence),
        // re-enable listening or prompt user.
        setAssistantMessage("I didn't catch that. Can you please repeat or type your answer?");
        speakText("I didn't catch that. Can you please repeat or type your answer?", () => {
          if (recognitionRef.current && recognitionRef.current.startListeningDirectly) {
            recognitionRef.current.startListeningDirectly();
          }
        });
      }
    };

    return recognition;
  }, [sendToBackend, currentQuestionData, formStarted, setUserTranscript, setIsListening, setAssistantMessage, speakText]);


  // 6. startConversation: Depends on speakText and sendToBackend
  const startConversation = useCallback(async () => {
    setFormStarted(true); // Indicate form process has started
    setAssistantMessage("Hello! I'm initiating the session...");
    speakText("Hello! I'm initiating the session...");

    try {
      const response = await fetch(`${API_BASE_URL}/start-session`, {
        method: 'POST'
      });
      if (!response.ok) throw new Error('Failed to start session');
      const data = await response.json();
      const newSessionId = data.sessionId;
      setSessionId(newSessionId);
      console.log("Session started with ID:", newSessionId);

      // Now that session is started, send initial message to get the intro + readiness question
      setAssistantMessage("Session started. Getting introduction...");
      // Pass the newSessionId to sendToBackend for the initial prompt
      // The subsequent speakText and listening will be handled by sendToBackend's callback
      await sendToBackend("initiate", "init_questionnaire", null, newSessionId);

    } catch (error) {
      console.error("Error starting session:", error);
      setAssistantMessage("Could not start the form. Please try again.");
      speakText("Could not start the form. Please try again.");
      setFormStarted(false);
    }
  }, [speakText, sendToBackend]);


  // 7. handleConfirm: Depends on speakText, startListening
  const handleConfirm = useCallback(async (confirmedOption) => {
    setShowConfirmation(false); // Hide confirmation buttons immediately
    setAssistantMessage("Confirming your answer...");

    // Speak "Confirming..." and then proceed to backend in its callback
    speakText("Confirming your answer...", async () => {
      try {
        const response = await fetch(`${API_BASE_URL}/confirm-answer`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            sessionId: sessionId,
            questionId: currentQuestionData?.id, // ID of the question just confirmed
            confirmedOption: confirmedOption,
            rawTranscript: userTranscript || userInputText // Original raw input for logging
          }),
        });

        if (!response.ok) throw new Error('Failed to confirm answer');
        const data = await response.json();
        console.log("Confirmation response from backend:", data);

        // Normalize assistantMessage and action if they are arrays
        const normalizedAssistantMessage = Array.isArray(data.assistantMessage) ? data.assistantMessage[0] : data.assistantMessage;
        const normalizedAction = Array.isArray(data.action) ? data.action[0] : data.action;

        setAssistantMessage(normalizedAssistantMessage);

        // Speak the assistant's next message, and then trigger the next step
        speakText(normalizedAssistantMessage, () => {
          if (normalizedAction === 'ask_question' && data.nextQuestion) {
            setCurrentQuestion(data.nextQuestion);
            setCurrentQuestionData({ id: data.questionId, question: data.nextQuestion });
            if (recognitionRef.current && recognitionRef.current.startListeningDirectly) {
              recognitionRef.current.startListeningDirectly();
            }
          } else if (normalizedAction === 'complete') {
            setCurrentQuestion("Questionnaire complete.");
            setFormStarted(false);
            setSessionId(null); // Clear session ID
          } else {
            // Fallback for unexpected actions after confirmation
            if (recognitionRef.current && recognitionRef.current.startListeningDirectly) {
              recognitionRef.current.startListeningDirectly();
            }
          }
          if (data.responses) {
            setStoredResponses(data.responses);
            localStorage.setItem('userQuestionnaireResponses', JSON.stringify(data.responses));
          }
        });

      } catch (error) {
        console.error("Error confirming answer with backend:", error);
        setAssistantMessage("There was an issue confirming your answer. Please try again.");
        speakText("There was an issue confirming your answer. Please try again.", () => {
          // Try to re-enable listening to get user input
          if (!isListening && currentQuestion) {
            if (recognitionRef.current && recognitionRef.current.startListeningDirectly) {
              setTimeout(recognitionRef.current.startListeningDirectly, 2000);
            }
          }
        });
      }
    }); // End of first speakText callback for "Confirming your answer..."
  }, [sessionId, currentQuestionData, userTranscript, userInputText, speakText, isListening, currentQuestion, setAssistantMessage, setStoredResponses]);


  // 8. handleAskForExplanation: Depends on stopListening, currentQuestionData, sendToBackend, speakText
  const handleAskForExplanation = useCallback(() => {
    if (isListening) { stopListening(); }
    if (currentQuestionData) { // Ensure there's a current question to explain
      setAssistantMessage("Getting explanation...");
      speakText("Getting explanation...", () => {
        sendToBackend("explain current question", "explain"); // Send intent to backend AFTER "Getting explanation..." is spoken
      });
    } else {
      setAssistantMessage("No question is currently active for explanation.");
      speakText("No question is currently active for explanation.");
    }
  }, [isListening, stopListening, currentQuestionData, sendToBackend, speakText, setAssistantMessage]);


  // 9. handleManualSubmit: Depends on sendToBackend
  const handleManualSubmit = useCallback(() => {
    if (userInputText.trim() === "") { setAssistantMessage("Please type your response."); return; }
    // Determine action based on current state (waiting for readiness or an answer)
    let actionToSend = 'answer'; // Default for questions
    if (!currentQuestionData && formStarted) {
      actionToSend = 'confirm_readiness';
    }
    console.log("Frontend: handleManualSubmit -> Sending action:", actionToSend, "with message:", userInputText);
    sendToBackend(userInputText, actionToSend);
  }, [userInputText, sendToBackend, setAssistantMessage, currentQuestionData, formStarted]);


  // 10. handleStartListening: Simple wrapper around startListening
  const handleStartListening = useCallback(() => {
    if (isSpeaking && currentUtteranceRef.current) { synth.current.cancel(); }
    startListening();
  }, [isSpeaking, startListening]);


  // useEffect hook for initial setup and cleanup
  useEffect(() => {
    if (isMounted.current) { return; }
    isMounted.current = true;

    // 1. Initialize SpeechRecognition object.
    const recognitionInstance = initializeSpeechRecognition();
    recognitionRef.current = recognitionInstance;

    // 2. Assign the startListening callback to a property on the recognition object.
    // This allows the onend callback of recognition to directly call startListening.
    if (recognitionRef.current) {
        recognitionRef.current.startListeningDirectly = startListening;
    }

    const stored = localStorage.getItem('userQuestionnaireResponses');
    if (stored) { setStoredResponses(JSON.parse(stored)); }

    return () => {
      if (synth.current.speaking) { synth.current.cancel(); }
      if (recognitionRef.current) {
        if (isListening) { recognitionRef.current.stop(); }
        delete recognitionRef.current.startListeningDirectly;
        recognitionRef.current = null;
      }
      isMounted.current = false;
    };
  }, [initializeSpeechRecognition, isListening, startListening]);


  // Main component render
  return (
    <div className="app-container">
      <h1>ADHD Form Assistant</h1>

      <div className="avatar-section">
        <Avatar
          talking={isSpeaking}
          listening={isListening}
        />
        <div className="assistant-dialogue">
          <p>{assistantMessage}</p>
        </div>
      </div>

      <div className="interaction-area">
        {/* "Start Form" button, visible only before the form begins */}
        {!formStarted && (
          <div className="start-form-section">
            <button onClick={startConversation} disabled={isSpeaking || sessionId !== null}>
              Start Form
            </button>
          </div>
        )}

        {/* Main form interaction area, visible only after the form has started */}
        {formStarted && (
          <>
            <div className="question-display">
              <h2>Current Question:</h2>
              <p>{currentQuestion || "Please wait for the assistant to ask something..."}</p>
            </div>

            {/* Controls are always visible if formStarted, but some disabled based on currentQuestion for clarity */}
            <div className="user-controls">
              <div className="button-group">
                <button onClick={handleStartListening} disabled={isListening || isSpeaking}>
                  {isListening ? "Listening..." : "Speak Your Answer"}
                </button>
                <button onClick={stopListening} disabled={!isListening}>
                  Stop Listening
                </button>
                {/* Enable explain button only if a question is currently active */}
                <button onClick={handleAskForExplanation} disabled={isSpeaking || isListening || !currentQuestionData}>
                  Explain Question
                </button>
              </div>

              <div className="text-input-section">
                <input
                  type="text"
                  value={userInputText}
                  onChange={(e) => setUserInputText(e.target.value)}
                  placeholder="Type your answer here..."
                  disabled={isSpeaking || isListening}
                />
                <button onClick={handleManualSubmit} disabled={isSpeaking || isListening || userInputText.trim() === ""}>
                  Submit Text
                </button>
              </div>

              {userTranscript && (
                <p className="user-transcript">You said: "<em>{userTranscript}</em>"</p>
              )}

              {showConfirmation && (
                <div className="confirmation-section">
                  <p className="confirmation-prompt">Did you mean: "<strong>{predictedOption}</strong>"?</p>
                  <div className="button-group">
                    <button onClick={() => handleConfirm(predictedOption)}>Yes, that's correct</button>
                    <button onClick={() => {
                      setAssistantMessage("Okay, please try speaking or typing your answer again.");
                      speakText("Okay, please try speaking or typing your answer again.", () => {
                        if (recognitionRef.current && recognitionRef.current.startListeningDirectly) {
                          recognitionRef.current.startListeningDirectly(); // Re-enable listening after prompt
                        }
                      });
                      setShowConfirmation(false);
                      setUserTranscript("");
                      setUserInputText("");
                    }}>No, let me try again</button>
                  </div>
                </div>
              )}
            </div>
          </>
        )}

        {/* Section to display and clear saved responses */}
        {Object.keys(storedResponses).length > 0 && (
          <div className="saved-responses-section">
            <h3>Saved Responses:</h3>
            <ul>
              {Object.entries(storedResponses).map(([id, data]) => (
                <li key={id}>
                  <strong>Q{id}:</strong> "{data.question}" - Answered: "<strong>{data.answer}</strong>" (Heard: "{data.rawTranscript}")
                </li>
              ))}
            </ul>
            <button onClick={() => {
              localStorage.removeItem('userQuestionnaireResponses');
              setStoredResponses({});
              setAssistantMessage("Responses cleared from local storage.");
              speakText("Responses cleared.");
            }}>Clear All Responses</button>
          </div>
        )}
      </div>
    </div>
  );
}

export default App;