import React, { useState, useEffect } from 'react';
import './Admin.css';

const API_BASE_URL = 'http://localhost:3001/api';

const LANGUAGES = {
  en: 'English',
  es: 'Spanish', 
  hi: 'Hindi'
};

const Admin = () => {
  const [questions, setQuestions] = useState([]);
  const [newQuestion, setNewQuestion] = useState({
    question: '',
    type: 'options',
    options: ['Never', 'Rarely', 'Sometimes', 'Often', 'Very Often']
  });
  const [editingId, setEditingId] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetchQuestions();
  }, []);

  const fetchQuestions = async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/admin/questions`);
      const data = await response.json();
      setQuestions(data);
    } catch (error) {
      console.error('Error fetching questions:', error);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);

    try {
      const url = editingId 
        ? `${API_BASE_URL}/admin/questions/${editingId}`
        : `${API_BASE_URL}/admin/questions`;
      
      const method = editingId ? 'PUT' : 'POST';
      
      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...newQuestion, language: 'en' })
      });

      if (response.ok) {
        await fetchQuestions();
        setNewQuestion({
          question: '',
          type: 'options',
          options: ['Never', 'Rarely', 'Sometimes', 'Often', 'Very Often']
        });
        setEditingId(null);
      }
    } catch (error) {
      console.error('Error saving question:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleApprove = async (questionId, language) => {
    try {
      await fetch(`${API_BASE_URL}/admin/questions/${questionId}/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ language })
      });
      await fetchQuestions();
    } catch (error) {
      console.error('Error approving translation:', error);
    }
  };

  const handleEditTranslation = (question, language) => {
    const translation = question.translations?.[language] || question;
    setNewQuestion({
      question: translation.question,
      type: question.type,
      options: translation.options || []
    });
    setEditingId(`${question.id}_${language}`);
  };

  const handleEdit = (question) => {
    setNewQuestion({
      question: question.question,
      type: question.type || 'options',
      options: question.options ? [...question.options] : ['Never', 'Rarely', 'Sometimes', 'Often', 'Very Often']
    });
    setEditingId(question.id);
  };

  const handleDelete = async (id) => {
    if (!confirm('Are you sure you want to delete this question?')) return;

    try {
      const response = await fetch(`${API_BASE_URL}/admin/questions/${id}`, {
        method: 'DELETE'
      });

      if (response.ok) {
        await fetchQuestions();
      }
    } catch (error) {
      console.error('Error deleting question:', error);
    }
  };

  const handleOptionChange = (index, value) => {
    const updatedOptions = [...newQuestion.options];
    updatedOptions[index] = value;
    setNewQuestion({ ...newQuestion, options: updatedOptions });
  };

  const addOption = () => {
    setNewQuestion({
      ...newQuestion,
      options: [...newQuestion.options, '']
    });
  };

  const removeOption = (index) => {
    const updatedOptions = newQuestion.options.filter((_, i) => i !== index);
    setNewQuestion({ ...newQuestion, options: updatedOptions });
  };

  return (
    <div className="admin-container">
      <div className="admin-header">
        <h1>Admin Panel - Question Management</h1>
        <a href="/" className="back-link">← Back to App</a>
      </div>

      <div className="admin-content">
        <div className="question-form">
          <h2>{editingId ? 'Edit Question' : 'Add New Question'}</h2>

          <form onSubmit={handleSubmit}>
            <div className="form-group">
              <label>Question:</label>
              <textarea
                value={newQuestion.question}
                onChange={(e) => setNewQuestion({ ...newQuestion, question: e.target.value })}
                placeholder="Enter your question here..."
                required
                rows={3}
              />
            </div>

            <div className="form-group">
              <label>Question Type:</label>
              <select
                value={newQuestion.type}
                onChange={(e) => setNewQuestion({ ...newQuestion, type: e.target.value })}
                className="type-select"
              >
                <option value="options">Multiple Choice (Options)</option>
                <option value="freetext">Free Text Response</option>
              </select>
            </div>

            {newQuestion.type === 'options' && (
              <div className="form-group">
                <label>Options:</label>
                {newQuestion.options.map((option, index) => (
                  <div key={index} className="option-input">
                    <input
                      type="text"
                      value={option}
                      onChange={(e) => handleOptionChange(index, e.target.value)}
                      placeholder={`Option ${index + 1}`}
                      required
                    />
                    {newQuestion.options.length > 2 && (
                      <button
                        type="button"
                        onClick={() => removeOption(index)}
                        className="remove-option"
                      >
                        <i className="fas fa-trash"></i>
                      </button>
                    )}
                  </div>
                ))}
                <button type="button" onClick={addOption} className="add-option">
                  + Add Option
                </button>
              </div>
            )}

            {newQuestion.type === 'freetext' && (
              <div className="form-group">
                <div className="freetext-info">
                  <p><strong>Free Text Question:</strong> Users will be able to provide open-ended responses to this question.</p>
                </div>
              </div>
            )}

            <div className="form-actions">
              <button type="submit" disabled={loading} className="save-btn">
                {loading ? 'Saving...' : (editingId ? 'Update Question' : 'Add Question')}
              </button>
              {editingId && (
                <button
                  type="button"
                  onClick={() => {
                    setEditingId(null);
                    setNewQuestion({
                      question: '',
                      type: 'options',
                      options: ['Never', 'Rarely', 'Sometimes', 'Often', 'Very Often']
                    });
                  }}
                  className="cancel-btn"
                >
                  Cancel
                </button>
              )}
            </div>
          </form>
        </div>

        <div className="questions-list">
          <h2>Existing Questions ({questions.length})</h2>
          {questions.length === 0 ? (
            <p className="no-questions">No questions found. Add your first question above.</p>
          ) : (
            <div className="questions-grid">
              {questions.map((question) => (
                <div key={question.id} className="question-card-multi">
                  <div className="question-header">
                    <span className="question-id">Q{parseInt(question.id) + 1}</span>
                    <div className="question-actions">
                      <button onClick={() => handleEdit(question)} className="edit-btn">
                        Edit
                      </button>
                      <button onClick={() => handleDelete(question.id)} className="delete-btn">
                        <i className="fas fa-trash"></i> Delete All
                      </button>
                    </div>
                  </div>
                  
                  <div className="languages-container">
                    {Object.entries(LANGUAGES).map(([langCode, langName]) => {
                      const translation = langCode === 'en' ? question : question.translations?.[langCode];
                      const isApproved = translation?.approved || langCode === 'en';
                      
                      return (
                        <div key={langCode} className={`language-version ${isApproved ? 'approved' : 'pending'}`}>
                          <div className="language-header">
                            <span className="language-name">{langName}</span>
                            <div className="language-actions">
                              {!isApproved && (
                                <button 
                                  onClick={() => handleApprove(question.id, langCode)}
                                  className="approve-btn"
                                >
                                  Approve
                                </button>
                              )}
                              <button 
                                onClick={() => handleEditTranslation(question, langCode)}
                                className="edit-translation-btn"
                              >
                                Edit
                              </button>
                            </div>
                          </div>
                          
                          <div className="translation-content">
                            <div className="question-text">
                              {translation?.question || 'Translation pending...'}
                            </div>
                            
                            {question.type !== 'freetext' && translation?.options && (
                              <div className="question-options">
                                <strong>Options:</strong>
                                <ul>
                                  {translation.options.map((option, index) => (
                                    <li key={index}>{option}</li>
                                  ))}
                                </ul>
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  
                  <div className="question-type">
                    <span className={`type-badge ${question.type || 'options'}`}>
                      {question.type === 'freetext' ? 'Free Text' : 'Multiple Choice'}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default Admin;