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
    answers: {} // stores answers for both players
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
        answers: {}
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
        answers: {}
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

  const submitAnswer = async () => {
    const { currentPlayer, currentQuestionIndex, currentRound, answers } = gameState;
    const answerKey = `player${currentPlayer}_q${currentQuestionIndex}_r${currentRound}`;
    const selectedAnswer = answers[answerKey];

    if (selectedAnswer === undefined) return;

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
          selectedAnswer
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
          </div>

          <button
            className="btn btn-large btn-block btn-success"
            onClick={submitAnswer}
            disabled={currentAnswer === undefined}
          >
            Submit Answer
          </button>
        </div>
      </div>
    );
  };

  const renderAnswerRevealed = () => {
    const { currentQuestion, correctAnswer, playerCount, currentPlayer } = gameState;
    const currentAnswer = getCurrentAnswer();

    return (
      <div className="student-container">
        <div className="card">
          <div className="round-indicator answer-revealed">
            Correct Answer Revealed
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