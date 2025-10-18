import React, { useState, useEffect } from 'react';
import io from 'socket.io-client';

const SessionDashboard = ({ session, onBack, onUpdateSession }) => {
  const [socket, setSocket] = useState(null);
  const [responses, setResponses] = useState([]);
  const [qrCode, setQrCode] = useState('');
  const [studentUrl, setStudentUrl] = useState('');

  useEffect(() => {
    if (!session) return;

    const newSocket = io();
    setSocket(newSocket);

    newSocket.emit('joinAdminSession', session.id);

    newSocket.on('newResponse', (response) => {
      setResponses(prev => [...prev, response]);
    });

    fetchQRCode();
    fetchResponses();

    return () => newSocket.close();
  }, [session]);

  const fetchQRCode = async () => {
    if (!session?.id) return;
    try {
      const response = await fetch(`/api/sessions/${session.id}/qr`);
      const data = await response.json();
      setQrCode(data.qrCode);
      setStudentUrl(data.url);
    } catch (error) {
      console.error('Error fetching QR code:', error);
    }
  };

  const fetchResponses = async () => {
    if (!session?.id) return;
    try {
      const response = await fetch(`/api/sessions/${session.id}/results`);
      const data = await response.json();
      setResponses(data);
    } catch (error) {
      console.error('Error fetching responses:', error);
    }
  };

  const startSession = async () => {
    if (!session?.id) return;
    try {
      await fetch(`/api/sessions/${session.id}/start`, {
        method: 'POST',
      });
      onUpdateSession({ ...session, status: 'active', currentQuestionIndex: 0 });
    } catch (error) {
      console.error('Error starting session:', error);
    }
  };

  const nextQuestion = async () => {
    if (!session?.id) return;
    try {
      const response = await fetch(`/api/sessions/${session.id}/next-question`, {
        method: 'POST',
      });
      const data = await response.json();
      
      if (data.completed) {
        onUpdateSession({ ...session, status: 'completed' });
      } else {
        const newQuestionIndex = (session.currentQuestionIndex || 0) + 1;
        onUpdateSession({ 
          ...session, 
          currentQuestionIndex: newQuestionIndex,
          currentRound: 1 
        });
      }
    } catch (error) {
      console.error('Error advancing question:', error);
    }
  };

  const nextRound = async () => {
    if (!session?.id) return;
    try {
      await fetch(`/api/sessions/${session.id}/next-round`, {
        method: 'POST',
      });
      onUpdateSession({ ...session, currentRound: 2 });
    } catch (error) {
      console.error('Error advancing round:', error);
    }
  };

  const revealAnswer = async () => {
    if (!session?.id) return;
    try {
      await fetch(`/api/sessions/${session.id}/reveal-answer`, {
        method: 'POST',
      });
      onUpdateSession({ ...session, currentRound: 3 });
    } catch (error) {
      console.error('Error revealing answer:', error);
    }
  };

  const getCurrentQuestionResponses = () => {
    if (!session || !session.questions || !Array.isArray(session.questions)) return [];
    return responses.filter(r => 
      r.questionIndex === (session.currentQuestionIndex || 0) && 
      r.round === (session.currentRound || 1)
    );
  };

  const getResponseCounts = () => {
    if (!session || !session.questions || !Array.isArray(session.questions)) {
      console.log('getResponseCounts: session or questions invalid');
      return {};
    }
    
    const currentResponses = getCurrentQuestionResponses();
    const currentQuestionIndex = session.currentQuestionIndex || 0;
    
    // Check if currentQuestionIndex is within bounds
    if (currentQuestionIndex < 0 || currentQuestionIndex >= session.questions.length) {
      console.log('getResponseCounts: currentQuestionIndex out of bounds', currentQuestionIndex, session.questions.length);
      return {};
    }
    
    const currentQuestion = session.questions[currentQuestionIndex];
    
    if (!currentQuestion || !currentQuestion.answerOptions || !Array.isArray(currentQuestion.answerOptions)) {
      console.log('getResponseCounts: currentQuestion or answerOptions invalid', currentQuestion);
      return {};
    }

    const counts = {};
    try {
      currentQuestion.answerOptions.forEach((_, index) => {
        counts[index] = currentResponses.filter(r => r.selectedAnswer === index).length;
      });
    } catch (error) {
      console.error('getResponseCounts: Error in forEach', error);
      return {};
    }

    return counts;
  };

  const getUniqueParticipants = () => {
    const currentResponses = getCurrentQuestionResponses();
    return new Set(currentResponses.map(r => `${r.deviceId}-${r.playerNumber}`)).size;
  };

  if (!session || !session.questions || !Array.isArray(session.questions)) {
    return <div>Loading session data...</div>;
  }

  const currentQuestionIndex = session.currentQuestionIndex || 0;
  const currentQuestion = (currentQuestionIndex >= 0 && currentQuestionIndex < session.questions.length) 
    ? session.questions[currentQuestionIndex] 
    : null;
  const responseCounts = getResponseCounts();
  const participantCount = getUniqueParticipants();

  return (
    <div className="container">
      <div className="admin-header">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h1>{session.name}</h1>
            <p>Status: <strong>{session.status}</strong></p>
            {currentQuestionIndex >= 0 && session.questions && (
              <p>
                Question {currentQuestionIndex + 1} of {session.questions.length} | 
                Round {session.currentRound || 1}
              </p>
            )}
          </div>
          <button className="btn btn-secondary" onClick={onBack}>
            Back to Sessions
          </button>
        </div>
      </div>

      <div className="admin-grid">
        <div className="card">
          <h3>Session Controls</h3>
          <div className="admin-controls">
            {session.status === 'waiting' && (
              <button
                className="btn btn-success"
                onClick={startSession}
              >
                Start Session
              </button>
            )}
            
            {session.status === 'active' && session.currentRound === 1 && (
              <button
                className="btn btn-primary"
                onClick={nextRound}
              >
                Start Round 2 (Group Discussion)
              </button>
            )}
            
            {session.status === 'active' && session.currentRound === 2 && (
              <button
                className="btn btn-warning"
                onClick={revealAnswer}
              >
                Reveal Correct Answer
              </button>
            )}
            
            {session.status === 'active' && session.currentRound === 3 && (
              <button
                className="btn btn-primary"
                onClick={nextQuestion}
              >
                {currentQuestionIndex + 1 < session.questions.length
                  ? 'Next Question' 
                  : 'Complete Session'
                }
              </button>
            )}
          </div>

          {session.status === 'active' && currentQuestion && currentQuestion.answerOptions && (
            <div style={{ marginTop: '20px' }}>
              <h4>Current Question:</h4>
              <p style={{ fontSize: '18px', fontWeight: '600' }}>
                {currentQuestion.questionText}
              </p>
              <div style={{ marginTop: '16px' }}>
                <strong>Answer Options:</strong>
                <ul style={{ marginTop: '8px', paddingLeft: '20px' }}>
                  {currentQuestion.answerOptions.map((option, index) => (
                    <li key={index} style={{
                      backgroundColor: session.currentRound === 3 && currentQuestion.correctAnswer === index ? '#28a745' : 'transparent',
                      color: session.currentRound === 3 && currentQuestion.correctAnswer === index ? 'white' : 'inherit',
                      padding: session.currentRound === 3 && currentQuestion.correctAnswer === index ? '4px 8px' : '0',
                      borderRadius: session.currentRound === 3 && currentQuestion.correctAnswer === index ? '4px' : '0',
                      fontWeight: session.currentRound === 3 && currentQuestion.correctAnswer === index ? 'bold' : 'normal'
                    }}>
                      {option}
                      {session.currentRound === 3 && currentQuestion.correctAnswer === index && ' ✓'}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          )}
        </div>

        <div className="card qr-container">
          <h3>Student Access</h3>
          {qrCode && (
            <>
              <img src={qrCode} alt="QR Code" className="qr-code" />
              <p style={{ fontSize: '14px', wordBreak: 'break-all' }}>
                {studentUrl}
              </p>
              <p style={{ fontSize: '12px', color: '#666' }}>
                Students scan this QR code to join the quiz
              </p>
            </>
          )}
        </div>
      </div>

      {session.status === 'active' && currentQuestion && currentQuestion.answerOptions && (
        <div className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
            <h3>Live Results</h3>
            <button 
              className="btn btn-secondary" 
              onClick={fetchResponses}
              style={{ fontSize: '14px', padding: '8px 16px' }}
            >
              Refresh
            </button>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '20px' }}>
            <p><strong>Participants:</strong> {participantCount}</p>
            <p><strong>Round:</strong> {
              (session.currentRound || 1) === 1 ? 'Individual' : 
              (session.currentRound || 1) === 2 ? 'Group Discussion' : 
              'Answer Revealed'
            }</p>
          </div>

          <div className="results-chart">
            {currentQuestion.answerOptions && currentQuestion.answerOptions.map((option, index) => {
              const count = (responseCounts && responseCounts[index]) || 0;
              const percentage = participantCount > 0 ? (count / participantCount * 100).toFixed(1) : 0;
              
              return (
                <div key={index} style={{ marginBottom: '16px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                    <span>{option}</span>
                    <span>{count} ({percentage}%)</span>
                  </div>
                  <div style={{ 
                    width: '100%', 
                    height: '20px', 
                    backgroundColor: '#e9ecef', 
                    borderRadius: '4px',
                    overflow: 'hidden'
                  }}>
                    <div style={{
                      width: `${percentage}%`,
                      height: '100%',
                      backgroundColor: '#007bff',
                      transition: 'width 0.3s ease'
                    }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className="card">
        <h3>All Questions</h3>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={{ padding: '12px', textAlign: 'left', borderBottom: '2px solid #dee2e6' }}>#</th>
                <th style={{ padding: '12px', textAlign: 'left', borderBottom: '2px solid #dee2e6' }}>Question</th>
                <th style={{ padding: '12px', textAlign: 'left', borderBottom: '2px solid #dee2e6' }}>Answer Options</th>
                <th style={{ padding: '12px', textAlign: 'left', borderBottom: '2px solid #dee2e6' }}>Status</th>
              </tr>
            </thead>
            <tbody>
              {session.questions.map((question, index) => (
                <tr key={index}>
                  <td style={{ padding: '12px', borderBottom: '1px solid #dee2e6' }}>
                    {index + 1}
                  </td>
                  <td style={{ padding: '12px', borderBottom: '1px solid #dee2e6' }}>
                    {question.questionText || 'No question text'}
                  </td>
                  <td style={{ padding: '12px', borderBottom: '1px solid #dee2e6' }}>
                    {question.answerOptions && Array.isArray(question.answerOptions) 
                      ? question.answerOptions.join(', ') 
                      : 'No answer options'}
                  </td>
                  <td style={{ padding: '12px', borderBottom: '1px solid #dee2e6' }}>
                    {index < currentQuestionIndex ? 'Completed' : 
                     index === currentQuestionIndex ? 'Active' : 'Pending'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default SessionDashboard;