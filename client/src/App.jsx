import React, { useState, useEffect, useRef, useCallback } from 'react';
import Lottie from 'lottie-react';
import './App.css';

import avatar1 from './assets/avatar.json';
import avatar2 from './assets/FemaleAvatar.json'; // Adult Female
import avatar3 from './assets/male.json';         // Adult Male
import avatar4 from './assets/Food.json';         // Small Girl (based on your current mapping)
import avatar5 from './assets/Boy.json';          // Small Boy (based on your current mapping)

const API_BASE_URL = 'http://localhost:3001/api';

// --- Animated Avatar Component (No changes needed here for voice) ---
const Avatar = ({ talking, listening, animationData }) => {
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
        animationData={animationData}
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

  const [voices, setVoices] = useState([]);
  const [selectedVoice, setSelectedVoice] = useState(null);
  const [voicePitch, setVoicePitch] = useState(1); // Default pitch
  const [voiceRate, setVoiceRate] = useState(1);   // Default rate

  const synth = useRef(window.speechSynthesis);
  const recognitionRef = useRef(null);
  const currentUtteranceRef = useRef(null);
  const isMounted = useRef(false);

  // --- Voice Loading useEffect ---
  useEffect(() => {
    const loadVoices = () => {
      const availableVoices = synth.current.getVoices();
      setVoices(availableVoices);
      console.log("Available voices on your system:", availableVoices.map(v => ({ name: v.name, lang: v.lang, default: v.default })));
    };

    loadVoices();
    if (synth.current.onvoiceschanged !== undefined) {
      synth.current.onvoiceschanged = loadVoices;
    }

    return () => {
      if (synth.current.onvoiceschanged) {
        synth.current.onvoiceschanged = null;
      }
    };
  }, []);

  // --- speakText (MODIFIED to use selectedVoice, pitch, and rate) ---
  const speakText = useCallback((textToSpeak, onEndCallback = null) => {
    console.log("speakText called:", textToSpeak);
    if (!textToSpeak) { if (onEndCallback) onEndCallback(); return; }
    if (synth.current.speaking) {
      console.log("Cancelling ongoing speech to make way for new speech.");
      synth.current.cancel();
    }

    const utterance = new SpeechSynthesisUtterance(textToSpeak);
    // Always set a default language, but the voice selection will override this if a specific voice is found
    utterance.lang = 'en-US';

    if (selectedVoice) {
      utterance.voice = selectedVoice;
      utterance.lang = selectedVoice.lang; // Ensure lang matches the voice for consistency
      utterance.pitch = voicePitch;
      utterance.rate = voiceRate;
      console.log(`Using voice: ${selectedVoice.name}, Lang: ${selectedVoice.lang}, Pitch: ${voicePitch}, Rate: ${voiceRate}`);
    } else {
      console.warn("No specific voice selected, using default browser voice with default pitch/rate.");
      utterance.pitch = 1;
      utterance.rate = 1;
    }

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
  }, [selectedVoice, voicePitch, voiceRate]);

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
          actionToSend = 'confirm_vague_answer'; // Changed from 'confirm_answer_verbal'
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
        sendToBackend("Repeat the current question.", "repeat_question"); // MODIFIED HERE
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
      actionToSend = 'confirm_vague_answer'; // Changed from 'confirm_answer_verbal'
    }
    console.log("Frontend: handleManualSubmit -> Sending action:", actionToSend, "with message:", userInputText);
    sendToBackend(userInputText, actionToSend);
  }, [userInputText, sendToBackend, setAssistantMessage, currentQuestionData, formStarted, awaitingConfirmation]);

  const handleStartListening = useCallback(() => {
    if (isSpeaking && currentUtteranceRef.current) { synth.current.cancel(); }
    startListening();
  }, [isSpeaking, startListening]);

  useEffect(() => {
    if (selectedAvatar && !formStarted) {
      setAssistantMessage("Click 'Start Form' to begin the questionnaire.");
    }
  }, [selectedAvatar, formStarted]);

  // Effect to set the voice, pitch, and rate based on selected avatar
  useEffect(() => {
    if (selectedAvatar && voices.length > 0) {
      let voiceToUse = null;
      let pitch = 1; // Default
      let rate = 1;  // Default

      // Helper function to find a voice specifically by en-US lang, then by name keywords
      const findUsVoice = (genderRegex, nameKeywordsRegex = /./) => {
        // Prioritize default en-US voices that match gender/keywords
        const defaultUsVoice = voices.find(v => v.default && v.lang === 'en-US' && genderRegex.test(v.name) && nameKeywordsRegex.test(v.name));
        if (defaultUsVoice) return defaultUsVoice;

        // Then look for any en-US voice matching gender/keywords
        const specificUsVoice = voices.find(v => v.lang === 'en-US' && genderRegex.test(v.name) && nameKeywordsRegex.test(v.name));
        if (specificUsVoice) return specificUsVoice;

        // Fallback to any en-US voice that matches just gender
        return voices.find(v => v.lang === 'en-US' && genderRegex.test(v.name));
      };

      if (selectedAvatar === avatar2) { // Adult Female
        // Common en-US female voice names: Zira, Samantha, Karen, Ava, Serena
        voiceToUse = findUsVoice(/female|zira|samantha|karen|serena|ava/i);
        pitch = 1;
        rate = 1;
      } else if (selectedAvatar === avatar3) { // Adult Male
        // Common en-US male voice names: David, Mark, Daniel, Alex
        voiceToUse = findUsVoice(/male|david|mark|daniel|alex/i);
        pitch = 1;
        rate = 1;
      } else if (selectedAvatar === avatar4) { // Small Girl (currently Food.json)
        // Try to find a specific child-like female voice (en-US only), then fallback to adult en-US female with adjusted pitch/rate
        voiceToUse = findUsVoice(/female|alice/i, /(alice|child|kid)/i);
        if (voiceToUse && (voiceToUse.name.toLowerCase().includes('alice') || voiceToUse.name.toLowerCase().includes('child') || voiceToUse.name.toLowerCase().includes('kid'))) {
            pitch = 1; // Use natural pitch if an actual child/high-pitched voice is found
            rate = 1;
        } else {
            // Fallback: Use any en-US female voice and force high pitch/rate
            voiceToUse = findUsVoice(/female/i); // Find any en-US female voice first
            if (!voiceToUse) { // If no en-US female voice found, use default en-US voice
                voiceToUse = voices.find(v => v.default && v.lang === 'en-US') || voices.find(v => v.lang === 'en-US');
            }
            pitch = 1.3; // Significantly higher pitch for a child effect
            rate = 1.2;  // Faster rate
        }
      } else if (selectedAvatar === avatar5) { // Small Boy (currently Boy.json)
        // Try to find a specific child-like male voice (en-US only), then fallback to adult en-US male with adjusted pitch/rate
        voiceToUse = findUsVoice(/male/i, /(child|kid)/i);
        if (voiceToUse && (voiceToUse.name.toLowerCase().includes('child') || voiceToUse.name.toLowerCase().includes('kid'))) {
            pitch = 1; // Use natural pitch if an actual child voice is found
            rate = 1;
        } else {
            // Fallback: Use any en-US male voice and force high pitch/rate
            voiceToUse = findUsVoice(/male/i); // Find any en-US male voice first
            if (!voiceToUse) { // If no en-US male voice found, use default en-US voice
                voiceToUse = voices.find(v => v.default && v.lang === 'en-US') || voices.find(v => v.lang === 'en-US');
            }
            pitch = 1.2; // Higher pitch for a child effect
            rate = 1.1;  // Slightly faster rate
        }
      } else { // Default/Generic Avatar (avatar1) or fallback if no match
        // Prioritize default en-US voice, then any en-US voice, then just the first available voice
        voiceToUse = voices.find(v => v.default && v.lang === 'en-US') ||
                     voices.find(v => v.lang === 'en-US') ||
                     voices[0];
        pitch = 1;
        rate = 1;
      }

      // Final fallback if no specific US voice was found after all attempts
      if (!voiceToUse) {
        voiceToUse = voices.find(v => v.default && v.lang.startsWith('en')) || voices.find(v => v.lang.startsWith('en')) || voices[0];
        console.warn("Could not find a suitable en-US voice. Falling back to first available English or system default voice.");
        // Re-apply pitch/rate for child avatars if we fell back to a non-US voice to still get some distinction
        if (selectedAvatar === avatar4 || selectedAvatar === avatar5) {
            pitch = (selectedAvatar === avatar4) ? 1.3 : 1.2;
            rate = (selectedAvatar === avatar4) ? 1.2 : 1.1;
        } else {
            pitch = 1;
            rate = 1;
        }
      }


      if (voiceToUse) {
        setSelectedVoice(voiceToUse);
        setVoicePitch(pitch);
        setVoiceRate(rate);
        console.log(`Assigned voice for avatar: ${voiceToUse.name} (Lang: ${voiceToUse.lang}, Pitch: ${pitch}, Rate: ${rate})`);
      } else {
        console.error("No voices found on the system. Speech synthesis will not work.");
        setSelectedVoice(null);
        setVoicePitch(1);
        setVoiceRate(1);
      }
    } else if (!selectedAvatar) {
      // If no avatar is selected, clear the selected voice and reset pitch/rate
      setSelectedVoice(null);
      setVoicePitch(1);
      setVoiceRate(1);
    }
  }, [selectedAvatar, voices]);

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
              {[avatar1, avatar2, avatar3, avatar4, avatar5].map((avatar, index) => (
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