import React, { useState, useEffect } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import './Admin.css';

const API_BASE_URL = 'http://localhost:3001/api';

const LANGUAGES = {
  en: 'English',
  es: 'Spanish', 
  hi: 'Hindi'
  // fr: 'French'
};

// Function to detect language of text (simple detection based on character sets)
const detectLanguageSimple = (text) => {
  if (!text) return 'en';
  
  // Check for Hindi characters
  if (/[\u0900-\u097F]/.test(text)) return 'hi';
  
  // Check for common Spanish words/patterns
  if (/[ñáéíóúü¿¡]/i.test(text)) return 'es';
  
  // Check for French characters
  if (/[àâäçéèêëïîôùûüÿ]/i.test(text)) return 'fr';
  
  // Default to English
  return 'en';
};

const Admin = () => {
  const [newQuestion, setNewQuestion] = useState({
    title: 'Default Questionnaire',
    question: '',
    type: 'options',
    options: ['Never', 'Rarely', 'Sometimes', 'Often', 'Very Often']
  });
  const [editingId, setEditingId] = useState(null);
  const [loading, setLoading] = useState(false);
  const [detectedLanguage, setDetectedLanguage] = useState('en');
  const [previewQuestions, setPreviewQuestions] = useState([]);
  const [showPreview, setShowPreview] = useState(false);
  const [questionsList, setQuestionsList] = useState([]);
  const [formTitle, setFormTitle] = useState('ADHD Assessment Form');

  // Get questions from Redux store
  const allQuestions = useSelector((state) => state.quetion.quetionData) || [];
  const dispatch = useDispatch();
  
  // Debug Redux state
  console.log('Current Redux questions state:', allQuestions);

  // Detect language when question text changes
  useEffect(() => {
    const detected = detectLanguageSimple(newQuestion.question);
    setDetectedLanguage(detected);
  }, [newQuestion.question]);

  // Get unique questionnaire groups and their questions by language
  const getQuestionsForDisplay = () => {
    const questionsByQid = {};
    
    // Group all questions by qid first
    allQuestions.forEach(question => {
      const qid = question.qid;
      if (!questionsByQid[qid]) {
        questionsByQid[qid] = {};
      }
      questionsByQid[qid][question.language] = question;
    });

    // Convert to array - show all languages but highlight detected language differently
    return Object.entries(questionsByQid).map(([qid, languageQuestions]) => {
      return {
        qid,
        languageQuestions,
        detectedLanguage
      };
    }).filter(item => Object.keys(item.languageQuestions).length > 0);
  };

  const questionsForDisplay = getQuestionsForDisplay();

  useEffect(() => {
    // Fetch questions when component mounts
    fetchQuestions();
  }, []);

  const fetchQuestions = async () => {
    try {
      console.log('Fetching questions from:', `${API_BASE_URL}/admin/questions`);
      const response = await fetch(`${API_BASE_URL}/admin/questions`);
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      const data = await response.json();
      console.log('Fetched questions data:', data);
      
      // Dispatch action to update Redux store
      dispatch({ 
        type: 'quetionData/addAllQuetions', 
        payload: data 
      });
      
      console.log('Questions dispatched to Redux store');
    } catch (error) {
      console.error('Error fetching questions:', error);
      alert(`Failed to fetch questions: ${error.message}`);
    }
  };

  const handlePreview = async () => {
    if (!newQuestion.question?.trim()) {
      alert('Question text is required for preview');
      return;
    }

    setLoading(true);
    try {
      const response = await fetch(`${API_BASE_URL}/admin/questions/preview`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question: newQuestion.question,
          type: newQuestion.type,
          options: newQuestion.type === 'options' ? newQuestion.options : []
        })
      });

      const data = await response.json();
      if (response.ok) {
        setPreviewQuestions(data.questions);
        setShowPreview(true);
      } else {
        alert(`Preview failed: ${data.error}`);
      }
    } catch (error) {
      alert(`Preview error: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  const addToQuestionsList = async () => {
    if (!newQuestion.question?.trim()) {
      alert('Question text is required');
      return;
    }

    setLoading(true);
    try {
      const response = await fetch(`${API_BASE_URL}/admin/questions/preview`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question: newQuestion.question,
          type: newQuestion.type,
          options: newQuestion.type === 'options' ? newQuestion.options : []
        })
      });

      const data = await response.json();
      if (response.ok) {
        setQuestionsList([...questionsList, {
          id: Date.now(),
          originalQuestion: newQuestion.question,
          type: newQuestion.type,
          options: newQuestion.options,
          translations: data.questions
        }]);
        
        setNewQuestion({
          ...newQuestion,
          question: '',
          options: ['Never', 'Rarely', 'Sometimes', 'Often', 'Very Often']
        });
      } else {
        alert(`Preview failed: ${data.error}`);
      }
    } catch (error) {
      alert(`Preview error: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  const saveAllQuestions = async () => {
    if (!questionsList.length) {
      alert('Please add questions first');
      return;
    }

    setLoading(true);
    try {
      const allTranslations = questionsList.flatMap(q => q.translations);
      
      const response = await fetch(`${API_BASE_URL}/admin/questions/save`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: formTitle,
          questions: allTranslations
        })
      });

      const data = await response.json();
      if (response.ok) {
        alert(`${questionsList.length} questions saved successfully!`);
        setQuestionsList([]);
        setNewQuestion({
          title: 'Default Questionnaire',
          question: '',
          type: 'options',
          options: ['Never', 'Rarely', 'Sometimes', 'Often', 'Very Often']
        });
        await fetchQuestions();
      } else {
        alert(`Save failed: ${data.error}`);
      }
    } catch (error) {
      alert(`Save error: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  const removeFromQuestionsList = (id) => {
    setQuestionsList(questionsList.filter(q => q.id !== id));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);

    console.log('Submit initiated with editingId:', editingId);
    console.log('Current form state:', newQuestion);

    try {
      let url, method, requestBody;
      
      if (editingId) {
        // HANDLE UPDATE: Find the question being edited to get its details
        const currentQuestion = allQuestions.find(q => q._id === editingId);
        
        console.log('Found current question for editing:', currentQuestion);
        
        if (!currentQuestion) {
          alert('Question not found. Please refresh the page and try again.');
          setLoading(false);
          return;
        }

        // Ask user if they want to update all language versions
        const shouldRetranslate = confirm(
          'Do you want to update all language versions of this question with new translations?\n\n' +
          'Click "OK" to update all languages (recommended)\n' +
          'Click "Cancel" to abort the update'
        );

        if (!shouldRetranslate) {
          // User clicked Cancel - abort the update
          console.log('Update cancelled by user');
          setLoading(false);
          return;
        }

        // User clicked OK - proceed with updating all language versions
        url = `${API_BASE_URL}/admin/questions/${editingId}`;
        method = 'PUT';
        
        requestBody = {
          question_text: newQuestion.question || '',
          question_type: newQuestion.type || 'options',
          options: newQuestion.type === 'options' ? (newQuestion.options || []) : [],
          retranslate: true // Flag to trigger retranslation
        };

        console.log('UPDATE with retranslation:', {
          id: editingId,
          currentLanguage: currentQuestion.language,
          qid: currentQuestion.qid,
          url: url,
          method: method,
          body: requestBody
        });

        // Ensure question_text is not empty
        if (!requestBody.question_text.trim()) {
          alert('Question text cannot be empty');
          setLoading(false);
          return;
        }

      } else {
        // HANDLE CREATE: New question creation
        url = `${API_BASE_URL}/admin/questions`;
        method = 'POST';
        
        const currentFormId = localStorage.getItem('currentFormId');
        const currentQuestionnaireId = localStorage.getItem('currentQuestionnaireId');
        
        requestBody = {
          title: newQuestion.title || 'Default Questionnaire',
          question: newQuestion.question || '',
          type: newQuestion.type || 'options',
          options: newQuestion.type === 'options' ? (newQuestion.options || []) : [],
          form_id: currentFormId,
          questionnaire_id: currentQuestionnaireId
        };
        
        console.log('Using localStorage values:', {
          currentFormId,
          currentQuestionnaireId,
          willCreateNewQuestionnaire: !currentQuestionnaireId
        });

        // Ensure question is not empty
        if (!requestBody.question.trim()) {
          alert('Question text cannot be empty');
          setLoading(false);
          return;
        }

        console.log('CREATE Request:', {
          url: url,
          method: method,
          body: requestBody
        });
      }
      
      console.log('Making request to:', url, 'with method:', method);
      
      const response = await fetch(url, {
        method: method,
        headers: { 
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify(requestBody)
      });

      console.log('Response received:', response.status, response.statusText);
      
      const responseData = await response.json();
      console.log('Response data:', responseData);

      if (response.ok) {
        console.log('Success:', responseData);
        
        // Store form and questionnaire IDs for reuse
        if (!editingId && responseData.form_id) {
          localStorage.setItem('currentFormId', responseData.form_id);
        }
        if (!editingId && responseData.questionnaire_id) {
          localStorage.setItem('currentQuestionnaireId', responseData.questionnaire_id);
        }
        
        // Refresh questions to show all updates
        await fetchQuestions();
        
        // Reset form
        setNewQuestion({
          title: 'Default Questionnaire',
          question: '',
          type: 'options',
          options: ['Never', 'Rarely', 'Sometimes', 'Often', 'Very Often']
        });
        setEditingId(null);
        
        const successMessage = editingId 
          ? 'Question updated and retranslated to all languages!'
          : 'Question created and translated to all languages!';
        
        alert(successMessage);
      } else {
        console.error('Server Error:', {
          status: response.status,
          statusText: response.statusText,
          responseData: responseData,
          sentData: requestBody
        });
        
        alert(`Error: ${responseData.error || 'Server error occurred'}`);
      }
    } catch (error) {
      console.error('Network Error:', error);
      alert(`Network error: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleApprove = async (questionId) => {
    try {
      await fetch(`${API_BASE_URL}/admin/questions/${questionId}/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });
      await fetchQuestions();
    } catch (error) {
      console.error('Error approving translation:', error);
    }
  };

  const handleEditTranslation = (question, language) => {
    console.log('Editing translation for question:', question, 'Language:', language);
  
    setNewQuestion({
      title: question.title || 'Default Questionnaire',
      question: question.question_text || '',
      type: question.question_type || 'options',
      options: question.options || ['Never', 'Rarely', 'Sometimes', 'Often', 'Very Often']
    });
    
    // Set editing ID to the actual question document ID
    setEditingId(question._id);
    
    console.log('Edit translation state set:', {
      editingId: question._id,
      language: language,
      questionText: question.question_text,
      questionType: question.question_type,
      options: question.options
    });
  };

  const handleEdit = (question) => {
    console.log('Editing question:', question);
    
    // Set form state with the question data
    setNewQuestion({
      title: newQuestion.title,
      question: question.question_text || '',
      type: question.question_type || 'options',
      options: question.options || ['Never', 'Rarely', 'Sometimes', 'Often', 'Very Often']
    });
    
    // Set editing ID to the actual question document ID
    setEditingId(question._id);
    
    console.log('Edit state set:', {
      editingId: question._id,
      questionText: question.question_text,
      questionType: question.question_type,
      options: question.options
    });
  };

  const handleDelete = async (question) => {
    if (!confirm('Are you sure you want to delete this question in ALL languages? This action cannot be undone.')) return;

    console.log('Delete initiated for question:', question);
    console.log('All questions available:', allQuestions);

    try {
      // Get all questions with the same qid (questionnaire ID)
      const questionsToDelete = allQuestions.filter(q => q.qid === question.qid);
      
      console.log(`Deleting ${questionsToDelete.length} questions with qid: ${question.qid}`);
      console.log('Questions to delete:', questionsToDelete.map(q => ({ id: q._id, lang: q.language, text: q.question_text })));
      
      if (questionsToDelete.length === 0) {
        alert('No questions found to delete. Please refresh the page and try again.');
        return;
      }
      
      // Delete each question individually using existing endpoint
      const deletePromises = questionsToDelete.map(q => {
        const url = `${API_BASE_URL}/admin/questions/${q._id}`;
        console.log(`Deleting question at: ${url}`);
        return fetch(url, {
          method: 'DELETE',
          headers: {
            'Content-Type': 'application/json'
          }
        });
      });

      const responses = await Promise.all(deletePromises);
      
      // Check responses
      let successCount = 0;
      let failCount = 0;
      
      for (let i = 0; i < responses.length; i++) {
        const response = responses[i];
        const question = questionsToDelete[i];
        
        if (response.ok) {
          successCount++;
          console.log(`✅ Successfully deleted question ${question._id} (${question.language})`);
        } else {
          failCount++;
          const errorText = await response.text();
          console.error(`❌ Failed to delete question ${question._id} (${question.language}):`, {
            status: response.status,
            statusText: response.statusText,
            error: errorText
          });
        }
      }
      
      console.log(`Delete summary: ${successCount} successful, ${failCount} failed`);
      
      if (successCount > 0) {
        await fetchQuestions();
        
        if (failCount === 0) {
          alert(`Successfully deleted all ${successCount} questions in all languages`);
        } else {
          alert(`Deleted ${successCount} questions successfully, but ${failCount} failed. Please refresh and try again for any remaining questions.`);
        }
      } else {
        alert('Failed to delete any questions. Please check the console for details and try again.');
      }
    } catch (error) {
      console.error('Error deleting questions:', error);
      alert(`Error deleting questions: ${error.message}. Please check the console for details.`);
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
    
          <div className="form-header">
            <div className="form-group">
              <label>Form Title:</label>
              <input
                type="text"
                value={formTitle}
                onChange={(e) => setFormTitle(e.target.value)}
                placeholder="Enter form title..."
                required
                style={{ color: '#333', backgroundColor: '#f9f9f9' }}
              />
            </div>
            {questionsList.length > 0 && (
              <div className="questions-counter">
                <span>{questionsList.length} question(s) added</span>
                <button type="button" onClick={saveAllQuestions} disabled={loading} className="save-all-btn">
                  {loading ? 'Saving...' : `Save All ${questionsList.length} Questions`}
                </button>
              </div>
            )}
            {/* <div className="questionnaire-controls">
              <button 
                type="button" 
                onClick={() => {
                  localStorage.removeItem('currentFormId');
                  localStorage.removeItem('currentQuestionnaireId');
                  alert('Started new questionnaire. Next question will create a new form.');
                }} 
                className="new-questionnaire-btn"
                title="Start a new questionnaire"
              >
                New Questionnaire
              </button>
            </div> */}
          </div>

          <form onSubmit={(e) => e.preventDefault()}>

            <div className="form-group">
              <label>Question:</label>
              <textarea
                value={newQuestion.question}
                onChange={(e) => setNewQuestion({ ...newQuestion, question: e.target.value })}
                placeholder="Enter your question here (in any language)..."
                required
                rows={3}
                  style={{ color: '#333', backgroundColor: '#f9f9f9' }}
              />
              {editingId && (
                <small style={{color: '#666', fontSize: '12px'}}>
                  Editing ID: {editingId} | Current text length: {newQuestion.question?.length || 0}
                </small>
              )}
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
                <div className="options-header">
                  <label>Options:</label>
                  <button type="button" onClick={addOption} className="add-option">
                    + Add Option
                  </button>
                </div>
                {newQuestion.options.map((option, index) => (
                  <div key={index} className="option-input">
                    <input
                      type="text"
                      value={option}
                      onChange={(e) => handleOptionChange(index, e.target.value)}
                      placeholder={`Option ${index + 1}`}
                      required
                      style={{ color: '#333', backgroundColor: '#f9f9f9' }}
                    />
                    {newQuestion.options.length > 2 && (
                      <button
                        type="button"
                        onClick={() => removeOption(index)}
                        className="remove-option"
                      >
                        <i className="fas fa-times"></i>
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}

            {newQuestion.type === 'freetext' && (
              <div className="form-group">
                <div className="freetext-info">
                  <p><strong>Free Text Question:</strong> Users will be able to provide open-ended responses to this question.</p>
                  <p><em>Note: System will auto-translate to other languages.</em></p>
                </div>
              </div>
            )}

            <div className="form-actions">
              {!editingId && (
                <button type="button" onClick={addToQuestionsList} disabled={loading} className="add-question-btn">
                  {loading ? 'Adding...' : 'Add Question'}
                </button>
              )}
              {editingId && (
                <>
                  <button onClick={handleSubmit} disabled={loading} className="save-btn">
                    {loading ? 'Updating...' : 'Update Question'}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setEditingId(null);
                      setNewQuestion({
                        title: 'Default Questionnaire',
                        question: '',
                        type: 'options',
                        options: ['Never', 'Rarely', 'Sometimes', 'Often', 'Very Often']
                      });
                    }}
                    className="cancel-btn"
                  >
                    Cancel
                  </button>
                </>
              )}
            </div>
          </form>
        </div>

        {questionsList.length > 0 && (
          <div className="questions-queue">
            <h2>Questions to Save ({questionsList.length})</h2>
            <div className="queue-list">
              {questionsList.map((questionItem, index) => (
                <div key={questionItem.id} className="queue-item">
                  <div className="queue-header">
                    <span className="queue-number">Q{index + 1}</span>
                    <button onClick={() => removeFromQuestionsList(questionItem.id)} className="remove-queue-btn">
                      ×
                    </button>
                  </div>
                  <div className="queue-content">
                    <div className="translations-grid">
                      {questionItem.translations.map((translation, i) => (
                        <div key={i} className={`translation-card language-${translation.language}`}>
                          <div className="translation-header">
                            <span className={`language-name language-${translation.language}`}>
                              {LANGUAGES[translation.language]}
                            </span>
                            <span className={`status ${translation.status}`}>{translation.status}</span>
                          </div>
                          <div className="translation-content">
                            <p><strong>Question:</strong> {translation.question_text}</p>
                            {translation.options && translation.options.length > 0 && (
                              <div>
                                <strong>Options:</strong>
                                <ul>
                                  {translation.options.map((option, optIndex) => (
                                    <li key={optIndex}>{option}</li>
                                  ))}
                                </ul>
                              </div>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="questions-list">
          <h2>Existing Questions ({questionsForDisplay.length})</h2>
          {/* {newQuestion.question && (
            <p className="filter-info">
              Showing all questions - current input language ({LANGUAGES[detectedLanguage]}) is highlighted
            </p>
          )} */}
          
          {questionsForDisplay.length === 0 ? (
            <p className="no-questions">No questions found. Add your first question above.</p>
          ) : (
            <div className="questions-grid">
              {questionsForDisplay.map((questionGroup, index) => {
                const languageQuestions = Object.values(questionGroup.languageQuestions);
                const firstQuestion = languageQuestions[0]; // Use first question for main info
                
                return (
                  <div key={questionGroup.qid} className="question-card-multi">
                    <div className="question-header">
                      <span className="question-id">Q{index + 1}</span>
                    </div>
                    
                    <div className="languages-container">
                      {Object.entries(questionGroup.languageQuestions).map(([langCode, question]) => {
                        const isApproved = question.is_approved;
                        const isDetectedLanguage = langCode === detectedLanguage;
                        
                        return (
                          <div key={langCode} className={`language-version ${isApproved ? 'approved' : 'pending'} ${isDetectedLanguage ? 'detected-lang' : ''}`}>
                            <div className="language-header">
                              <span className={`language-name language-${langCode}`}>
                                {LANGUAGES[langCode]}
                              </span>
                              <div className="language-actions">
                                {!isApproved && (
                                  <button 
                                    onClick={() => handleApprove(question._id || question.id)}
                                    className="approve-btn"
                                  >
                                    <i className="fas fa-check"></i> Approve
                                  </button>
                                )}
                                <button 
                                  onClick={() => handleEditTranslation(question, langCode)}
                                  className="edit-translation-btn"
                                >
                                  <i className="fas fa-edit"></i>
                                </button>
                              </div>
                            </div>
                            
                            <div className="translation-content">
                              <div className="question-text">
                                {question.question_text || 'Translation pending...'}
                              </div>
                              
                              {question.question_type !== 'freetext' && question.options && question.options.length > 0 && (
                                <div className="question-options">
                                  <strong>Options:</strong>
                                  <ul>
                                    {question.options.map((option, optionIndex) => (
                                      <li key={optionIndex}>{option}</li>
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
                      <span className={`type-badge ${firstQuestion.question_type || 'options'}`}>
                        {firstQuestion.question_type === 'freetext' ? 'Free Text' : 'Multiple Choice'}
                      </span>
                      <div className="question-actions">
                        <button onClick={() => handleEdit(firstQuestion)} className="edit-btn">
                          <i className="fas fa-edit"></i>
                        </button>
                        <button onClick={() => handleDelete(firstQuestion)} className="delete-btn">
                          <i className="fas fa-trash"></i>
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default Admin;