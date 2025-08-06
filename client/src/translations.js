// Hardcoded translations for common languages
export const translations = {
  en: {
    selectAvatar: "Select an avatar to continue.",
    question1: "How often do you find it difficult to focus on a task when there are distractions around you?",
    question2: "How often do you forget appointments or important dates?",
    question3: "How often do you misplace or lose things like keys, wallet, or phone?",
    options: {
      never: "Never",
      rarely: "Rarely", 
      sometimes: "Sometimes",
      often: "Often",
      veryOften: "Very Often"
    },
    ui: {
      startListening: "Start Listening",
      stopListening: "Stop Listening",
      repeatQuestion: "Repeat Question",
      typeResponse: "Type your response...",
      send: "Send",
      selectLanguage: "Select Language"
    }
  },
  es: {
    selectAvatar: "Selecciona un avatar para continuar.",
    question1: "¿Con qué frecuencia te resulta difícil concentrarte en una tarea cuando hay distracciones a tu alrededor?",
    question2: "¿Con qué frecuencia olvidas citas o fechas importantes?",
    question3: "¿Con qué frecuencia pierdes cosas como llaves, billetera o teléfono?",
    options: {
      never: "Nunca",
      rarely: "Raramente",
      sometimes: "A veces", 
      often: "A menudo",
      veryOften: "Muy a menudo"
    },
    ui: {
      startListening: "Comenzar a Escuchar",
      stopListening: "Dejar de Escuchar", 
      repeatQuestion: "Repetir Pregunta",
      typeResponse: "Escribe tu respuesta...",
      send: "Enviar",
      selectLanguage: "Seleccionar Idioma"
    }
  },
  fr: {
    selectAvatar: "Sélectionnez un avatar pour continuer.",
    question1: "À quelle fréquence avez-vous du mal à vous concentrer sur une tâche lorsqu'il y a des distractions autour de vous?",
    question2: "À quelle fréquence oubliez-vous des rendez-vous ou des dates importantes?",
    question3: "À quelle fréquence égarez-vous des objets comme les clés, le portefeuille ou le téléphone?",
    options: {
      never: "Jamais",
      rarely: "Rarement",
      sometimes: "Parfois",
      often: "Souvent", 
      veryOften: "Très souvent"
    },
    ui: {
      startListening: "Commencer à Écouter",
      stopListening: "Arrêter d'Écouter",
      repeatQuestion: "Répéter la Question", 
      typeResponse: "Tapez votre réponse...",
      send: "Envoyer",
      selectLanguage: "Sélectionner la Langue"
    }
  },
  hi: {
    selectAvatar: "जारी रखने के लिए एक अवतार चुनें।",
    question1: "आपके आसपास विकर्षण होने पर किसी कार्य पर ध्यान केंद्रित करना कितनी बार कठिन लगता है?",
    question2: "आप कितनी बार अपॉइंटमेंट या महत्वपूर्ण तारीखें भूल जाते हैं?",
    question3: "आप कितनी बार चाबी, बटुआ या फोन जैसी चीजें खो देते हैं?",
    options: {
      never: "कभी नहीं",
      rarely: "शायद ही कभी",
      sometimes: "कभी कभी",
      often: "अक्सर",
      veryOften: "बहुत अक्सर"
    },
    ui: {
      startListening: "सुनना शुरू करें",
      stopListening: "सुनना बंद करें",
      repeatQuestion: "प्रश्न दोहराएं",
      typeResponse: "अपना उत्तर टाइप करें...",
      send: "भेजें",
      selectLanguage: "भाषा चुनें"
    }
  }
};

export const supportedLanguages = [
  { code: 'en', name: 'English', flag: '🇺🇸' },
  { code: 'es', name: 'Español', flag: '🇪🇸' },
  { code: 'fr', name: 'Français', flag: '🇫🇷' },
  { code: 'hi', name: 'हिन्दी', flag: '🇮🇳' }
];

// Voice mappings for different languages
export const voiceMapping = {
  en: {
    femaleAdult: 'en-US-Wavenet-E',
    maleAdult: 'en-US-Wavenet-B', 
    smallGirl: 'en-US-Wavenet-F',
    smallBoy: 'en-US-Wavenet-A'
  },
  es: {
    femaleAdult: 'es-ES-Wavenet-C',
    maleAdult: 'es-ES-Wavenet-B',
    smallGirl: 'es-ES-Wavenet-C', 
    smallBoy: 'es-ES-Wavenet-B'
  },
  fr: {
    femaleAdult: 'fr-FR-Wavenet-C',
    maleAdult: 'fr-FR-Wavenet-B',
    smallGirl: 'fr-FR-Wavenet-A',
    smallBoy: 'fr-FR-Wavenet-B'
  },
  hi: {
    femaleAdult: 'hi-IN-Wavenet-A',
    maleAdult: 'hi-IN-Wavenet-B',
    smallGirl: 'hi-IN-Wavenet-A',
    smallBoy: 'hi-IN-Wavenet-B'
  }
};