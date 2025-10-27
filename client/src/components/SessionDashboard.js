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

  const goBackRound = async () => {
    if (!session?.id) return;
    try {
      const response = await fetch(`/api/sessions/${session.id}/back-round`, {
        method: 'POST',
      });
      const data = await response.json();
      
      if (response.ok) {
        onUpdateSession({ ...session, currentRound: data.currentRound });
      } else {
        alert(data.error || 'Cannot go back further');
      }
    } catch (error) {
      console.error('Error going back round:', error);
    }
  };

  const goBackQuestion = async () => {
    if (!session?.id) return;
    try {
      const response = await fetch(`/api/sessions/${session.id}/back-question`, {
        method: 'POST',
      });
      const data = await response.json();
      
      if (response.ok) {
        onUpdateSession({ 
          ...session, 
          currentQuestionIndex: data.currentQuestionIndex,
          currentRound: 1 
        });
      } else {
        alert(data.error || 'Cannot go back further');
      }
    } catch (error) {
      console.error('Error going back question:', error);
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
      return {};
    }
    
    const currentResponses = getCurrentQuestionResponses();
    const currentQuestionIndex = session.currentQuestionIndex || 0;
    
    if (currentQuestionIndex < 0 || currentQuestionIndex >= session.questions.length) {
      return {};
    }
    
    const currentQuestion = session.questions[currentQuestionIndex];
    
    if (!currentQuestion) {
      return {};
    }

    // Handle pure freetext questions
    if (currentQuestion.isFreetext) {
      return { freetextResponses: currentResponses };
    }

    if (!currentQuestion.answerOptions || !Array.isArray(currentQuestion.answerOptions)) {
      return {};
    }

    const counts = {};
    const otherResponses = [];
    
    try {
      // Count regular multiple choice responses
      currentQuestion.answerOptions.forEach((_, index) => {
        counts[index] = currentResponses.filter(r => !r.isOtherOption && r.selectedAnswer === index).length;
      });
      
      // Collect "Other" responses if hasFreetextOption is enabled
      if (currentQuestion.hasFreetextOption) {
        currentResponses.forEach(response => {
          if (response.isOtherOption) {
            otherResponses.push(response);
          }
        });
        counts.other = otherResponses.length;
        counts.otherResponses = otherResponses;
      }
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
              <>
                <button
                  className="btn btn-primary"
                  onClick={nextRound}
                >
                  Start Round 2 (Group Discussion)
                </button>
                {(session.currentQuestionIndex || 0) > 0 && (
                  <button
                    className="btn btn-secondary"
                    onClick={goBackQuestion}
                    style={{ marginLeft: '8px' }}
                  >
                    ← Back to Previous Question
                  </button>
                )}
              </>
            )}
            
            {session.status === 'active' && session.currentRound === 2 && (
              <>
                <button
                  className="btn btn-warning"
                  onClick={revealAnswer}
                >
                  Reveal Correct Answer
                </button>
                <button
                  className="btn btn-secondary"
                  onClick={goBackRound}
                  style={{ marginLeft: '8px' }}
                >
                  ← Back to Round 1
                </button>
              </>
            )}
            
            {session.status === 'active' && session.currentRound === 3 && (
              <>
                <button
                  className="btn btn-primary"
                  onClick={nextQuestion}
                >
                  {currentQuestionIndex + 1 < session.questions.length
                    ? 'Next Question' 
                    : 'Complete Session'
                  }
                </button>
                <button
                  className="btn btn-secondary"
                  onClick={goBackRound}
                  style={{ marginLeft: '8px' }}
                >
                  ← Back to Round 2
                </button>
              </>
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

      {session.status === 'active' && currentQuestion && (
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
            {currentQuestion.isFreetext ? (
              <div>
                <h4 style={{ marginBottom: '16px' }}>Text Responses:</h4>
                {responseCounts.freetextResponses && responseCounts.freetextResponses.length > 0 ? (
                  <div style={{ maxHeight: '400px', overflowY: 'auto' }}>
                    {responseCounts.freetextResponses.map((response, index) => (
                      <div key={index} style={{
                        background: '#f8f9fa',
                        padding: '12px 16px',
                        margin: '8px 0',
                        borderRadius: '8px',
                        borderLeft: '4px solid #007bff'
                      }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '4px' }}>
                          <span style={{ fontSize: '12px', color: '#666', fontWeight: '600' }}>
                            Device {response.deviceId.substring(7, 12)} - Player {response.playerNumber}
                          </span>
                          <span style={{ fontSize: '12px', color: '#666' }}>
                            {new Date(response.submittedAt).toLocaleTimeString()}
                          </span>
                        </div>
                        <p style={{ margin: '0', fontStyle: 'italic', wordWrap: 'break-word' }}>
                          "{response.selectedAnswer}"
                        </p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p style={{ color: '#666', fontStyle: 'italic', textAlign: 'center', padding: '20px' }}>
                    No text responses submitted yet.
                  </p>
                )}
              </div>
            ) : (
              <div>
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
                
                {currentQuestion.hasFreetextOption && (
                  <div>
                    <div style={{ marginBottom: '16px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                        <span>Other (specify)</span>
                        <span>{(responseCounts && responseCounts.other) || 0} ({participantCount > 0 ? (((responseCounts && responseCounts.other) || 0) / participantCount * 100).toFixed(1) : 0}%)</span>
                      </div>
                      <div style={{ 
                        width: '100%', 
                        height: '20px', 
                        backgroundColor: '#e9ecef', 
                        borderRadius: '4px',
                        overflow: 'hidden'
                      }}>
                        <div style={{
                          width: `${participantCount > 0 ? (((responseCounts && responseCounts.other) || 0) / participantCount * 100).toFixed(1) : 0}%`,
                          height: '100%',
                          backgroundColor: '#28a745',
                          transition: 'width 0.3s ease'
                        }} />
                      </div>
                    </div>
                    
                    {responseCounts && responseCounts.otherResponses && responseCounts.otherResponses.length > 0 && (
                      <div style={{ marginTop: '20px' }}>
                        <h4 style={{ marginBottom: '12px', fontSize: '16px' }}>Custom Responses:</h4>
                        <div style={{ maxHeight: '200px', overflowY: 'auto' }}>
                          {responseCounts.otherResponses.map((response, index) => (
                            <div key={index} style={{
                              background: '#f8f9fa',
                              padding: '8px 12px',
                              margin: '4px 0',
                              borderRadius: '6px',
                              borderLeft: '4px solid #28a745'
                            }}>
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '2px' }}>
                                <span style={{ fontSize: '12px', color: '#666', fontWeight: '600' }}>
                                  Device {response.deviceId.substring(7, 12)} - Player {response.playerNumber}
                                </span>
                                <span style={{ fontSize: '12px', color: '#666' }}>
                                  {new Date(response.submittedAt).toLocaleTimeString()}
                                </span>
                              </div>
                              <p style={{ margin: '0', fontStyle: 'italic', wordWrap: 'break-word', fontSize: '14px' }}>
                                "{response.selectedAnswer}"
                              </p>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
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
                <th style={{ padding: '12px', textAlign: 'left', borderBottom: '2px solid #dee2e6' }}>Type</th>
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
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      <span style={{
                        backgroundColor: question.isFreetext ? '#e7f3ff' : '#f0f9ff',
                        color: question.isFreetext ? '#0066cc' : '#0078d4',
                        padding: '2px 8px',
                        borderRadius: '4px',
                        fontSize: '12px',
                        fontWeight: '600',
                        width: 'fit-content'
                      }}>
                        {question.isFreetext ? 'Free Text' : 'Multiple Choice'}
                      </span>
                      {!question.isFreetext && question.hasFreetextOption && (
                        <span style={{
                          backgroundColor: '#e7f3ff',
                          color: '#0066cc',
                          padding: '2px 8px',
                          borderRadius: '4px',
                          fontSize: '12px',
                          fontWeight: '600',
                          width: 'fit-content'
                        }}>
                          + Other Option
                        </span>
                      )}
                    </div>
                  </td>
                  <td style={{ padding: '12px', borderBottom: '1px solid #dee2e6' }}>
                    {question.isFreetext 
                      ? 'Open text response'
                      : (question.answerOptions && Array.isArray(question.answerOptions) 
                          ? question.answerOptions.join(', ') + (question.hasFreetextOption ? ', Other (specify)' : '')
                          : 'No answer options')
                    }
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