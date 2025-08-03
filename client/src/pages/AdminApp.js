import React, { useState, useEffect } from 'react';
import SessionCreator from '../components/SessionCreator';
import SessionDashboard from '../components/SessionDashboard';
// Added delete functionality

const AdminApp = () => {
  const [sessions, setSessions] = useState([]);
  const [activeSession, setActiveSession] = useState(null);
  const [view, setView] = useState('list'); // list, create, dashboard

  useEffect(() => {
    fetchSessions();
  }, []);

  const fetchSessions = async () => {
    try {
      const response = await fetch('/api/sessions');
      const data = await response.json();
      setSessions(data);
    } catch (error) {
      console.error('Error fetching sessions:', error);
    }
  };

  const createSession = async (sessionData) => {
    try {
      const response = await fetch('/api/sessions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(sessionData),
      });
      const data = await response.json();
      setActiveSession(data.session);
      setView('dashboard');
      fetchSessions();
    } catch (error) {
      console.error('Error creating session:', error);
    }
  };

  const selectSession = async (session) => {
    try {
      const response = await fetch(`/api/sessions/${session.id}`);
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const fullSessionData = await response.json();
      console.log('Fetched session data:', fullSessionData);
      
      // Validate the session data structure
      if (!fullSessionData || !fullSessionData.questions || !Array.isArray(fullSessionData.questions)) {
        console.error('Invalid session data structure:', fullSessionData);
        alert('Error: Invalid session data. Please try refreshing the page.');
        return;
      }
      
      setActiveSession(fullSessionData);
      setView('dashboard');
    } catch (error) {
      console.error('Error fetching session details:', error);
      alert('Error loading session. Please try again.');
    }
  };

  const deleteSession = async (sessionId, sessionName) => {
    if (!window.confirm(`Are you sure you want to delete the session "${sessionName}"? This action cannot be undone.`)) {
      return;
    }

    try {
      const response = await fetch(`/api/sessions/${sessionId}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      // Refresh the sessions list
      await fetchSessions();
      alert('Session deleted successfully');
    } catch (error) {
      console.error('Error deleting session:', error);
      alert('Error deleting session. Please try again.');
    }
  };

  const renderSessionList = () => (
    <div className="container">
      <div className="admin-header">
        <h1>Quizzler Admin Dashboard</h1>
        <p>Create and manage interactive quiz sessions for your classroom</p>
      </div>

      <div className="admin-controls">
        <button
          className="btn btn-primary"
          onClick={() => setView('create')}
        >
          Create New Session
        </button>
        <button
          className="btn btn-secondary"
          onClick={fetchSessions}
        >
          Refresh Sessions
        </button>
      </div>

      <div className="card">
        <h2>Existing Sessions</h2>
        {sessions.length === 0 ? (
          <p>No sessions created yet. Create your first session to get started!</p>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th style={{ padding: '12px', textAlign: 'left', borderBottom: '2px solid #dee2e6' }}>Name</th>
                  <th style={{ padding: '12px', textAlign: 'left', borderBottom: '2px solid #dee2e6' }}>Status</th>
                  <th style={{ padding: '12px', textAlign: 'left', borderBottom: '2px solid #dee2e6' }}>Questions</th>
                  <th style={{ padding: '12px', textAlign: 'left', borderBottom: '2px solid #dee2e6' }}>Created</th>
                  <th style={{ padding: '12px', textAlign: 'left', borderBottom: '2px solid #dee2e6' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {sessions.map((session) => (
                  <tr key={session.id}>
                    <td style={{ padding: '12px', borderBottom: '1px solid #dee2e6' }}>{session.name}</td>
                    <td style={{ padding: '12px', borderBottom: '1px solid #dee2e6' }}>
                      <span className={`status-badge ${session.status}`}>
                        {session.status.charAt(0).toUpperCase() + session.status.slice(1)}
                      </span>
                    </td>
                    <td style={{ padding: '12px', borderBottom: '1px solid #dee2e6' }}>{session.questionsCount}</td>
                    <td style={{ padding: '12px', borderBottom: '1px solid #dee2e6' }}>
                      {new Date(session.createdAt).toLocaleDateString()}
                    </td>
                    <td style={{ padding: '12px', borderBottom: '1px solid #dee2e6' }}>
                      <div style={{ display: 'flex', gap: '8px' }}>
                        <button
                          className="btn btn-primary"
                          style={{ padding: '8px 16px', fontSize: '14px' }}
                          onClick={() => selectSession(session)}
                        >
                          Manage
                        </button>
                        <button
                          className="btn btn-danger"
                          style={{ padding: '8px 16px', fontSize: '14px', backgroundColor: '#dc3545', border: '1px solid #dc3545' }}
                          onClick={() => deleteSession(session.id, session.name)}
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );

  const renderCreateSession = () => (
    <div className="container">
      <div className="admin-header">
        <h1>Create New Quiz Session</h1>
        <button
          className="btn btn-secondary"
          onClick={() => setView('list')}
        >
          Back to Sessions
        </button>
      </div>
      <SessionCreator onCreateSession={createSession} />
    </div>
  );

  const renderDashboard = () => {
    if (!activeSession) {
      return (
        <div className="container">
          <div className="admin-header">
            <h1>Loading...</h1>
            <button className="btn btn-secondary" onClick={() => setView('list')}>
              Back to Sessions
            </button>
          </div>
        </div>
      );
    }

    return (
      <SessionDashboard 
        session={activeSession}
        onBack={() => setView('list')}
        onUpdateSession={setActiveSession}
      />
    );
  };

  switch (view) {
    case 'create':
      return renderCreateSession();
    case 'dashboard':
      return renderDashboard();
    default:
      return renderSessionList();
  }
};

export default AdminApp;