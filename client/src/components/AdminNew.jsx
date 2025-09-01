import React, { useState, useEffect } from 'react';
import axios from 'axios';
import Admin from './Admin';
import './AdminNew.css';

const API_BASE_URL = 'http://localhost:3001/api';

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

  const menuItems = [
    { id: 'users', label: 'Users', icon: '👥' },
    { id: 'questionnaires', label: 'Questionnaires', icon: '📋' },
    { id: 'settings', label: 'Settings', icon: '⚙️' },
    { id: 'analytics', label: 'Analytics', icon: '📊' }
  ];

  useEffect(() => {
    if (activePanel === 'questionnaires') {
      fetchQuestionnaires();
    } else if (activePanel === 'questions') {
      fetchQuestions();
    } else if (activePanel === 'users') {
      fetchUsers();
    }
  }, [activePanel]);

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
            onClick={() => setShowCreateForm(false)}
          >
            ← Back to Questionnaires
          </button>
          <h1>Create New Questionnaire</h1>
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

  const QuestionnaireDetails = () => {
    const groupedQuestions = groupQuestionsByQuestionnaire(questionnaireQuestions);
    
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
                          <button className="btn-icon">✏️</button>
                          <button className="btn-icon delete">🗑️</button>
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
                  <button className="btn-icon">✏️</button>
                  <button className="btn-icon delete">🗑️</button>
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
      }
    } catch (error) {
      console.error('Error approving question:', error);
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
                        <button className="btn-icon">✏️</button>
                        <button className="btn-icon delete">🗑️</button>
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
        return selectedQuestionnaire ? <QuestionnaireDetails /> : showCreateForm ? <CreateQuestionnaireForm /> : <QuestionnairesPanel />;
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