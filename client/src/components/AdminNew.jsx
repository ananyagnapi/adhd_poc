import React, { useState, useEffect } from 'react';
import axios from 'axios';
import Admin from './Admin';
import './AdminNew.css';

const API_BASE_URL = 'http://localhost:3001/api';

// Test API connection on component load
const testAPIConnection = async () => {
  try {
    const response = await axios.get(`${API_BASE_URL}/admin/questions`);
    console.log('✅ API connection test successful:', response.status);
    return true;
  } catch (error) {
    console.error('❌ API connection test failed:', error);
    return false;
  }
};

function AdminNew() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [activePanel, setActivePanel] = useState('users');
  const [users, setUsers] = useState([]);
  const [questionnaires, setQuestionnaires] = useState([]);
  const [questions, setQuestions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selectedQuestionnaire, setSelectedQuestionnaire] = useState(null);
  const [questionnaireQuestions, setQuestionnaireQuestions] = useState([]);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [reviewMode, setReviewMode] = useState(false);

  const menuItems = [
    { id: 'users', label: 'Users', icon: '👥' },
    { id: 'questionnaires', label: 'Questionnaires', icon: '📋' },
    { id: 'settings', label: 'Settings', icon: '⚙️' },
    { id: 'analytics', label: 'Analytics', icon: '📊' }
  ];

  useEffect(() => {
    // Test API connection first
    testAPIConnection();
    
    if (activePanel === 'questionnaires') {
      fetchQuestionnaires();
    } else if (activePanel === 'questions') {
      fetchQuestions();
    } else if (activePanel === 'users') {
      fetchUsers();
    }
  }, [activePanel]);

  // Test API connection on component mount
  useEffect(() => {
    testAPIConnection();
  }, []);

  const fetchQuestionnaires = async () => {
    try {
      setLoading(true);
      const response = await axios.get(`${API_BASE_URL}/forms`);
      setQuestionnaires(response.data);
    } catch (error) {
      console.error('Error fetching questionnaires:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchQuestions = async () => {
    try {
      setLoading(true);
      const response = await axios.get(`${API_BASE_URL}/admin/questions`);
      setQuestions(response.data);
    } catch (error) {
      console.error('Error fetching questions:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchUsers = async () => {
    try {
      setLoading(true);
      // Mock users data since no users API exists
      setUsers([
        { id: 1, name: 'John Smith', email: 'john@example.com', role: 'Admin', status: 'active', joinDate: '2024-01-15' },
        { id: 2, name: 'Sarah Johnson', email: 'sarah@example.com', role: 'User', status: 'active', joinDate: '2024-02-03' },
        { id: 3, name: 'Mike Davis', email: 'mike@example.com', role: 'User', status: 'inactive', joinDate: '2024-01-28' }
      ]);
    } catch (error) {
      console.error('Error fetching users:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchQuestionnaireQuestions = async (formId) => {
    try {
      setLoading(true);
      const response = await axios.get(`${API_BASE_URL}/admin/questions`);
      // Filter questions by form/questionnaire if needed, or show all
      setQuestionnaireQuestions(response.data || []);
    } catch (error) {
      console.error('Error fetching questionnaire questions:', error);
      setQuestionnaireQuestions([]);
    } finally {
      setLoading(false);
    }
  };

  const viewQuestionnaireDetails = (questionnaire) => {
    setSelectedQuestionnaire(questionnaire);
    fetchQuestionnaireQuestions(questionnaire._id);
  };

  const backToQuestionnaires = () => {
    setSelectedQuestionnaire(null);
    setQuestionnaireQuestions([]);
  };

  const CreateQuestionnaireForm = () => (
    <div className="panel">
      <div className="panel-header">
        <div className="panel-title-section">
          <button 
            className="back-button"
            onClick={() => {
              setShowCreateForm(false);
              // Clear localStorage when going back
              localStorage.removeItem('currentFormId');
              localStorage.removeItem('currentQuestionnaireId');
            }}
          >
            ← Back to {selectedQuestionnaire ? 'Questionnaire Details' : 'Questionnaires'}
          </button>
          <h1>{selectedQuestionnaire ? 'Add Question to Questionnaire' : 'Create New Questionnaire'}</h1>
          <p>Add questions with automatic translation to all languages</p>
        </div>
      </div>
      <div className="old-admin-wrapper">
        <Admin />
      </div>
    </div>
  );



  const UsersPanel = () => (
    <div className="panel">
      <div className="panel-header">
        <div className="panel-title-section">
          <h1>Users Management</h1>
          <p>Manage user accounts and permissions</p>
        </div>
        <button className="btn-primary">+ Add User</button>
      </div>

      <div className="search-bar">
        <input type="text" placeholder="Search users..." />
        <select>
          <option>All Roles</option>
          <option>Admin</option>
          <option>User</option>
        </select>
      </div>

      {loading ? (
        <div className="loading">Loading...</div>
      ) : (
        <div className="table-container">
          <table className="data-table">
            <thead>
              <tr>
                <th>User</th>
                <th>Role</th>
                <th>Status</th>
                <th>Join Date</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.map((user) => (
                <tr key={user.id}>
                  <td>
                    <div className="user-info">
                      <div className="user-avatar">{user.name.charAt(0)}</div>
                      <div>
                        <div className="user-name">{user.name}</div>
                        <div className="user-email">{user.email}</div>
                      </div>
                    </div>
                  </td>
                  <td>{user.role}</td>
                  <td>
                    <span className={`status-badge ${user.status}`}>
                      {user.status}
                    </span>
                  </td>
                  <td>{new Date(user.joinDate).toLocaleDateString()}</td>
                  <td className="actions">
                    <button className="btn-icon">👁️</button>
                    <button className="btn-icon">✏️</button>
                    <button className="btn-icon delete">🗑️</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );

  const QuestionReviewMode = () => {
    const groupedQuestions = groupQuestionsByQuestionnaire(questionnaireQuestions);
    const questionGroups = Object.entries(groupedQuestions);
    const currentGroup = questionGroups[currentQuestionIndex];
    
    if (!currentGroup) {
      return (
        <div className="panel">
          <div className="panel-header">
            <button className="back-button" onClick={() => setReviewMode(false)}>
              ← Back to Details
            </button>
            <h1>Review Complete</h1>
          </div>
          <div className="review-complete">
            <p>All questions have been reviewed!</p>
            <button className="btn-primary" onClick={() => setReviewMode(false)}>
              Back to Questionnaire
            </button>
          </div>
        </div>
      );
    }
    
    const [qid, questionGroup] = currentGroup;
    
    return (
      <div className="panel">
        <div className="panel-header">
          <div className="panel-title-section">
            <button className="back-button" onClick={() => setReviewMode(false)}>
              ← Back to Details
            </button>
            <h1>Review Question {currentQuestionIndex + 1} of {questionGroups.length}</h1>
            <p>Review and approve translations for this question</p>
          </div>
        </div>
        
        <div className="question-review-container">
          <div className="question-group-card">
            <div className="question-group-header">
              <h3>Question Group</h3>
              <span className="group-id">ID: {qid}</span>
            </div>
            
            <div className="translations-container">
              {questionGroup.map((question) => (
                <div key={question._id} className="translation-card">
                  <div className="translation-header">
                    <div className="language-info">
                      <span className="language-badge">{question.language.toUpperCase()}</span>
                      <span className={`status-badge ${question.status}`}>
                        {question.status}
                      </span>
                    </div>
                    <span className={`type-badge ${question.question_type}`}>
                      {question.question_type}
                    </span>
                  </div>
                  
                  <div className="translation-content">
                    <p className="question-text">{question.question_text}</p>
                    
                    {question.options && question.options.length > 0 && (
                      <div className="question-options">
                        <span className="options-label">Options:</span>
                        <div className="options-list">
                          {question.options.map((option, idx) => (
                            <span key={idx} className="option-tag">{option}</span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                  
                  <div className="translation-actions">
                    {question.status !== 'approved' && (
                      <button 
                        className="btn-approve"
                        onClick={() => approveQuestion(question._id)}
                      >
                        ✓ Approve
                      </button>
                    )}
                    <button 
                      className="btn-icon"
                      onClick={() => editQuestion(question)}
                      title="Edit Question"
                    >
                      ✏️
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
          
          <div className="review-navigation">
            <button 
              className="btn-secondary"
              onClick={() => setCurrentQuestionIndex(Math.max(0, currentQuestionIndex - 1))}
              disabled={currentQuestionIndex === 0}
            >
              ← Previous Question
            </button>
            
            <span className="question-counter">
              {currentQuestionIndex + 1} / {questionGroups.length}
            </span>
            
            {currentQuestionIndex < questionGroups.length - 1 ? (
              <button 
                className="btn-primary"
                onClick={() => setCurrentQuestionIndex(currentQuestionIndex + 1)}
              >
                Next Question →
              </button>
            ) : (
              <button 
                className="btn-success"
                onClick={() => {
                  alert('All questions reviewed successfully!');
                  setReviewMode(false);
                }}
              >
                ✓ Submit All
              </button>
            )}
          </div>
        </div>
      </div>
    );
  };

  const QuestionnaireDetails = () => {
    const groupedQuestions = groupQuestionsByQuestionnaire(questionnaireQuestions);
    
    if (reviewMode) {
      return <QuestionReviewMode />;
    }
    
    return (
      <div className="panel">
        <div className="panel-header">
          <div className="panel-title-section">
            <button 
              className="back-button"
              onClick={backToQuestionnaires}
            >
              ← Back to Questionnaires
            </button>
            <h1>{selectedQuestionnaire?.title}</h1>
            <p>Questions with translations and approval status</p>
          </div>
          <div className="header-actions">
            <button 
              className="btn-secondary"
              onClick={() => {
                setReviewMode(true);
                setCurrentQuestionIndex(0);
              }}
              disabled={Object.keys(groupedQuestions).length === 0}
            >
              📋 Review Questions
            </button>
            <button 
              className="btn-primary"
              onClick={() => {
                // Only set questionnaire context, not form - let backend handle form lookup
                const firstQuestion = questionnaireQuestions[0];
                if (firstQuestion?.questionnaire_id) {
                  localStorage.setItem('currentQuestionnaireId', firstQuestion.questionnaire_id);
                  localStorage.removeItem('currentFormId'); // Remove form_id to let backend use questionnaire's form
                }
                setShowCreateForm(true);
              }}
            >
              + Add Question
            </button>
          </div>
        </div>

        {loading ? (
          <div className="loading">Loading questions...</div>
        ) : (
          <div className="question-groups">
            {Object.keys(groupedQuestions).length === 0 ? (
              <div className="no-questions">
                <p>No questions found for this questionnaire.</p>
              </div>
            ) : (
              Object.entries(groupedQuestions).map(([qid, questionGroup]) => (
                <div key={qid} className="question-group-card">
                  <div className="question-group-header">
                    <h3>Question Group</h3>
                    <span className="group-id">ID: {qid}</span>
                  </div>
                  
                  <div className="translations-container">
                    {questionGroup.map((question) => (
                      <div key={question._id} className="translation-card">
                        <div className="translation-header">
                          <div className="language-info">
                            <span className="language-badge">{question.language.toUpperCase()}</span>
                            <span className={`status-badge ${question.status}`}>
                              {question.status}
                            </span>
                          </div>
                          <span className={`type-badge ${question.question_type}`}>
                            {question.question_type}
                          </span>
                        </div>
                        
                        <div className="translation-content">
                          <p className="question-text">{question.question_text}</p>
                          
                          {question.options && question.options.length > 0 && (
                            <div className="question-options">
                              <span className="options-label">Options:</span>
                              <div className="options-list">
                                {question.options.map((option, idx) => (
                                  <span key={idx} className="option-tag">{option}</span>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                        
                        <div className="translation-actions">
                          {question.status !== 'approved' && (
                            <button 
                              className="btn-approve"
                              onClick={() => approveQuestion(question._id)}
                            >
                              ✓ Approve
                            </button>
                          )}
                          <button 
                            className="btn-icon"
                            onClick={() => editQuestion(question)}
                            title="Edit Question"
                          >
                            ✏️
                          </button>
                          <button 
                            className="btn-icon delete"
                            onClick={() => deleteQuestion(question)}
                            title="Delete Question"
                          >
                            🗑️
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </div>
    );
  };

  const QuestionnairesPanel = () => (
    <div className="panel">
      <div className="panel-header">
        <div className="panel-title-section">
          <h1>Questionnaires</h1>
          <p>Manage surveys and questionnaires</p>
        </div>
        <button className="btn-primary" onClick={() => setShowCreateForm(true)}>+ Create Questionnaire</button>
      </div>

      <div className="search-bar">
        <input type="text" placeholder="Search questionnaires..." />
      </div>

      {loading ? (
        <div className="loading">Loading...</div>
      ) : (
        <div className="cards-grid">
          {questionnaires.map((questionnaire) => (
            <div key={questionnaire._id} className="card">
              <div className="card-header">
                <h3>{questionnaire.title}</h3>
                <span className="status-badge active">Active</span>
              </div>
              <p className="card-description">{questionnaire.description || 'No description'}</p>
              <div className="card-info">
                <div className="info-row">
                  <span>Created:</span>
                  <span>{new Date(questionnaire.createdAt).toLocaleDateString()}</span>
                </div>
              </div>
              <div className="card-actions">
                <button 
                  className="btn-secondary"
                  onClick={() => viewQuestionnaireDetails(questionnaire)}
                >
                  View Details
                </button>
                <div className="action-buttons">
                  <button className="btn-icon" title="Edit Questionnaire">✏️</button>
                  <button 
                    className="btn-icon delete" 
                    onClick={() => deleteQuestionnaire(questionnaire)}
                    title="Delete Questionnaire"
                  >
                    🗑️
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
      

    </div>
  );

  const approveQuestion = async (questionId) => {
    try {
      await axios.post(`${API_BASE_URL}/admin/questions/${questionId}/approve`);
      // Refresh questions after approval
      if (selectedQuestionnaire) {
        fetchQuestionnaireQuestions(selectedQuestionnaire._id);
      } else {
        fetchQuestions();
      }
    } catch (error) {
      console.error('Error approving question:', error);
      alert('Failed to approve question. Please try again.');
    }
  };

  const editQuestion = (question) => {
    // For now, show an alert with the question details
    // In a full implementation, this would open an edit modal
    const newText = prompt('Edit question text:', question.question_text);
    if (newText && newText.trim() !== question.question_text) {
      updateQuestion(question._id, newText.trim(), question.question_type, question.options || []);
    }
  };

  const updateQuestion = async (questionId, questionText, questionType, options) => {
    try {
      console.log('Updating question:', { questionId, questionText, questionType, options });
      
      const response = await axios.put(`${API_BASE_URL}/admin/questions/${questionId}`, {
        question_text: questionText,
        question_type: questionType,
        options: options,
        retranslate: true
      });
      
      console.log('Update response:', response.status, response.data);
      
      if (response.status === 200) {
        alert('Question updated successfully!');
        // Refresh questions
        if (selectedQuestionnaire) {
          await fetchQuestionnaireQuestions(selectedQuestionnaire._id);
        } else {
          await fetchQuestions();
        }
      }
    } catch (error) {
      console.error('Error updating question:', error.response?.status, error.response?.data || error.message);
      alert(`Failed to update question: ${error.response?.data?.error || error.message}`);
    }
  };

  const deleteQuestionnaire = async (questionnaire) => {
    if (!confirm(`Are you sure you want to delete the questionnaire "${questionnaire.title}" and ALL its questions?\n\nThis action cannot be undone.`)) {
      return;
    }

    try {
      console.log('Deleting questionnaire:', questionnaire);
      
      // First delete the questionnaire/form
      const response = await axios.delete(`${API_BASE_URL}/forms/${questionnaire._id}`);
      console.log('✅ Questionnaire deleted:', response.status);
      
      // Refresh questionnaires list
      await fetchQuestionnaires();
      alert('Questionnaire deleted successfully!');
      
    } catch (error) {
      console.error('❌ Failed to delete questionnaire:', error);
      
      if (error.response) {
        alert(`Delete failed: ${error.response.status} - ${error.response.data?.error || 'Server error'}`);
      } else if (error.request) {
        alert('Delete failed: No response from server. Check if backend is running.');
      } else {
        alert(`Delete failed: ${error.message}`);
      }
    }
  };

  const deleteQuestion = async (question) => {
    if (!confirm(`Are you sure you want to delete this question in ALL languages?\n\n"${question.question_text}"\n\nThis action cannot be undone.`)) {
      return;
    }

    console.log('Delete initiated for question:', question);
    console.log('All available questions:', questions);
    console.log('API_BASE_URL:', API_BASE_URL);

    try {
      // First, let's try deleting just the single question to test
      console.log(`Testing delete for single question: ${question._id}`);
      
      try {
        const testResponse = await axios.delete(`${API_BASE_URL}/admin/questions/${question._id}`);
        console.log('✅ Single question delete test successful:', testResponse.status, testResponse.data);
        
        // If single delete works, proceed with all language versions
        const questionsToDelete = questions.filter(q => q.questionnaire_id === question.questionnaire_id && q._id !== question._id);
        
        console.log(`Found ${questionsToDelete.length} additional questions to delete with questionnaire_id: ${question.questionnaire_id}`);
        
        let successCount = 1; // Already deleted one
        let failCount = 0;
        
        // Delete remaining questions
        for (const q of questionsToDelete) {
          try {
            console.log(`Deleting question ${q._id} (${q.language}): ${q.question_text}`);
            const response = await axios.delete(`${API_BASE_URL}/admin/questions/${q._id}`);
            console.log(`✅ Successfully deleted question ${q._id}:`, response.status);
            successCount++;
          } catch (error) {
            console.error(`❌ Failed to delete question ${q._id}:`, error.response?.status, error.response?.data || error.message);
            failCount++;
          }
        }
        
        // Refresh questions
        if (selectedQuestionnaire) {
          await fetchQuestionnaireQuestions(selectedQuestionnaire._id);
        } else {
          await fetchQuestions();
        }
        
        if (failCount === 0) {
          alert(`Successfully deleted all ${successCount} questions in all languages`);
        } else {
          alert(`Deleted ${successCount} questions successfully, but ${failCount} failed. Check console for details.`);
        }
        
      } catch (testError) {
        console.error('❌ Single question delete test failed:', testError);
        
        if (testError.response) {
          // Server responded with error status
          console.error('Response status:', testError.response.status);
          console.error('Response data:', testError.response.data);
          alert(`Delete failed: ${testError.response.status} - ${testError.response.data?.error || 'Server error'}`);
        } else if (testError.request) {
          // Request was made but no response received
          console.error('No response received:', testError.request);
          alert('Delete failed: No response from server. Check if backend is running.');
        } else {
          // Something else happened
          console.error('Request setup error:', testError.message);
          alert(`Delete failed: ${testError.message}`);
        }
      }
      
    } catch (error) {
      console.error('Error in deleteQuestion function:', error);
      alert(`Error deleting questions: ${error.message}. Check console for details.`);
    }
  };

  const groupQuestionsByQuestionnaire = (questions) => {
    const grouped = {};
    questions.forEach(question => {
      const qid = question.questionnaire_id;
      if (!grouped[qid]) {
        grouped[qid] = [];
      }
      grouped[qid].push(question);
    });
    return grouped;
  };

  const QuestionsPanel = () => {
    const groupedQuestions = groupQuestionsByQuestionnaire(questions);
    
    return (
      <div className="panel">
        <div className="panel-header">
          <h1>Questions Management</h1>
          <p>Review and approve questions grouped by translations</p>
        </div>

        <div className="search-bar">
          <input type="text" placeholder="Search questions..." />
          <select>
            <option>All Status</option>
            <option>Approved</option>
            <option>Pending</option>
            <option>Rejected</option>
          </select>
        </div>

        {loading ? (
          <div className="loading">Loading...</div>
        ) : (
          <div className="question-groups">
            {Object.entries(groupedQuestions).map(([qid, questionGroup]) => (
              <div key={qid} className="question-group-card">
                <div className="question-group-header">
                  <h3>Question Group</h3>
                  <span className="group-id">ID: {qid}</span>
                </div>
                
                <div className="translations-container">
                  {questionGroup.map((question) => (
                    <div key={question._id} className="translation-card">
                      <div className="translation-header">
                        <div className="language-info">
                          <span className="language-badge">{question.language.toUpperCase()}</span>
                          <span className={`status-badge ${question.status}`}>
                            {question.status}
                          </span>
                        </div>
                        <span className={`type-badge ${question.question_type}`}>
                          {question.question_type}
                        </span>
                      </div>
                      
                      <div className="translation-content">
                        <p className="question-text">{question.question_text}</p>
                        
                        {question.options && question.options.length > 0 && (
                          <div className="question-options">
                            <span className="options-label">Options:</span>
                            <div className="options-list">
                              {question.options.map((option, idx) => (
                                <span key={idx} className="option-tag">{option}</span>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                      
                      <div className="translation-actions">
                        {question.status !== 'approved' && (
                          <button 
                            className="btn-approve"
                            onClick={() => approveQuestion(question._id)}
                          >
                            ✓ Approve
                          </button>
                        )}
                        <button 
                          className="btn-icon"
                          onClick={() => editQuestion(question)}
                          title="Edit Question"
                        >
                          ✏️
                        </button>
                        <button 
                          className="btn-icon delete"
                          onClick={() => deleteQuestion(question)}
                          title="Delete Question"
                        >
                          🗑️
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  };

  const renderPanel = () => {
    switch (activePanel) {
      case 'users':
        return <UsersPanel />;
      case 'questionnaires':
        if (showCreateForm) {
          return <CreateQuestionnaireForm />;
        } else if (selectedQuestionnaire) {
          return <QuestionnaireDetails />;
        } else {
          return <QuestionnairesPanel />;
        }
      case 'settings':
        return (
          <div className="panel center">
            <div className="coming-soon">
              <div className="coming-soon-icon">⚙️</div>
              <h2>Settings Panel</h2>
              <p>Configuration options coming soon...</p>
            </div>
          </div>
        );
      case 'analytics':
        return (
          <div className="panel center">
            <div className="coming-soon">
              <div className="coming-soon-icon">📊</div>
              <h2>Analytics Panel</h2>
              <p>Data insights and reports coming soon...</p>
            </div>
          </div>
        );
      default:
        return <UsersPanel />;
    }
  };

  return (
    <div className="admin-container">
      <header className="admin-header">
        <div className="header-content">
          <div className="header-left">
            <button 
              className="burger-menu"
              onClick={() => setSidebarOpen(!sidebarOpen)}
            >
              {sidebarOpen ? '✕' : '☰'}
            </button>
            <h1>Admin Dashboard</h1>
          </div>
          <div className="user-avatar">A</div>
        </div>
      </header>

      <div className="admin-body">
        <aside className={`sidebar ${sidebarOpen ? 'open' : ''}`}>
          <nav className="sidebar-nav">
            {menuItems.map((item) => (
              <button
                key={item.id}
                onClick={() => {
                  setActivePanel(item.id);
                  setSidebarOpen(false);
                }}
                className={`nav-item ${activePanel === item.id ? 'active' : ''}`}
              >
                <span className="nav-icon">{item.icon}</span>
                {item.label}
              </button>
            ))}
          </nav>
        </aside>

        {sidebarOpen && <div className="overlay" onClick={() => setSidebarOpen(false)} />}

        <main className="main-content">
          {renderPanel()}
        </main>
      </div>
    </div>
  );
}

export default AdminNew;