import React, { useState, useEffect, useRef, useCallback } from 'react';
import { BrowserRouter as Router, Routes, Route, Link } from 'react-router-dom';
import './App.css';
import { useTranslation } from './hooks/useTranslation';
import { voiceMapping } from './translations';
import LanguageSelector from './components/LanguageSelector';
import Admin from './components/Admin';
// --- Static PNG Images for Avatar Selection Options and as default display when not talking ---
import avatarFemaleAdultPng from './assets/3.png'; // Adult Female PNG
import avatarMaleAdultPng from './assets/2.png';  // Adult Male PNG
import avatarSmallBoyPng from './assets/1.png';   // Small Boy PNG
import avatarSmallGirlPng from './assets/4.png';  // Small Girl PNG
import axios from 'axios';
import { useDispatch } from 'react-redux'
import { addAllQuetions } from './slices/quetionSlice'
 
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
    },
    voiceName: 'en-US-Wavenet-E', // Female voice
    ssmlGender: 'FEMALE'
  },
  {
    id: 'maleAdult',
    png: avatarMaleAdultPng,
    name: 'John', // Name for Adult Male
    gifs: {
      talking: maleAdultTalkingGif,
    },
    voiceName: 'en-US-Wavenet-B', // Male voice
    ssmlGender: 'MALE'
  },
  {
    id: 'smallGirl', // Child avatar
    png: avatarSmallGirlPng,
    name: 'Lily', // Name for Small Girl
    gifs: {
      talking: smallGirlTalkingGif,
    },
    voiceName: 'en-US-Wavenet-F', // Female voice (higher pitch for child)
    ssmlGender: 'FEMALE'
  },
  {
    id: 'smallBoy', // Child avatar
    png: avatarSmallBoyPng,
    name: 'Leo', // Name for Small Boy
    gifs: {
      talking: smallBoyTalkingGif,
    },
    voiceName: 'en-US-Wavenet-A', // Male voice (higher pitch for child)
    ssmlGender: 'MALE'
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
 
// --- Main Questionnaire Component ---
function Questionnaire() {
  const { currentLanguage, setCurrentLanguage, t, translateWithAI } = useTranslation();
  const [currentQuestion, setCurrentQuestion] = useState("");
  const [assistantMessage, setAssistantMessage] = useState("");
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
  const [languageSelected, setLanguageSelected] = useState(false); // Track if language is selected
 
  // --- New States for Final Confirmation ---
  const [showFinalConfirmation, setShowFinalConfirmation] = useState(false);
  const [reviewingResponses, setReviewingResponses] = useState(false);
  const [currentReviewIndex, setCurrentReviewIndex] = useState(0); // Index of question being reviewed/re-answered
  const [finalSubmissionConfirmed, setFinalSubmissionConfirmed] = useState(false); // New state for final confirmation
 
  const recognitionRef = useRef(null);
  const currentAudioRef = useRef(null); // Reference to current playing audio
  const isMounted = useRef(false);
  const dispatch = useDispatch()
  
  // Initialize assistant message only once
  useEffect(() => {
    if (!selectedAvatar && !languageSelected && !formStarted) {
      setAssistantMessage('Select an avatar to continue.');
    }
  }, [selectedAvatar, languageSelected, formStarted]);

  useEffect(() => {
    const questionData = async () => {
      try {
        const response = await axios.get(`${API_BASE_URL}/admin/questions`);
        dispatch(addAllQuetions(response.data))
        console.log('response data:', response);
      } catch (error) {
        console.error('Error fetching questions:', error);
      }
    };
    questionData();
  }, []);


  // --- Google TTS speakText function ---
    const speakText = useCallback(async (textToSpeak, onEndCallback = null) => {
    console.log("speakText called:", textToSpeak);
    if (!textToSpeak) {
        if (onEndCallback) onEndCallback();
        return;
    }
 
    // Stop any currently playing audio
    if (currentAudioRef.current) {
        currentAudioRef.current.pause();
        currentAudioRef.current.src = ""; // Clear the source
        URL.revokeObjectURL(currentAudioRef.current.blobUrl); // Clean up the old blob URL
        currentAudioRef.current = null;
    }
 
    setIsSpeaking(true);
   
    try {
        const voiceParams = {
            languageCode: currentLanguage === 'en' ? 'en-US' : currentLanguage === 'es' ? 'es-ES' : currentLanguage === 'fr' ? 'fr-FR' : 'hi-IN'
        };
        if (selectedAvatar && voiceMapping[currentLanguage]) {
            voiceParams.voiceName = voiceMapping[currentLanguage][selectedAvatar.id];
        }
 
        console.log("Sending TTS request with params:", voiceParams);
 
        const response = await fetch(`${API_BASE_URL}/google-tts/speak`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                text: textToSpeak,
                ...voiceParams
            }),
        });
 
        if (!response.ok) {
            throw new Error(`TTS API error: ${response.status}`);
        }
 
        const audioBlob = await response.blob();
        const audioUrl = URL.createObjectURL(audioBlob);
 
        const audio = new Audio(audioUrl);
        audio.blobUrl = audioUrl;
        currentAudioRef.current = audio;
 
        // Use a promise to handle the canplaythrough event, ensuring the audio is ready
        const audioReadyPromise = new Promise((resolve, reject) => {
            const handleCanPlay = () => {
              console.log("Google TTS audio duration (before metadata loaded):", audio.duration);
 
                console.log("Google TTS: Audio is ready to play.");
                resolve();
                audio.removeEventListener('canplaythrough', handleCanPlay);
                audio.removeEventListener('error', handleError);
            };
            const handleError = (e) => {
                reject(e);
                audio.removeEventListener('canplaythrough', handleCanPlay);
                audio.removeEventListener('error', handleError);
            };
            audio.addEventListener('canplaythrough', handleCanPlay);
            audio.addEventListener('error', handleError);
 
            audio.onended = () => {
                console.log("Google TTS: Audio playback ended");
                setIsSpeaking(false);
                URL.revokeObjectURL(audio.blobUrl);
                currentAudioRef.current = null;
                if (onEndCallback) {
                    onEndCallback();
                }
            };
        });
 
        try {
            // Wait for the audio to be ready, then add a small delay before playing
            await audioReadyPromise;
            // console.log("Adding a small delay to ensure full buffering before playback.");
            await audio.play();
            console.log("Google TTS: Audio playback started");
        } catch (playError) {
            console.warn("Google TTS Autoplay was blocked or an error occurred during playback:", playError);
            setIsSpeaking(false);
            URL.revokeObjectURL(audio.blobUrl);
            currentAudioRef.current = null;
            setAssistantMessage("I'm sorry, I cannot speak right now. Please read the message above to continue.");
            if (onEndCallback) {
                onEndCallback();
            }
        }
    } catch (error) {
        console.error("Error with Google TTS:", error);
        setIsSpeaking(false);
        if (onEndCallback) {
            onEndCallback();
        }
        setAssistantMessage("Sorry, I had trouble generating speech. Please try again.");
    }
}, [selectedAvatar, setAssistantMessage, setIsSpeaking, currentAudioRef, currentLanguage]);
 
  const stopListening = useCallback(() => {
    if (recognitionRef.current && isListening) {
      recognitionRef.current.stop();
      setIsListening(false);
      console.log("SpeechRecognition: Stopped listening.");
    }
  }, [isListening]);
 
  const handleLanguageChange = useCallback(async (newLanguage) => {
    setCurrentLanguage(newLanguage);
    setLanguageSelected(true);
    setAssistantMessage("Language selected. Click 'Start Form' to begin.");
  }, []);

  const sendToBackend = useCallback(async (message, actionType, confirmedOption = null, overrideSessionId = null, questionIdToReAnswer = null) => {
    const currentSessionId = overrideSessionId || sessionId;
    if (!currentSessionId && actionType !== 'init_questionnaire') {
      console.error("No session ID. Cannot send message to backend.");
      setAssistantMessage("Please start the form first to get a session ID.");
      await speakText("Please start the form first to get a session ID.");
      return;
    }
 
    // setIsSpeaking(true); // Indicate speaking while waiting for backend response
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
        awaitingConfirmation: awaitingConfirmation,
        questionIdToReAnswer: questionIdToReAnswer // Pass this for re-answering specific questions
      };
      console.log("Sending payload to backend:", payload);
 
      const response = await fetch(`${API_BASE_URL}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
 
      if (!response.ok) {
        // Log the response status and text for better debugging
        const errorText = await response.text();
        console.error(`Backend error response: ${response.status} - ${errorText}`);
        throw new Error(`HTTP error! status: ${response.status}. Details: ${errorText}`);
      }
 
      const data = await response.json();
      console.log("Received data from backend:", data);
 
      const normalizedAssistantMessage = Array.isArray(data.assistantMessage) ? data.assistantMessage[0] : data.assistantMessage;
      const normalizedAction = Array.isArray(data.action) ? data.action[0] : data.action;
 
      // Translate the assistant message if needed
      let translatedMessage = normalizedAssistantMessage;
      if (currentLanguage !== 'en') {
        try {
          translatedMessage = await translateWithAI(normalizedAssistantMessage, currentLanguage);
        } catch (error) {
          console.warn('Failed to translate assistant message:', error);
        }
      }
      
      // Set the translated message
      setAssistantMessage(translatedMessage);

      // Handle state updates immediately
      if (awaitingConfirmation && normalizedAction !== 'confirm_answer') {
          setAwaitingConfirmation(false);
      }

      if (data.responses) {
        setStoredResponses(data.responses);
        localStorage.setItem('userQuestionnaireResponses', JSON.stringify(data.responses));
      }

      if (normalizedAction === 'ask_readiness') {
        setCurrentQuestion("");
        setCurrentQuestionData(null);
        setReviewingResponses(false);
        setShowFinalConfirmation(false);
        setFinalSubmissionConfirmed(false);
      } else if (normalizedAction === 'ask_question' || normalizedAction === 're_ask') {
        console.log("Frontend: Action is 'ask_question' or 're_ask'. Setting question to:", data.nextQuestion);
        setCurrentQuestion(data.nextQuestion);
        setCurrentQuestionData({ id: data.questionId, question: data.nextQuestion });
        setReviewingResponses(false);
        setShowFinalConfirmation(false);
        setFinalSubmissionConfirmed(false);
      } else if (normalizedAction === 'confirm_answer' && data.predictedOption) {
        setPredictedOption(data.predictedOption);
        setAwaitingConfirmation(true);
      } else if (normalizedAction === 'complete') {
        setShowFinalConfirmation(true);
        setCurrentQuestion("Questionnaire completed. Please review your answers.");
      } else if (normalizedAction === 'final_submission_complete') {
        setCurrentQuestion("Thank you for completing the questionnaire!");
        setFormStarted(false);
        setSessionId(null);
        setShowFinalConfirmation(false);
        setReviewingResponses(false);
        setCurrentReviewIndex(0);
        setFinalSubmissionConfirmed(true);
      } else if (normalizedAction === 'clarify') {
        if (currentQuestionData) {
            setCurrentQuestion(currentQuestionData.question);
        } else if (!currentQuestionData && formStarted) {
            setCurrentQuestion("");
        }
      } else {
        console.warn("Unhandled action from backend:", normalizedAction);
        if (currentQuestionData) {
          setCurrentQuestion(currentQuestionData.question);
        }
      }
 
      // Speak the translated assistant's message
      speakText(translatedMessage);
      
      // Start listening after a brief delay if needed
      setTimeout(() => {
        if (recognitionRef.current && recognitionRef.current.startListeningDirectly && 
            (normalizedAction === 'ask_readiness' || normalizedAction === 'ask_question' || 
             normalizedAction === 're_ask' || normalizedAction === 'confirm_answer' || 
             normalizedAction === 'clarify')) {
          recognitionRef.current.startListeningDirectly();
        }
      }, 1000);
 
    } catch (error) {
      console.error("Error communicating with backend:", error);
      setAssistantMessage("I'm sorry, I couldn't connect right now. Please check your internet connection and the backend server. Error: " + error.message);
      await speakText("I'm sorry, I couldn't connect right now. Please check your internet connection and the backend server.", async () => {
        if (!isListening && currentQuestion) {
          if (recognitionRef.current && recognitionRef.current.startListeningDirectly) {
            setTimeout(recognitionRef.current.startListeningDirectly, 2000);
          }
        }
      });
      setIsSpeaking(false);
    }
  }, [sessionId, speakText, currentQuestionData, isListening, currentQuestion, awaitingConfirmation, currentLanguage]);
 
  const startListening = useCallback(() => {
    if (recognitionRef.current && !isListening && !isSpeaking) {
      recognitionRef.current.start();
      setIsListening(true);
      setUserTranscript("");
      console.log("SpeechRecognition: Started listening.");
    } else if (isSpeaking) {
      console.log("Cannot start listening: currently speaking");
    } else if (isListening) {
      console.log("Already listening");
    }
  }, [isListening, isSpeaking, setUserTranscript]);
 
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
 
    recognition.onerror = async (event) => {
      console.error('Speech recognition error:', event.error);
      setIsListening(false);
      setAssistantMessage(`Error listening: ${event.error.message}. Please try again or type your answer.`);
      await speakText(`Error listening: ${event.error.message}. Please try again or type your answer.`);
    };
 
    recognition.onend = () => {
      setIsListening(false);
      console.log("SpeechRecognition: Ended listening.");
 
      if (recognitionRef.current && recognitionRef.current.lastTranscript) {
        const transcript = recognitionRef.current.lastTranscript;
        setUserTranscript(transcript);
 
        let actionToSend = 'answer';
        // Only send confirm_readiness if form is started, not in any confirmation/review state
        if (!currentQuestionData && formStarted && !awaitingConfirmation && !showFinalConfirmation && !reviewingResponses) {
          actionToSend = 'confirm_readiness';
        } else if (awaitingConfirmation) {
          actionToSend = 'confirm_vague_answer';
        } else if (reviewingResponses && currentQuestionData?.id) { // If re-answering during review
            actionToSend = 're_answer_specific_question';
        }
 
        console.log("Frontend: SpeechRecognition.onend -> Sending action:", actionToSend, "with transcript:", transcript);
        sendToBackend(transcript, actionToSend, null, null, reviewingResponses ? currentQuestionData.id : null);
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
  }, [sendToBackend, currentQuestionData, formStarted, setUserTranscript, setIsListening, setAssistantMessage, speakText, awaitingConfirmation, showFinalConfirmation, reviewingResponses]);
 
  const startConversation = useCallback(async () => {
    if (!selectedAvatar) {
      setAssistantMessage("Please select an avatar before starting the form.");
      await speakText("Please select an avatar before starting the form.");
      return;
    }
 
    setFormStarted(true);
    setAssistantMessage("Hello! I'm initiating the session...");
    setShowFinalConfirmation(false); // Reset in case user restarts
    setReviewingResponses(false); // Reset
    setCurrentReviewIndex(0); // Reset
    setFinalSubmissionConfirmed(false); // Ensure this is false on new start
 
    try {
      const response = await fetch(`${API_BASE_URL}/start-session`, {
        method: 'POST'
      });
      if (!response.ok) throw new Error('Failed to start session');
      const data = await response.json();
      console.log("DynamicsCompressorNode",data)
      const newSessionId = data.sessionId;
      setSessionId(newSessionId);
      console.log("Session started with ID:", newSessionId);
 
      setAssistantMessage("Session started. Getting introduction...");
      await sendToBackend("initiate", "init_questionnaire", null, newSessionId);
 
    } catch (error) {
      console.error("Error starting session:", error);
      setAssistantMessage("Could not start the form. Please try again.");
      await speakText("Could not start the form. Please try again.");
      setFormStarted(false);
    }
  }, [speakText, sendToBackend, selectedAvatar]);
 
  const handleManualSubmit = useCallback(() => {
    if (userInputText.trim() === "") { setAssistantMessage("Please type your response."); return; }
    let actionToSend = 'answer';
    let questionIdForReAnswer = null;
 
    if (!currentQuestionData && formStarted && !awaitingConfirmation && !showFinalConfirmation && !reviewingResponses) {
      actionToSend = 'confirm_readiness';
    } else if (awaitingConfirmation) {
      actionToSend = 'confirm_vague_answer';
    } else if (reviewingResponses && currentQuestionData?.id) { // If re-answering during review
        actionToSend = 're_answer_specific_question';
        questionIdForReAnswer = currentQuestionData.id;
    }
 
    console.log("Frontend: handleManualSubmit -> Sending action:", actionToSend, "with message:", userInputText);
    sendToBackend(userInputText, actionToSend, null, null, questionIdForReAnswer);
  }, [userInputText, sendToBackend, setAssistantMessage, currentQuestionData, formStarted, awaitingConfirmation, showFinalConfirmation, reviewingResponses]);
 
  const handleStartListening = useCallback(() => {
    if (isSpeaking && currentAudioRef.current) {
      currentAudioRef.current.pause();
      currentAudioRef.current = null;
      setIsSpeaking(false);
    }
    startListening();
  }, [isSpeaking, startListening]);
 
  useEffect(() => {
    if (selectedAvatar && !languageSelected && !formStarted) {
      setAssistantMessage("Please select your preferred language.");
    }
  }, [selectedAvatar, languageSelected, formStarted]);
 
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
      // Cleanup audio on unmount
      if (currentAudioRef.current) {
        currentAudioRef.current.pause();
        currentAudioRef.current = null;
      }
      if (recognitionRef.current) {
        if (isListening) { recognitionRef.current.stop(); }
        delete recognitionRef.current.startListeningDirectly;
        recognitionRef.current = null;
      }
      isMounted.current = false;
    };
  }, [initializeSpeechRecognition, isListening, startListening]);
 
  // --- Handlers for Final Confirmation ---
  const handleFinalSubmit = useCallback(async () => {
    setAssistantMessage("Great! Submitting your responses now...");
    await speakText("Great! Submitting your responses now.");
    sendToBackend("final submit", "submit_final_responses");
  }, [sendToBackend, speakText]);
 
  const handleReviewResponses = useCallback(async () => {
    setReviewingResponses(true);
    setShowFinalConfirmation(false); // Hide the main confirmation prompt
    setCurrentReviewIndex(0); // Start review from the first question
    const questionIds = Object.keys(storedResponses).sort((a, b) => parseInt(a) - parseInt(b)); // Correctly get sorted IDs
    if (questionIds.length > 0) {
        const firstQuestionId = questionIds[0]; // Get the actual ID
        const firstQuestionData = storedResponses[firstQuestionId]; // Get data using the ID
        setCurrentQuestionData({ id: firstQuestionId, question: firstQuestionData.question });
        setAssistantMessage(`Okay, let's review. Question ${parseInt(firstQuestionId) + 1}: ${firstQuestionData.question}. Your current answer is "${firstQuestionData.answer}". Do you want to change it?`);
        await speakText(`Okay, let's review. Question ${parseInt(firstQuestionId) + 1}: ${firstQuestionData.question}. Your current answer is "${firstQuestionData.answer}". Do you want to change it?`, () => {
            if (recognitionRef.current && recognitionRef.current.startListeningDirectly) {
                recognitionRef.current.startListeningDirectly();
            }
        });
    } else {
        setAssistantMessage("There are no responses to review.");
        await speakText("There are no responses to review.");
        setReviewingResponses(false);
        setShowFinalConfirmation(true); // Go back to original final confirmation if no responses
    }
  }, [storedResponses, speakText]);
 
  const handleNextReviewQuestion = useCallback(async () => {
    const questionIds = Object.keys(storedResponses).sort((a, b) => parseInt(a) - parseInt(b));
    const nextIndex = currentReviewIndex + 1;
 
    if (nextIndex < questionIds.length) {
        setCurrentReviewIndex(nextIndex);
        const nextQuestionId = questionIds[nextIndex];
        const nextQuestionData = storedResponses[nextQuestionId];
        setCurrentQuestionData({ id: nextQuestionId, question: nextQuestionData.question });
        setAssistantMessage(`Next question, number ${parseInt(nextQuestionId) + 1}: ${nextQuestionData.question}. Your current answer is "${nextQuestionData.answer}". Do you want to change it?`);
        await speakText(`Next question, number ${parseInt(nextQuestionId) + 1}: ${nextQuestionData.question}. Your current answer is "${nextQuestionData.answer}". Do you want to change it?`, () => {
            if (recognitionRef.current && recognitionRef.current.startListeningDirectly) {
                recognitionRef.current.startListeningDirectly();
            }
        });
    } else {
        setAssistantMessage("You've reviewed all questions. Are you ready to submit, or do you want to go back to the beginning of the review?");
        await speakText("You've reviewed all questions. Are you ready to submit, or do you want to go back to the beginning of the review?", () => {
            if (recognitionRef.current && recognitionRef.current.startListeningDirectly) {
                recognitionRef.current.startListeningDirectly();
            }
        });
        setCurrentQuestionData(null); // No current question in review mode
        // Offer buttons to go back to final confirmation or restart review
    }
  }, [currentReviewIndex, storedResponses, speakText]);
 
  // Handle re-answering a question during review
  useEffect(() => {
    // This effect listens to changes in currentQuestionData and reviewingResponses
    // to potentially trigger a re-answer prompt for the specific question.
    // The backend logic handles re-asking the question
    // by returning action 'ask_question' or 're_ask' for the specific question ID.
    // The sendToBackend already has the `questionIdToReAnswer` parameter
    // so if the user responds "yes" (to change it) during review,
    // the `sendToBackend` call will send the `re_answer_specific_question` action
    // with the `currentQuestionData.id`.
    // No explicit call needed here, as the backend drives the flow after user input.
  }, [reviewingResponses, currentQuestionData, isSpeaking, isListening]);
 
  return (
    <div className="app-container">
      <div className="app-header">
        <h1>ADHD Form Assistant</h1>
        <Link to="/admin" className="admin-link">Admin Panel</Link>
      </div>
 
      <div className="avatar-section">
        <Avatar
          talking={isSpeaking}
          listening={isListening}
          selectedAvatarData={selectedAvatar}
          altText={selectedAvatar?.name || "Avatar"}
        />
        <div className="assistant-dialogue">
          <p>{assistantMessage}</p>
        </div>
      </div>
 
      <div className="interaction-area">
        {/* Avatar selection */}
        {!selectedAvatar && !formStarted && !showFinalConfirmation && !finalSubmissionConfirmed && (
          <div className="start-form-section">
            <h2>Select Your Avatar</h2>
            <div className="avatar-selection" style={{ display: 'flex', justifyContent: 'center', marginBottom: '20px' }}>
              {avatarOptions.map((avatar) => (
                <div
                  key={avatar.id}
                  className={`avatar-option ${selectedAvatar && selectedAvatar.id === avatar.id ? 'selected' : ''}`}
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
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    padding: '10px',
                  }}
                >
                  <img src={avatar.png} alt={avatar.name} style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />
                  <p style={{ marginTop: '10px', fontWeight: 'bold' }}>{avatar.name}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Language selection */}
        {selectedAvatar && !languageSelected && !formStarted && !showFinalConfirmation && !finalSubmissionConfirmed && (
          <div className="start-form-section">
            {/* <h2>Select Your Language</h2> */}
            <LanguageSelector 
              currentLanguage={currentLanguage}
              onLanguageChange={handleLanguageChange}
              t={t}
            />
          </div>
        )}

        {/* Start form button */}
        {selectedAvatar && languageSelected && !formStarted && !showFinalConfirmation && !finalSubmissionConfirmed && (
          <div className="start-form-section">
            <button
              onClick={startConversation}
              disabled={isSpeaking || sessionId !== null}
            >
              Start Form
            </button>
          </div>
        )}
 
        {/* --- Final Confirmation Section --- */}
        {showFinalConfirmation && !reviewingResponses && (
            <div className="final-confirmation-section">
                <h2>Form Complete!</h2>
                <p>All questions have been asked. Please review your answers below.</p>
 
                <h3>Your Current Responses:</h3>
                <ul style={{ maxHeight: '200px', overflowY: 'auto', border: '1px solid #ccc', padding: '10px', borderRadius: '5px', backgroundColor: '#f9f9f9' }}>
                    {Object.entries(storedResponses).map(([id, data]) => (
                        <li key={id} style={{ marginBottom: '5px' }}>
                            <strong>Q{parseInt(id) + 1}:</strong> "{data.question}" - Answer: "<strong>{data.answer}</strong>"
                        </li>
                    ))}
                </ul>
 
                <p>Are you okay with submitting these final responses, or would you like to re-answer any questions?</p>
                <div className="button-group">
                    <button onClick={handleFinalSubmit} disabled={isSpeaking}>Yes, I'm ready to submit</button>
                    <button onClick={handleReviewResponses} disabled={isSpeaking}>No, I want to review/change an answer</button>
                </div>
            </div>
        )}
 
        {/* --- Reviewing Responses Section --- */}
        {reviewingResponses && (
            <div className="review-questions-section">
                <h2>Reviewing Responses</h2>
                {currentQuestionData ? (
                    <>
                        <p>Currently reviewing: **Question {parseInt(currentQuestionData.id) + 1}:** "{currentQuestionData.question}"</p>
                        <p>Your current answer: "<strong>{storedResponses[currentQuestionData.id]?.answer}</strong>"</p>
                        <p>Do you want to change this answer? Speak or type your new response, or say "No" to keep it as is.</p>
                    </>
                ) : (
                    <p>You have reviewed all questions. Use the buttons below to finalize or go back.</p>
                )}
 
                <div className="user-controls">
                    <div className="button-group">
                        <button onClick={handleStartListening} disabled={isListening || isSpeaking}>
                            {isListening ? t('ui.stopListening') : t('ui.startListening')}
                        </button>
                        <button onClick={stopListening} disabled={!isListening}>
                            {t('ui.stopListening')}
                        </button>
                    </div>
 
                    <div className="text-input-section">
                        <input
                            type="text"
                            value={userInputText}
                            onChange={(e) => setUserInputText(e.target.value)}
                            placeholder={t('ui.typeResponse')}
                            disabled={isSpeaking || isListening}
                        />
                        <button onClick={handleManualSubmit} disabled={isSpeaking || isListening || userInputText.trim() === ""}>
                            {t('ui.send')}
                        </button>
                    </div>
 
                    {userTranscript && (
                        <p className="user-transcript">You said: "<em>{userTranscript}</em>"</p>
                    )}
                </div>
 
                <div className="button-group" style={{marginTop: '20px'}}>
                    <button onClick={handleNextReviewQuestion} disabled={isSpeaking || !currentQuestionData}>
                        {currentReviewIndex < Object.keys(storedResponses).length - 1 ? "Next Question to Review" : "Finished Reviewing"}
                    </button>
                    <button onClick={async () => {
                        setReviewingResponses(false);
                        setShowFinalConfirmation(true); // Go back to the main final confirmation screen
                        setAssistantMessage("Okay, you're back at the final submission review. Are you ready to submit, or want to review again?");
                        await speakText("Okay, you're back at the final submission review. Are you ready to submit, or want to review again?");
                    }} disabled={isSpeaking}>
                        Back to Final Review
                    </button>
                </div>
            </div>
        )}
 
        {/* --- Main Questionnaire Interaction Section (only visible if form started AND not in review/final confirmation) --- */}
        {formStarted && !showFinalConfirmation && !reviewingResponses && (
          <>
            <div className="question-display">
              <h2>Current Question:</h2>
              <p>{currentQuestion || "Please wait for the assistant to ask something..."}</p>
            </div>
 
            <div className="user-controls">
              <div className="button-group">
                <button onClick={handleStartListening} disabled={isListening || isSpeaking}>
                  {isListening ? t('ui.stopListening') : t('ui.startListening')}
                </button>
                <button onClick={stopListening} disabled={!isListening}>
                  {t('ui.stopListening')}
                </button>
              </div>
 
              <div className="text-input-section">
                <input
                  type="text"
                  value={userInputText}
                  onChange={(e) => setUserInputText(e.target.value)}
                  placeholder={t('ui.typeResponse')}
                  disabled={isSpeaking || isListening}
                />
                <button onClick={handleManualSubmit} disabled={isSpeaking || isListening || userInputText.trim() === ""}>
                  {t('ui.send')}
                </button>
              </div>
 
              {userTranscript && (
                <p className="user-transcript">You said: "<em>{userTranscript}</em>"</p>
              )}
            </div>
          </>
        )}
 
        {/* --- Saved Responses Section (Only show AFTER final submission is confirmed) --- */}
        {finalSubmissionConfirmed && Object.keys(storedResponses).length > 0 && (
          <div className="saved-responses-section">
            <hr/>
            <h3>Final Submitted Responses:</h3>
            <ul>
              {Object.entries(storedResponses).map(([id, data]) => (
                <li key={id}>
                  <strong>Q{parseInt(id) + 1}:</strong> "{data.question}" - Answered: "<strong>{data.answer}</strong>" (Heard: "{data.rawTranscript}")
                </li>
              ))}
            </ul>
            <button onClick={async () => {
              localStorage.removeItem('userQuestionnaireResponses');
              setStoredResponses({});
              setAssistantMessage("Responses cleared from local storage.");
              await speakText("Responses cleared."); // This message will still be spoken
              setFinalSubmissionConfirmed(false); // Hide the section if cleared
            }}>Clear All Responses</button>
          </div>
        )}
      </div>
    </div>
  );
}

// --- Main App Component with Routing ---
function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<Questionnaire />} />
        <Route path="/admin" element={<Admin />} />
      </Routes>
    </Router>
  );
}
 
export default App;