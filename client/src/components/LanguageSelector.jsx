import React from 'react';
import { supportedLanguages } from '../translations';

const LanguageSelector = ({ currentLanguage, onLanguageChange, t }) => {
  return (
    <div className="language-selector">
      <label htmlFor="language-select">Select your Language</label>
      <select 
        id="language-select"
        value={currentLanguage} 
        onChange={(e) => onLanguageChange(e.target.value)}
        className="language-dropdown"
      >
        <option value="" disabled>Choose your language...</option>
        {supportedLanguages.map(lang => (
          <option key={lang.code} value={lang.code}>
            {lang.flag} {lang.name}
          </option>
        ))}
      </select>
    </div>
  );
};

export default LanguageSelector;