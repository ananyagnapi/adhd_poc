import React, { useState, useEffect, useRef, useCallback } from 'react';
import './App.css';

// --- Static PNG Images for Avatar Selection Options and as default display when not talking ---
import avatarFemaleAdultPng from './assets/3.png'; // Adult Female PNG
import avatarMaleAdultPng from './assets/2.png';  // Adult Male PNG
import avatarSmallBoyPng from './assets/1.png';   // Small Boy PNG
import avatarSmallGirlPng from './assets/4.png';  // Small Girl PNG

// --- GIF Images for Avatar Talking States (Import only the talking GIFs) ---
// ADULT FEMALE
import femaleAdultTalkingGif from './assets/3.gif';

// ADULT MALE
import maleAdultTalkingGif from './assets/2.gif';

// SMALL BOY
import smallBoyTalkingGif from './assets/1.gif';

// SMALL GIRL
import smallGirlTalkingGif from './assets/4.gif';


const API_BASE_URL = 'http://localhost:3001/api';

// --- Avatar Data Array with Names, PNGs, and only Talking GIF paths (Ordered) ---
const avatarOptions = [
  {
    id: 'femaleAdult',
    png: avatarFemaleAdultPng,
    name: 'Sarah', // Name for Adult Female
    gifs: {
      talking: femaleAdultTalkingGif,
    }
  },
  {
    id: 'maleAdult',
    png: avatarMaleAdultPng,
    name: 'John', // Name for Adult Male
    gifs: {
      talking: maleAdultTalkingGif,
    }
  },
  {
    id: 'smallGirl', // Child avatar
    png: avatarSmallGirlPng,
    name: 'Lily', // Name for Small Girl
    gifs: {
      talking: smallGirlTalkingGif,
    }
  },
  {
    id: 'smallBoy', // Child avatar
    png: avatarSmallBoyPng,
    name: 'Leo', // Name for Small Boy
    gifs: {
      talking: smallBoyTalkingGif,
    }
  },
];

// --- Dynamic Avatar Component (Handles GIF selection, falls back to PNG) ---
const Avatar = ({ talking, listening, selectedAvatarData, altText }) => {
  const avatarClass = `avatar ${talking ? 'talking' : ''} ${listening ? 'listening' : ''}`;
  let currentImageSrc = selectedAvatarData?.png; // Default to PNG

  if (selectedAvatarData) {
    if (talking && selectedAvatarData.gifs.talking) {
      currentImageSrc = selectedAvatarData.gifs.talking; // Use talking GIF if speaking
    }
    // If not talking, it will remain the PNG, as there are no idle/listening GIFs
  }

  return (
    <div className={avatarClass}>
      {currentImageSrc ? (
        <img src={currentImageSrc} alt={altText || selectedAvatarData?.name || "Avatar"} style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
      ) : (
        <p>No Avatar Selected</p> // Fallback if no image src is provided at all
      )}
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
  const [selectedAvatar, setSelectedAvatar] = useState(null); // Stores the full avatar object

  const [voices, setVoices] = useState([]);
  const [selectedVoice, setSelectedVoice] = useState(null);
  const [voicePitch, setVoicePitch] = useState(1);
  const [voiceRate, setVoiceRate] = useState(1);

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

    // Add this event listener to ensure voices are loaded
    if (synth.current.onvoiceschanged === null) { // Prevent multiple listeners
        synth.current.onvoiceschanged = loadVoices;
    }

    // Call loadVoices immediately in case they are already loaded
    loadVoices();

    return () => {
      // Clean up the event listener if component unmounts
      if (synth.current.onvoiceschanged === loadVoices) { // Only remove if it's our listener
        synth.current.onvoiceschanged = null;
      }
    };
  }, []); // Empty dependency array means this runs once on mount

  // --- speakText ---
  const speakText = useCallback((textToSpeak, onEndCallback = null) => {
    console.log("speakText called:", textToSpeak);
    if (!textToSpeak) { if (onEndCallback) onEndCallback(); return; }
    if (synth.current.speaking) {
      console.log("Cancelling ongoing speech to make way for new speech.");
      synth.current.cancel();
    }

    const utterance = new SpeechSynthesisUtterance(textToSpeak);
    utterance.lang = 'en-US'; // Default language

    if (selectedVoice) {
      utterance.voice = selectedVoice;
      utterance.lang = selectedVoice.lang;
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
    console.log("Attempting to speak with voice:", utterance.voice ? utterance.voice.name : "DEFAULT/NULL", "Pitch:", utterance.pitch, "Rate:", utterance.rate); // Diagnostic log
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

    setIsSpeaking(true); // Indicate speaking while waiting for backend response
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

      // Speak the assistant's message from the backend
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
          actionToSend = 'confirm_vague_answer';
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
    // Removed the setTimeout speakText here to avoid "interrupted" error.
    // The actual introduction speech will be triggered by the backend response.

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
      // This call to sendToBackend will ultimately trigger the first speech from the assistant
      await sendToBackend("initiate", "init_questionnaire", null, newSessionId);

    } catch (error) {
      console.error("Error starting session:", error);
      setAssistantMessage("Could not start the form. Please try again.");
      speakText("Could not start the form. Please try again.");
      setFormStarted(false);
    }
  }, [speakText, sendToBackend, selectedAvatar]);

  const handleManualSubmit = useCallback(() => {
    if (userInputText.trim() === "") { setAssistantMessage("Please type your response."); return; }
    let actionToSend = 'answer';
    if (!currentQuestionData && formStarted && !awaitingConfirmation) {
      actionToSend = 'confirm_readiness';
    } else if (awaitingConfirmation) {
      actionToSend = 'confirm_vague_answer';
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

  // Refined findUsVoice helper
  const findUsVoice = useCallback((targetGender, nameKeywordsRegex = /./, excludeNamesRegex = null) => {
    // Regex for common gender-specific keywords in voice names
    const genderNameRegex = new RegExp(targetGender === 'female' ? '(female|femaile|zira|samantha|karen|serena|anna|alice|helen|joanna|amy|aura|victoria|eva)' : '(male|male|david|mark|daniel|alex|aron|mike|sam)', 'i');

    // 1. Try to find a voice matching keywords AND gender in name, excluding specified names
    let foundVoice = voices.find(v =>
      v.lang.startsWith('en-US') &&
      genderNameRegex.test(v.name) &&
      nameKeywordsRegex.test(v.name) &&
      (excludeNamesRegex ? !excludeNamesRegex.test(v.name) : true)
    );
    if (foundVoice) return foundVoice;

    // 2. Fallback: Try any en-US voice matching gender in name, excluding specified names
    foundVoice = voices.find(v =>
      v.lang.startsWith('en-US') &&
      genderNameRegex.test(v.name) &&
      (excludeNamesRegex ? !excludeNamesRegex.test(v.name) : true)
    );
    if (foundVoice) return foundVoice;

    // 3. Last resort fallback (only if previous gender-specific attempts fail):
    // Prioritize female if target is female, otherwise just any en-US voice.
    if (targetGender === 'female') {
        // Try to find any female en-US voice, even if it wasn't filtered by keywords
        foundVoice = voices.find(v => v.lang.startsWith('en-US') && genderNameRegex.test(v.name));
    }
    if (!foundVoice) { // If still no luck, then get ANY en-US voice (could be male for female avatars if no female voices exist)
        foundVoice = voices.find(v => v.lang.startsWith('en-US'));
    }

    return foundVoice;
  }, [voices]); // Depend on voices state as it uses the voices array

  // Effect to set the voice, pitch, and rate based on selected avatar
  useEffect(() => {
    // Only attempt to set voice if voices are loaded AND an avatar is selected
    if (selectedAvatar && voices.length > 0) {
      let voiceToUse = null;
      let pitch = 1;
      let rate = 1;

      if (selectedAvatar.id === 'femaleAdult') {
        voiceToUse = findUsVoice('female', /(zira|samantha|karen|serena|ava|microsoft helen|microsoft mark)/i, /(joanna|amy|alice|child|kid|google us english)/i);
        pitch = 1;
        rate = 1;
      } else if (selectedAvatar.id === 'maleAdult') {
        voiceToUse = findUsVoice('male', /(david|mark|daniel|alex|microsoft aron)/i, /(child|kid|google us english)/i);
        pitch = 1;
        rate = 1;
      } else if (selectedAvatar.id === 'smallBoy') {
        voiceToUse = findUsVoice('male', /(child|kid|google)/i, /(david|mark|daniel|alex|microsoft aron)/i);
        if (voiceToUse && (voiceToUse.name.toLowerCase().includes('child') || voiceToUse.name.toLowerCase().includes('kid'))) {
            pitch = 1.1;
            rate = 1.15;
        } else {
            voiceToUse = findUsVoice('male', /./, /(david|mark|daniel|alex|microsoft aron)/i);
            if (!voiceToUse) voiceToUse = findUsVoice('male');
            pitch = 1.2;
            rate = 1.1;
        }
      } else if (selectedAvatar.id === 'smallGirl') {
        voiceToUse = findUsVoice('female', /(alice|child|kid|google)/i, /(zira|samantha|joanna|amy|helen|microsoft mark)/i);
        if (voiceToUse && (voiceToUse.name.toLowerCase().includes('alice') || voiceToUse.name.toLowerCase().includes('child') || voiceToUse.name.toLowerCase().includes('kid'))) {
            pitch = 1.1;
            rate = 1.15;
        } else {
            voiceToUse = findUsVoice('female', /./, /(zira|samantha|joanna|amy|helen|microsoft mark)/i);
            if (!voiceToUse) voiceToUse = findUsVoice('female');
            pitch = 1.3;
            rate = 1.2;
        }
      } else { // Fallback if selectedAvatar is somehow invalid or not found in options (shouldn't happen with correct flow)
        voiceToUse = voices.find(v => v.default && v.lang.startsWith('en-US')) ||
                     voices.find(v => v.lang.startsWith('en-US') && /female/i.test(v.name)) ||
                     voices.find(v => v.lang.startsWith('en-US')) ||
                     voices[0];
        pitch = 1;
        rate = 1;
      }

      // Final check and assignment
      if (voiceToUse) {
        setSelectedVoice(voiceToUse);
        setVoicePitch(pitch);
        setVoiceRate(rate);
        console.log(`Assigned voice for avatar ID ${selectedAvatar.id}: ${voiceToUse.name} (Lang: ${voiceToUse.lang}, Pitch: ${pitch}, Rate: ${rate})`);
      } else {
        console.warn(`Could not find a suitable voice for avatar ID ${selectedAvatar.id}. Falling back to system default. This might not be gender-correct.`);
        setSelectedVoice(null); // This will cause speakText to use browser's default
        setVoicePitch(1);
        setVoiceRate(1);
      }
    } else if (!selectedAvatar && voices.length > 0) {
        // If no avatar is selected, ensure voice selection is cleared
        setSelectedVoice(null);
        setVoicePitch(1);
        setVoiceRate(1);
    }
  }, [selectedAvatar, voices, findUsVoice]);


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
        {/* Pass the full selectedAvatar object to the Avatar component */}
        <Avatar
          talking={isSpeaking}
          listening={isListening} // Although no listening GIF, passing for consistency
          selectedAvatarData={selectedAvatar}
          altText={selectedAvatar?.name || "Avatar"}
        />
        <div className="assistant-dialogue">
          <p>{assistantMessage}</p>
        </div>
      </div>

      <div className="interaction-area">
        {!formStarted && (
          <div className="start-form-section">
            <h2>Select Your Avatar</h2>
            <div className="avatar-selection" style={{ display: 'flex', justifyContent: 'center', marginBottom: '20px' }}>
              {avatarOptions.map((avatar) => (
                <div
                  key={avatar.id}
                  className={`avatar-option ${selectedAvatar && selectedAvatar.id === avatar.id ? 'selected' : ''}`}
                  // Store the *full* avatar object in state
                  onClick={() => setSelectedAvatar(avatar)}
                  style={{
                    cursor: 'pointer',
                    width: '150px',
                    height: '150px',
                    margin: '0 10px',
                    border: selectedAvatar && selectedAvatar.id === avatar.id ? '3px solid #007bff' : '3px solid transparent',
                    borderRadius: '10px',
                    overflow: 'hidden',
                    backgroundColor: '#f0f0f0',
                    boxShadow: '0 2px 5px rgba(0,0,0,0.2)',
                    transition: 'border-color 0.3s ease, box-shadow 0.3s ease',
                    display: 'flex',
                    flexDirection: 'column', /* Arrange items vertically */
                    alignItems: 'center',
                    justifyContent: 'center',
                    padding: '10px', /* Add some padding around content */
                  }}
                >
                  {/* Display PNG for selection */}
                  <img src={avatar.png} alt={avatar.name} style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />
                  <p style={{ marginTop: '10px', fontWeight: 'bold' }}>{avatar.name}</p> {/* Display the name */}
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