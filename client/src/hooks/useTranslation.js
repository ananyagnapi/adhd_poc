import { useState } from 'react';
import { translations } from '../translations';

const API_BASE_URL = 'http://localhost:3001/api';

export const useTranslation = () => {
  const [currentLanguage, setCurrentLanguage] = useState('en');
  const [translationCache, setTranslationCache] = useState({});

  const t = (key, fallback = key) => {
    const keys = key.split('.');
    let value = translations[currentLanguage];
    
    for (const k of keys) {
      value = value?.[k];
    }
    
    return value || fallback;
  };

  const translateWithAI = async (text, targetLanguage) => {
    const cacheKey = `${text}_${targetLanguage}`;
    
    if (translationCache[cacheKey]) {
      return translationCache[cacheKey];
    }

    try {
      const response = await fetch(`${API_BASE_URL}/translate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, targetLanguage })
      });

      if (response.ok) {
        const { translatedText } = await response.json();
        setTranslationCache(prev => ({ ...prev, [cacheKey]: translatedText }));
        return translatedText;
      }
    } catch (error) {
      console.warn('AI translation failed:', error);
    }
    
    return text;
  };

  return {
    currentLanguage,
    setCurrentLanguage,
    t,
    translateWithAI
  };
};