import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import io from 'socket.io-client';

const StudentApp = () => {
  const { sessionId } = useParams();
  const [socket, setSocket] = useState(null);
  const [deviceId] = useState(() => localStorage.getItem('deviceId') || (() => {
    const id = 'device_' + Math.random().toString(36).substr(2, 9);
    localStorage.setItem('deviceId', id);
    return id;
  })());
  
  const [gameState, setGameState] = useState({
    phase: 'setup', // setup, waiting, answering, submitted, answer-revealed
    playerCount: 1,
    currentPlayer: 1,
    session: null,
    currentQuestion: null,
    currentQuestionIndex: -1,
    currentRound: 1,
    correctAnswer: null,
    answers: {}, // stores answers for both players
    freetextInputs: {} // stores custom text for "Other" options
  });

  useEffect(() => {
    const newSocket = io();
    setSocket(newSocket);

    newSocket.emit('joinSession', sessionId);

    newSocket.on('sessionJoined', (data) => {
      setGameState(prev => ({
        ...prev,
        session: data,
        currentQuestion: data.currentQuestion,
        currentQuestionIndex: data.currentQuestionIndex,
        currentRound: data.currentRound,
        phase: data.status === 'active' && data.currentQuestion ? 'answering' : 'waiting'
      }));
    });

    newSocket.on('sessionStarted', (data) => {
      setGameState(prev => ({
        ...prev,
        currentQuestion: data.question,
        currentQuestionIndex: data.questionIndex,
        currentRound: data.round,
        phase: 'answering',
        answers: {},
        freetextInputs: {}
      }));
    });

    newSocket.on('nextQuestion', (data) => {
      setGameState(prev => ({
        ...prev,
        currentQuestion: data.question,
        currentQuestionIndex: data.questionIndex,
        currentRound: data.round,
        phase: 'answering',
        correctAnswer: null,
        answers: {},
        freetextInputs: {}
      }));
    });

    newSocket.on('nextRound', (data) => {
      setGameState(prev => ({
        ...prev,
        currentRound: data.round,
        phase: 'answering'
      }));
    });

    newSocket.on('revealAnswer', (data) => {
      setGameState(prev => ({
        ...prev,
        currentRound: data.round,
        correctAnswer: data.correctAnswer,
        isFreetext: data.isFreetext,
        freetextResponses: data.freetextResponses,
        otherResponses: data.otherResponses,
        phase: 'answer-revealed'
      }));
    });

    newSocket.on('sessionCompleted', () => {
      setGameState(prev => ({
        ...prev,
        phase: 'completed'
      }));
    });

    return () => newSocket.close();
  }, [sessionId]);

  const selectPlayerCount = (count) => {
    setGameState(prev => ({
      ...prev,
      playerCount: count,
      phase: 'waiting'
    }));
  };

  const switchPlayer = (playerNumber) => {
    setGameState(prev => ({
      ...prev,
      currentPlayer: playerNumber
    }));
  };

  const selectAnswer = (answerIndex) => {
    const { currentPlayer, currentQuestionIndex, currentRound } = gameState;
    const answerKey = `player${currentPlayer}_q${currentQuestionIndex}_r${currentRound}`;
    
    setGameState(prev => ({
      ...prev,
      answers: {
        ...prev.answers,
        [answerKey]: answerIndex
      }
    }));
  };

  const updateFreetextInput = (text) => {
    const { currentPlayer, currentQuestionIndex, currentRound } = gameState;
    const inputKey = `player${currentPlayer}_q${currentQuestionIndex}_r${currentRound}`;
    
    setGameState(prev => ({
      ...prev,
      freetextInputs: {
        ...prev.freetextInputs,
        [inputKey]: text
      }
    }));
  };

  const submitAnswer = async () => {
    const { currentPlayer, currentQuestionIndex, currentRound, answers, freetextInputs, currentQuestion } = gameState;
    const answerKey = `player${currentPlayer}_q${currentQuestionIndex}_r${currentRound}`;
    const inputKey = `player${currentPlayer}_q${currentQuestionIndex}_r${currentRound}`;
    const selectedAnswer = answers[answerKey];

    if (selectedAnswer === undefined || selectedAnswer === '') return;

    // For "Other" option, check if custom text is provided
    const isOtherOption = currentQuestion?.hasFreetextOption && selectedAnswer === currentQuestion.answerOptions.length;
    if (isOtherOption) {
      const customText = freetextInputs[inputKey];
      if (!customText || customText.trim() === '') return;
    }

    try {
      await fetch(`/api/sessions/${sessionId}/submit`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          deviceId,
          playerNumber: currentPlayer,
          questionIndex: currentQuestionIndex,
          round: currentRound,
          selectedAnswer: isOtherOption ? freetextInputs[inputKey] : selectedAnswer,
          isOtherOption: isOtherOption
        }),
      });

      setGameState(prev => ({
        ...prev,
        phase: 'submitted'
      }));
    } catch (error) {
      console.error('Error submitting answer:', error);
    }
  };

  const getCurrentAnswer = () => {
    const { currentPlayer, currentQuestionIndex, currentRound, answers } = gameState;
    const answerKey = `player${currentPlayer}_q${currentQuestionIndex}_r${currentRound}`;
    return answers[answerKey];
  };

  const renderSetup = () => (
    <div className="student-container">
      <div className="card">
        <h1 style={{ textAlign: 'center', marginBottom: '24px' }}>Welcome to Quizzler!</h1>
        <p style={{ textAlign: 'center', marginBottom: '32px', fontSize: '16px' }}>
          How many players will be using this device?
        </p>
        <div className="player-selector">
          <button 
            className="btn btn-large btn-block btn-primary"
            onClick={() => selectPlayerCount(1)}
          >
            1 Player
          </button>
          <button 
            className="btn btn-large btn-block btn-primary"
            onClick={() => selectPlayerCount(2)}
          >
            2 Players
          </button>
        </div>
      </div>
    </div>
  );

  const renderWaiting = () => (
    <div className="student-container">
      <div className="card">
        <div className="waiting-message">
          <h2>Waiting for quiz to start...</h2>
          <p>Your teacher will begin the quiz shortly.</p>
          {gameState.playerCount === 2 && (
            <div style={{ marginTop: '20px' }}>
              <p><strong>2 Player Mode Active</strong></p>
              <p>You'll be able to switch between players during the quiz.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );

  const renderAnswering = () => {
    const { currentQuestion, currentRound, playerCount, currentPlayer } = gameState;
    const currentAnswer = getCurrentAnswer();

    return (
      <div className="student-container">
        <div className="card">
          <div className={`round-indicator ${currentRound === 1 ? 'round-1' : 'round-2'}`}>
            {currentRound === 1 ? 'Round 1: Individual Answer' : 'Round 2: Group Answer'}
          </div>

          {playerCount === 2 && (
            <div className="player-selector">
              <button 
                className={`btn player-toggle ${currentPlayer === 1 ? 'active' : ''}`}
                onClick={() => switchPlayer(1)}
              >
                Player 1
              </button>
              <button 
                className={`btn player-toggle ${currentPlayer === 2 ? 'active' : ''}`}
                onClick={() => switchPlayer(2)}
              >
                Player 2
              </button>
            </div>
          )}

          <div className="question-text">
            {currentQuestion?.questionText}
          </div>
          
          <div style={{ background: 'red', color: 'white', padding: '10px', margin: '10px 0' }}>
            🔴 REACT UPDATE TEST - If you see this, React is updating
          </div>
          
          {/* Debug info - remove after fixing */}
          <div style={{ fontSize: '12px', color: '#666', margin: '8px 0', padding: '8px', background: '#f0f0f0' }}>
            Debug: hasFreetextOption = {String(currentQuestion?.hasFreetextOption)}, 
            isFreetext = {String(currentQuestion?.isFreetext)}
            <br/>Question data: {JSON.stringify(currentQuestion, null, 2)}
          </div>

          {currentQuestion?.isFreetext ? (
            <div className="answer-options">
              <textarea
                className="form-input form-textarea"
                value={currentAnswer || ''}
                onChange={(e) => {
                  const { currentPlayer, currentQuestionIndex, currentRound } = gameState;
                  const answerKey = `player${currentPlayer}_q${currentQuestionIndex}_r${currentRound}`;
                  setGameState(prev => ({
                    ...prev,
                    answers: {
                      ...prev.answers,
                      [answerKey]: e.target.value
                    }
                  }));
                }}
                placeholder="Enter your answer here..."
                style={{
                  width: '100%',
                  minHeight: '120px',
                  fontSize: '16px',
                  padding: '16px',
                  border: '2px solid #ddd',
                  borderRadius: '8px',
                  resize: 'vertical'
                }}
              />
            </div>
          ) : (
            <div className="answer-options">
              {currentQuestion?.answerOptions.map((option, index) => (
                <button
                  key={index}
                  className={`btn btn-large btn-block answer-option ${currentAnswer === index ? 'selected' : ''}`}
                  onClick={() => selectAnswer(index)}
                >
                  {option}
                </button>
              ))}
              
              {/* FORCED FREE TEXT - ALWAYS SHOW */}
              <div style={{ marginTop: '16px', background: 'yellow', padding: '16px' }}>
                <h4 style={{ margin: '0 0 12px 0', color: 'red' }}>🔴 FORCED FREE TEXT INPUT:</h4>
                <textarea
                  style={{ width: '100%', minHeight: '80px', fontSize: '16px', padding: '12px' }}
                  placeholder="Type your answer here..."
                />
              </div>
              
              {(currentQuestion?.hasFreetextOption || true) && (
                <div style={{ marginTop: '16px' }}>
                  <div style={{ 
                    padding: '16px', 
                    backgroundColor: '#f8f9fa', 
                    borderRadius: '8px',
                    border: '2px solid #dee2e6',
                    marginBottom: '12px'
                  }}>
                    <h4 style={{ margin: '0 0 12px 0', color: '#495057' }}>Or enter your own response:</h4>
                    <textarea
                      className="form-input form-textarea"
                      value={gameState.freetextInputs[`player${gameState.currentPlayer}_q${gameState.currentQuestionIndex}_r${gameState.currentRound}`] || ''}
                      onChange={(e) => {
                        updateFreetextInput(e.target.value);
                        // Auto-select this option when text is entered
                        if (e.target.value.trim()) {
                          selectAnswer(currentQuestion.answerOptions.length);
                        }
                      }}
                      placeholder="Type your own answer here..."
                      style={{
                        width: '100%',
                        minHeight: '80px',
                        fontSize: '16px',
                        padding: '12px',
                        border: currentAnswer === currentQuestion.answerOptions.length ? '2px solid #007bff' : '2px solid #ddd',
                        borderRadius: '8px',
                        resize: 'vertical'
                      }}
                    />
                    {currentAnswer === currentQuestion.answerOptions.length && (
                      <p style={{ margin: '8px 0 0 0', fontSize: '14px', color: '#007bff', fontWeight: '600' }}>
                        ✓ Your custom response is selected
                      </p>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          <button
            className="btn btn-large btn-block btn-success"
            onClick={submitAnswer}
            disabled={
              currentAnswer === undefined || 
              currentAnswer === '' ||
              (currentQuestion?.isFreetext && currentAnswer.trim() === '') ||
              (currentQuestion?.hasFreetextOption && 
               currentAnswer === currentQuestion.answerOptions.length && 
               (!gameState.freetextInputs[`player${gameState.currentPlayer}_q${gameState.currentQuestionIndex}_r${gameState.currentRound}`] || 
                gameState.freetextInputs[`player${gameState.currentPlayer}_q${gameState.currentQuestionIndex}_r${gameState.currentRound}`].trim() === ''))
            }
          >
            Submit Answer
          </button>
        </div>
      </div>
    );
  };

  const renderAnswerRevealed = () => {
    const { currentQuestion, correctAnswer, playerCount, currentPlayer, isFreetext, freetextResponses, otherResponses } = gameState;
    const currentAnswer = getCurrentAnswer();

    return (
      <div className="student-container">
        <div className="card">
          <div className="round-indicator answer-revealed">
            {currentQuestion?.isFreetext || isFreetext ? 'All Responses' : 'Correct Answer Revealed'}
          </div>

          {playerCount === 2 && (
            <div className="player-selector">
              <button 
                className={`btn player-toggle ${currentPlayer === 1 ? 'active' : ''}`}
                onClick={() => switchPlayer(1)}
              >
                Player 1
              </button>
              <button 
                className={`btn player-toggle ${currentPlayer === 2 ? 'active' : ''}`}
                onClick={() => switchPlayer(2)}
              >
                Player 2
              </button>
            </div>
          )}

          <div className="question-text">
            {currentQuestion?.questionText}
          </div>

          {currentQuestion?.isFreetext || isFreetext ? (
            <div>
              <div className="status-message status-info" style={{ marginBottom: '16px' }}>
                <h4>Your Answer:</h4>
                <p style={{ 
                  background: '#f8f9fa', 
                  padding: '12px', 
                  borderRadius: '8px', 
                  border: '2px solid #007bff',
                  fontStyle: 'italic',
                  margin: '8px 0'
                }}>
                  "{currentAnswer || 'No answer submitted'}"
                </p>
              </div>
              
              <div className="status-message">
                <h4>All Class Responses:</h4>
                {freetextResponses && freetextResponses.length > 0 ? (
                  <div style={{ maxHeight: '300px', overflowY: 'auto' }}>
                    {freetextResponses.map((response, index) => (
                      <div key={index} style={{
                        background: '#f8f9fa',
                        padding: '8px 12px',
                        margin: '4px 0',
                        borderRadius: '6px',
                        borderLeft: '4px solid #007bff'
                      }}>
                        <span style={{ fontSize: '14px', color: '#666' }}>
                          Player {response.playerNumber}:{' '}
                        </span>
                        <span style={{ fontStyle: 'italic' }}>
                          "{response.selectedAnswer}"
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p style={{ color: '#666', fontStyle: 'italic' }}>No responses submitted yet.</p>
                )}
              </div>
            </div>
          ) : (
            <div>
              <div className="answer-options">
                {currentQuestion?.answerOptions.map((option, index) => {
                  const isCorrect = index === correctAnswer;
                  const wasSelected = currentAnswer === index;
                  
                  return (
                    <button
                      key={index}
                      className={`btn btn-large btn-block answer-option 
                        ${isCorrect ? 'correct-answer' : ''} 
                        ${wasSelected && !isCorrect ? 'selected-wrong' : ''}
                        ${wasSelected && isCorrect ? 'selected-correct' : ''}
                      `}
                      disabled
                    >
                      {option}
                      {isCorrect && ' ✓'}
                      {wasSelected && isCorrect && ' (Your answer)'}
                      {wasSelected && !isCorrect && ' (Your answer)'}
                    </button>
                  );
                })}
              </div>

              <div className="status-message">
                {currentAnswer === correctAnswer ? (
                  <p className="correct-message">🎉 Correct! Well done!</p>
                ) : (
                  <p className="incorrect-message">The correct answer was: {currentQuestion?.answerOptions[correctAnswer]}</p>
                )}
              </div>
            </div>
          )}

          <div className="waiting-message" style={{ marginTop: '20px' }}>
            <p>Waiting for teacher to continue...</p>
          </div>
        </div>
      </div>
    );
  };

  const renderSubmitted = () => (
    <div className="student-container">
      <div className="card">
        <div className="status-message status-success">
          <h2>Answer Submitted!</h2>
          <p>Waiting for the next question...</p>
          {gameState.playerCount === 2 && (
            <p style={{ marginTop: '16px' }}>
              Playing as Player {gameState.currentPlayer}
            </p>
          )}
        </div>
      </div>
    </div>
  );

  const renderCompleted = () => (
    <div className="student-container">
      <div className="card">
        <div className="status-message status-info">
          <h2>Quiz Completed!</h2>
          <p>Thanks for participating!</p>
        </div>
      </div>
    </div>
  );

  switch (gameState.phase) {
    case 'setup':
      return renderSetup();
    case 'waiting':
      return renderWaiting();
    case 'answering':
      return renderAnswering();
    case 'submitted':
      return renderSubmitted();
    case 'answer-revealed':
      return renderAnswerRevealed();
    case 'completed':
      return renderCompleted();
    default:
      return renderWaiting();
  }
};

export default StudentApp;