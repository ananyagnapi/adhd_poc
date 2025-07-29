import React, { useState, useEffect, useRef, useCallback } from 'react';
import Lottie from 'lottie-react';
import './App.css';

// Import your avatar JSON files
import avatar1 from './assets/avatar.json'; // Default or generic avatar
import avatar2 from './assets/FemaleAvatar.json'; // Female avatar
import avatar3 from './assets/male.json';     // Male avatar

const API_BASE_URL = 'http://localhost:3001/api';

// --- Animated Avatar Component (Updated to accept animationData prop) ---
const Avatar = ({ talking, listening, animationData }) => {
  const lottieRef = useRef();

  // This useEffect ensures the Lottie animation speed changes based on state
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
        animationData={animationData} // Use the prop here
        loop={true}
        autoplay={true}
        style={{ width: '100%', height: '100%' }}
      />
    </div>
  );
};

// --- Main App Component ---
function App() {
  const [currentQuestion, setCurrentQuestion] = useState("");
  // MODIFIED: Initial message
  const [assistantMessage, setAssistantMessage] = useState("Select an avatar to continue.");
  const [userTranscript, setUserTranscript] = useState("");
  const [isListening, setIsListening] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [userInputText, setUserInputText] = useState("");
  const [predictedOption, setPredictedOption] = useState("");
  const [storedResponses, setStoredResponses] = useState({});
  const [formStarted, setFormStarted] = useState(false);
  const [sessionId, setSessionId] = useState(null);
  const [currentQuestionData, setCurrentQuestionData] = useState(null);
  const [awaitingConfirmation, setAwaitingConfirmation] = useState(false);
  const [selectedAvatar, setSelectedAvatar] = useState(null);

  const synth = useRef(window.speechSynthesis);
  const recognitionRef = useRef(null);
  const currentUtteranceRef = useRef(null);
  const isMounted = useRef(false);

  const speakText = useCallback((textToSpeak, onEndCallback = null) => {
    console.log("speakText called:", textToSpeak);
    if (!textToSpeak) { if (onEndCallback) onEndCallback(); return; }
    if (synth.current.speaking) {
      console.log("Cancelling ongoing speech to make way for new speech.");
      synth.current.cancel();
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
        onEndCallback();
      }
    };
    utterance.onerror = (event) => {
      console.error('Speech synthesis error:', event.error, 'for text:', textToSpeak);
      setIsSpeaking(false);
      if (onEndCallback) { onEndCallback(); }
    };

    currentUtteranceRef.current = utterance;
    synth.current.speak(utterance);
  }, []);

  const stopListening = useCallback(() => {
    if (recognitionRef.current && isListening) {
      recognitionRef.current.stop();
      setIsListening(false);
      console.log("SpeechRecognition: Stopped listening.");
    }
  }, [isListening]);

  const sendToBackend = useCallback(async (message, actionType, confirmedOption = null, overrideSessionId = null) => {
    const currentSessionId = overrideSessionId || sessionId;
    if (!currentSessionId && actionType !== 'init_questionnaire') {
      console.error("No session ID. Cannot send message to backend.");
      setAssistantMessage("Please start the form first to get a session ID.");
      speakText("Please start the form first to get a session ID.");
      return;
    }

    setIsSpeaking(true);
    setIsListening(false);
    setUserInputText("");
    setUserTranscript("");

    try {
      const payload = {
        sessionId: currentSessionId,
        userMessage: message,
        action: actionType,
        currentQuestionId: currentQuestionData?.id,
        confirmedOption: confirmedOption,
        awaitingConfirmation: awaitingConfirmation
      };
      console.log("Sending payload to backend:", payload);

      const response = await fetch(`${API_BASE_URL}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      console.log("Received data from backend:", data);

      const normalizedAssistantMessage = Array.isArray(data.assistantMessage) ? data.assistantMessage[0] : data.assistantMessage;
      const normalizedAction = Array.isArray(data.action) ? data.action[0] : data.action;

      setAssistantMessage(normalizedAssistantMessage);

      speakText(normalizedAssistantMessage, () => {
        if (awaitingConfirmation && normalizedAction !== 'confirm_answer') {
            setAwaitingConfirmation(false);
        }

        if (normalizedAction === 'ask_readiness') {
          setCurrentQuestion("");
          setCurrentQuestionData(null);
          if (recognitionRef.current && recognitionRef.current.startListeningDirectly) {
            recognitionRef.current.startListeningDirectly();
          }
        } else if (normalizedAction === 'ask_question' || normalizedAction === 're_ask') {
          console.log("Frontend: Action is 'ask_question' or 're_ask'. Setting question to:", data.nextQuestion);
          setCurrentQuestion(data.nextQuestion);
          setCurrentQuestionData({ id: data.questionId, question: data.nextQuestion });
          if (recognitionRef.current && recognitionRef.current.startListeningDirectly) {
            recognitionRef.current.startListeningDirectly();
          }
        } else if (normalizedAction === 'confirm_answer' && data.predictedOption) {
          setPredictedOption(data.predictedOption);
          setAwaitingConfirmation(true);
          if (recognitionRef.current && recognitionRef.current.startListeningDirectly) {
            recognitionRef.current.startListeningDirectly();
          }
        } else if (normalizedAction === 'complete') {
          setCurrentQuestion("Questionnaire complete.");
          setFormStarted(false);
          setSessionId(null);
        } else if (normalizedAction === 'clarify') {
            if (currentQuestionData) {
                setCurrentQuestion(currentQuestionData.question);
            } else if (!currentQuestionData && formStarted) {
                setCurrentQuestion("");
            }
            if (recognitionRef.current && recognitionRef.current.startListeningDirectly) {
                recognitionRef.current.startListeningDirectly();
            }
        } else {
          console.warn("Unhandled action from backend:", normalizedAction);
          if (currentQuestionData) {
            setCurrentQuestion(currentQuestionData.question);
          }
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
      console.error("Error communicating with backend:", error);
      setAssistantMessage("I'm sorry, I couldn't connect right now. Please check your internet connection and the backend server. Error: " + error.message);
      speakText("I'm sorry, I couldn't connect right now. Please check your internet connection and the backend server.", () => {
        if (!isListening && currentQuestion) {
          if (recognitionRef.current && recognitionRef.current.startListeningDirectly) {
            setTimeout(recognitionRef.current.startListeningDirectly, 2000);
          }
        }
      });
      setIsSpeaking(false);
    }
  }, [sessionId, speakText, currentQuestionData, isListening, currentQuestion, setAssistantMessage, setStoredResponses, setUserTranscript, awaitingConfirmation]);

  const startListening = useCallback(() => {
    if (recognitionRef.current && !isListening && !isSpeaking) {
      recognitionRef.current.start();
      setIsListening(true);
      setAssistantMessage("Listening for your response...");
      setUserTranscript("");
      console.log("SpeechRecognition: Started listening.");
    } else if (isSpeaking) {
      setAssistantMessage("I'm speaking, please wait.");
    } else if (isListening) {
      setAssistantMessage("I'm already listening.");
    }
  }, [isListening, isSpeaking, setUserTranscript, setAssistantMessage]);

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
        setUserTranscript(transcript);

        let actionToSend = 'answer';
        if (!currentQuestionData && formStarted && !awaitingConfirmation) {
          actionToSend = 'confirm_readiness';
        } else if (awaitingConfirmation) {
          actionToSend = 'confirm_answer_verbal';
        }

        console.log("Frontend: SpeechRecognition.onend -> Sending action:", actionToSend, "with transcript:", transcript);
        sendToBackend(transcript, actionToSend);
        recognitionRef.current.lastTranscript = null;
      } else {
        setAssistantMessage("I didn't catch that. Can you please repeat or type your answer?");
        speakText("I didn't catch that. Can you please repeat or type your answer?", () => {
          if (recognitionRef.current && recognitionRef.current.startListeningDirectly) {
            recognitionRef.current.startListeningDirectly();
          }
        });
      }
    };

    return recognition;
  }, [sendToBackend, currentQuestionData, formStarted, setUserTranscript, setIsListening, setAssistantMessage, speakText, awaitingConfirmation]);

  const startConversation = useCallback(async () => {
    if (!selectedAvatar) {
      setAssistantMessage("Please select an avatar before starting the form.");
      speakText("Please select an avatar before starting the form.");
      return;
    }

    setFormStarted(true);
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

      setAssistantMessage("Session started. Getting introduction...");
      await sendToBackend("initiate", "init_questionnaire", null, newSessionId);

    } catch (error) {
      console.error("Error starting session:", error);
      setAssistantMessage("Could not start the form. Please try again.");
      speakText("Could not start the form. Please try again.");
      setFormStarted(false);
    }
  }, [speakText, sendToBackend, selectedAvatar]);

  const handleAskForExplanation = useCallback(() => {
    if (isListening) { stopListening(); }
    if (currentQuestionData) {
      setAssistantMessage("Getting explanation...");
      speakText("Getting explanation...", () => {
        sendToBackend("explain current question", "explain");
      });
    } else {
      setAssistantMessage("No question is currently active for explanation.");
      speakText("No question is currently active for explanation.");
    }
  }, [isListening, stopListening, currentQuestionData, sendToBackend, speakText, setAssistantMessage]);

  const handleManualSubmit = useCallback(() => {
    if (userInputText.trim() === "") { setAssistantMessage("Please type your response."); return; }
    let actionToSend = 'answer';
    if (!currentQuestionData && formStarted && !awaitingConfirmation) {
      actionToSend = 'confirm_readiness';
    } else if (awaitingConfirmation) {
      actionToSend = 'confirm_answer_verbal';
    }
    console.log("Frontend: handleManualSubmit -> Sending action:", actionToSend, "with message:", userInputText);
    sendToBackend(userInputText, actionToSend);
  }, [userInputText, sendToBackend, setAssistantMessage, currentQuestionData, formStarted, awaitingConfirmation]);

  const handleStartListening = useCallback(() => {
    if (isSpeaking && currentUtteranceRef.current) { synth.current.cancel(); }
    startListening();
  }, [isSpeaking, startListening]);

  // NEW useEffect to update assistant message when avatar is selected
  useEffect(() => {
    if (selectedAvatar && !formStarted) { // Only update if an avatar is selected and form hasn't started
      setAssistantMessage("Click 'Start Form' to begin the questionnaire.");
    }
  }, [selectedAvatar, formStarted]); // Rerun when selectedAvatar or formStarted changes

  useEffect(() => {
    if (isMounted.current) { return; }
    isMounted.current = true;

    const recognitionInstance = initializeSpeechRecognition();
    recognitionRef.current = recognitionInstance;

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

  return (
    <div className="app-container">
      <h1>ADHD Form Assistant</h1>

      <div className="avatar-section">
        {selectedAvatar && (
          <Avatar
            talking={isSpeaking}
            listening={isListening}
            animationData={selectedAvatar}
          />
        )}
        <div className="assistant-dialogue">
          <p>{assistantMessage}</p>
        </div>
      </div>

      <div className="interaction-area">
        {!formStarted && (
          <div className="start-form-section">
            <h2>Select Your Avatar</h2>
            <div className="avatar-selection" style={{ display: 'flex', justifyContent: 'center', marginBottom: '20px' }}>
              {[avatar1, avatar2, avatar3].map((avatar, index) => (
                <div
                  key={index}
                  className={`avatar-option ${selectedAvatar === avatar ? 'selected' : ''}`}
                  onClick={() => setSelectedAvatar(avatar)}
                  style={{
                    cursor: 'pointer',
                    width: '150px',
                    height: '150px',
                    margin: '0 10px',
                    border: selectedAvatar === avatar ? '3px solid #007bff' : '3px solid transparent',
                    borderRadius: '10px',
                    overflow: 'hidden',
                    backgroundColor: '#f0f0f0',
                    boxShadow: '0 2px 5px rgba(0,0,0,0.2)',
                    transition: 'border-color 0.3s ease, box-shadow 0.3s ease',
                  }}
                >
                  <Lottie animationData={avatar} loop autoplay style={{ width: '100%', height: '100%' }} />
                </div>
              ))}
            </div>
            <button
              onClick={startConversation}
              disabled={!selectedAvatar || isSpeaking || sessionId !== null}
            >
              Start Form
            </button>
          </div>
        )}

        {formStarted && (
          <>
            <div className="question-display">
              <h2>Current Question:</h2>
              <p>{currentQuestion || "Please wait for the assistant to ask something..."}</p>
            </div>

            <div className="user-controls">
              <div className="button-group">
                <button onClick={handleStartListening} disabled={isListening || isSpeaking}>
                  {isListening ? "Listening..." : "Speak Your Answer"}
                </button>
                <button onClick={stopListening} disabled={!isListening}>
                  Stop Listening
                </button>
                <button onClick={handleAskForExplanation} disabled={isSpeaking || isListening || !currentQuestionData}>
                  Repeat Question
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
            </div>
          </>
        )}

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