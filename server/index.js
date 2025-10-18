const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const QRCode = require('qrcode');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: process.env.NODE_ENV === 'production' ? false : ['http://localhost:3000', 'http://localhost:3002'],
    methods: ['GET', 'POST']
  }
});

const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

if (process.env.NODE_ENV === 'production') {
  app.use(express.static(path.join(__dirname, '../client/build')));
}

const sessions = new Map();
const responses = new Map();

app.get('/api/sessions', (req, res) => {
  const sessionList = Array.from(sessions.values()).map(session => ({
    id: session.id,
    name: session.name,
    status: session.status,
    currentQuestionIndex: session.currentQuestionIndex,
    currentRound: session.currentRound,
    questionsCount: session.questions.length,
    createdAt: session.createdAt
  }));
  res.json(sessionList);
});

app.post('/api/sessions', (req, res) => {
  const { name, questions } = req.body;
  const sessionId = uuidv4();
  
  const session = {
    id: sessionId,
    name,
    questions,
    currentQuestionIndex: -1,
    currentRound: 1,
    status: 'waiting',
    createdAt: new Date().toISOString()
  };
  
  sessions.set(sessionId, session);
  responses.set(sessionId, new Map());
  
  res.json({ sessionId, session });
});

app.get('/api/sessions/:sessionId', (req, res) => {
  const { sessionId } = req.params;
  const session = sessions.get(sessionId);
  
  if (!session) {
    return res.status(404).json({ error: 'Session not found' });
  }
  
  res.json(session);
});

app.get('/api/sessions/:sessionId/qr', async (req, res) => {
  const { sessionId } = req.params;
  const session = sessions.get(sessionId);
  
  if (!session) {
    return res.status(404).json({ error: 'Session not found' });
  }
  
  try {
    const studentUrl = `${req.protocol}://${req.get('host')}/student/${sessionId}`;
    const qrCodeDataUrl = await QRCode.toDataURL(studentUrl);
    res.json({ qrCode: qrCodeDataUrl, url: studentUrl });
  } catch (error) {
    res.status(500).json({ error: 'Failed to generate QR code' });
  }
});

app.post('/api/sessions/:sessionId/start', (req, res) => {
  const { sessionId } = req.params;
  const session = sessions.get(sessionId);
  
  if (!session) {
    return res.status(404).json({ error: 'Session not found' });
  }
  
  session.status = 'active';
  session.currentQuestionIndex = 0;
  session.currentRound = 1;
  
  io.to(`session-${sessionId}`).emit('sessionStarted', {
    question: session.questions[0],
    questionIndex: 0,
    round: 1
  });
  
  res.json({ success: true });
});

app.post('/api/sessions/:sessionId/next-question', (req, res) => {
  const { sessionId } = req.params;
  const session = sessions.get(sessionId);
  
  if (!session) {
    return res.status(404).json({ error: 'Session not found' });
  }
  
  session.currentQuestionIndex++;
  session.currentRound = 1;
  
  if (session.currentQuestionIndex >= session.questions.length) {
    session.status = 'completed';
    io.to(`session-${sessionId}`).emit('sessionCompleted');
    return res.json({ completed: true });
  }
  
  const currentQuestion = session.questions[session.currentQuestionIndex];
  io.to(`session-${sessionId}`).emit('nextQuestion', {
    question: currentQuestion,
    questionIndex: session.currentQuestionIndex,
    round: 1
  });
  
  res.json({ success: true });
});

app.post('/api/sessions/:sessionId/next-round', (req, res) => {
  const { sessionId } = req.params;
  const session = sessions.get(sessionId);
  
  if (!session) {
    return res.status(404).json({ error: 'Session not found' });
  }
  
  session.currentRound = 2;
  
  const currentQuestion = session.questions[session.currentQuestionIndex];
  io.to(`session-${sessionId}`).emit('nextRound', {
    question: currentQuestion,
    questionIndex: session.currentQuestionIndex,
    round: 2
  });
  
  res.json({ success: true });
});

app.post('/api/sessions/:sessionId/reveal-answer', (req, res) => {
  const { sessionId } = req.params;
  const session = sessions.get(sessionId);
  
  if (!session) {
    return res.status(404).json({ error: 'Session not found' });
  }
  
  session.currentRound = 3; // New phase for answer reveal
  
  const currentQuestion = session.questions[session.currentQuestionIndex];
  io.to(`session-${sessionId}`).emit('revealAnswer', {
    question: currentQuestion,
    questionIndex: session.currentQuestionIndex,
    correctAnswer: currentQuestion.correctAnswer,
    round: 3
  });
  
  res.json({ success: true });
});

app.get('/api/sessions/:sessionId/results', (req, res) => {
  const { sessionId } = req.params;
  const sessionResponses = responses.get(sessionId);
  
  if (!sessionResponses) {
    return res.status(404).json({ error: 'Session not found' });
  }
  
  const results = Array.from(sessionResponses.values());
  res.json(results);
});

app.delete('/api/sessions/:sessionId', (req, res) => {
  const { sessionId } = req.params;
  
  if (!sessions.has(sessionId)) {
    return res.status(404).json({ error: 'Session not found' });
  }
  
  // Remove session and its responses
  sessions.delete(sessionId);
  responses.delete(sessionId);
  
  console.log(`Session ${sessionId} deleted`);
  res.json({ success: true, message: 'Session deleted successfully' });
});

app.post('/api/sessions/:sessionId/submit', (req, res) => {
  const { sessionId } = req.params;
  const { deviceId, playerNumber, questionIndex, round, selectedAnswer } = req.body;
  
  const session = sessions.get(sessionId);
  if (!session) {
    return res.status(404).json({ error: 'Session not found' });
  }
  
  const sessionResponses = responses.get(sessionId);
  const responseKey = `${deviceId}-${playerNumber}-${questionIndex}-${round}`;
  
  const response = {
    sessionId,
    deviceId,
    playerNumber,
    questionIndex,
    round,
    selectedAnswer,
    submittedAt: new Date().toISOString()
  };
  
  sessionResponses.set(responseKey, response);
  
  io.to(`admin-${sessionId}`).emit('newResponse', response);
  
  res.json({ success: true });
});

io.on('connection', (socket) => {
  console.log('User connected:', socket.id);
  
  socket.on('joinSession', (sessionId) => {
    socket.join(`session-${sessionId}`);
    console.log(`Socket ${socket.id} joined session ${sessionId}`);
    
    const session = sessions.get(sessionId);
    if (session) {
      socket.emit('sessionJoined', {
        sessionId,
        status: session.status,
        currentQuestion: session.currentQuestionIndex >= 0 ? session.questions[session.currentQuestionIndex] : null,
        currentQuestionIndex: session.currentQuestionIndex,
        currentRound: session.currentRound
      });
    }
  });
  
  socket.on('joinAdminSession', (sessionId) => {
    socket.join(`admin-${sessionId}`);
    console.log(`Admin socket ${socket.id} joined session ${sessionId}`);
  });
  
  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id);
  });
});

// Temporary route for testing student interface
app.get('/student/:sessionId', (req, res) => {
  const { sessionId } = req.params;
  res.send(`
    <html>
      <head>
        <title>Quizzler Student</title>
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <style>
          body { font-family: Arial, sans-serif; margin: 20px; text-align: center; background: #f5f5f5; }
          .container { max-width: 400px; margin: 0 auto; background: white; padding: 30px; border-radius: 12px; box-shadow: 0 4px 6px rgba(0,0,0,0.1); }
          .btn { padding: 20px 30px; margin: 10px; font-size: 18px; border: none; border-radius: 8px; cursor: pointer; transition: all 0.2s; }
          .btn-primary { background: #007bff; color: white; }
          .btn-large { width: 100%; padding: 20px; font-size: 18px; }
          .btn:hover { transform: translateY(-2px); box-shadow: 0 6px 12px rgba(0,0,0,0.15); }
          .hidden { display: none; }
          .status { padding: 20px; margin: 20px 0; background: #d1ecf1; color: #0c5460; border-radius: 8px; }
        </style>
        <script src="/socket.io/socket.io.js"></script>
      </head>
      <body>
        <div class="container">
          <div id="setup">
            <h1>Welcome to Quizzler!</h1>
            <p>Session ID: ${sessionId}</p>
            <p>How many players will be using this device?</p>
            <button class="btn btn-primary btn-large" onclick="selectPlayers(1)">1 Player</button>
            <button class="btn btn-primary btn-large" onclick="selectPlayers(2)">2 Players</button>
          </div>
          
          <div id="waiting" class="hidden">
            <h2>Ready to Quiz!</h2>
            <div class="status">
              <p><strong>Players:</strong> <span id="playerCount"></span></p>
              <p>Waiting for teacher to start the quiz...</p>
            </div>
          </div>
          
          <div id="quiz" class="hidden">
            <div id="roundIndicator" class="status"></div>
            <div id="playerSelector" class="hidden" style="margin-bottom: 20px;">
              <button class="btn" id="player1Btn" onclick="switchPlayer(1)">Player 1</button>
              <button class="btn" id="player2Btn" onclick="switchPlayer(2)">Player 2</button>
            </div>
            <h3 id="questionText"></h3>
            <div id="answerButtons" style="margin: 20px 0;"></div>
            <button class="btn btn-primary btn-large" id="submitBtn" onclick="submitAnswer()" disabled>Submit Answer</button>
          </div>
          
          <div id="submitted" class="hidden">
            <div class="status" style="background: #d4edda; color: #155724;">
              <h3>Answer Submitted!</h3>
              <p>Waiting for the next question...</p>
              <p id="submittedPlayer"></p>
              <div id="switchPlayerSection" class="hidden" style="margin-top: 20px;">
                <p style="color: #333;">Switch to the other player to submit their answer:</p>
                <button class="btn btn-primary" id="switchToOtherPlayer" onclick="switchToOtherPlayer()">Switch Player</button>
              </div>
            </div>
          </div>
          
          <div id="error" class="hidden">
            <div class="status" style="background: #f8d7da; color: #721c24;">
              <h3>Session Not Found</h3>
              <p>This quiz session doesn't exist or has ended.</p>
              <p>Please check with your teacher for the correct link.</p>
            </div>
          </div>
        </div>
        
        <script>
          const sessionId = '${sessionId}';
          let socket;
          let playerCount = 1;
          let currentPlayer = 1;
          let currentQuestion = null;
          let currentQuestionIndex = -1;
          let currentRound = 1;
          let selectedAnswer = null;
          let answers = {};
          let deviceId = localStorage.getItem('deviceId') || (() => {
            const id = 'device_' + Math.random().toString(36).substr(2, 9);
            localStorage.setItem('deviceId', id);
            return id;
          })();
          
          function selectPlayers(count) {
            playerCount = count;
            document.getElementById('playerCount').textContent = count;
            document.getElementById('setup').classList.add('hidden');
            document.getElementById('waiting').classList.remove('hidden');
            
            // Connect to socket and join session
            socket = io();
            socket.emit('joinSession', sessionId);
            
            socket.on('sessionJoined', (data) => {
              console.log('Joined session:', data);
              if (data.status === 'active' && data.currentQuestion) {
                showCurrentQuestion(data.currentQuestion, data.currentQuestionIndex, data.currentRound);
              }
            });
            
            socket.on('sessionStarted', (data) => {
              showCurrentQuestion(data.question, data.questionIndex, data.round);
            });
            
            socket.on('nextQuestion', (data) => {
              // Clear submitted state when new question comes
              document.getElementById('submitted').classList.add('hidden');
              showCurrentQuestion(data.question, data.questionIndex, data.round);
            });
            
            socket.on('nextRound', (data) => {
              // Clear submitted state when new round comes
              document.getElementById('submitted').classList.add('hidden');
              showCurrentQuestion(data.question, data.questionIndex, data.round);
            });
            
            socket.on('revealAnswer', (data) => {
              // Clear submitted state and show answer reveal
              document.getElementById('submitted').classList.add('hidden');
              showAnswerReveal(data.question, data.questionIndex, data.correctAnswer);
            });
            
            socket.on('disconnect', () => {
              console.log('Disconnected from server');
            });
          }
          
          function showCurrentQuestion(question, questionIndex, round) {
            currentQuestion = question;
            currentQuestionIndex = questionIndex;
            currentRound = round;
            
            document.getElementById('waiting').classList.add('hidden');
            document.getElementById('submitted').classList.add('hidden');
            document.getElementById('quiz').classList.remove('hidden');
            
            // Update round indicator
            const roundIndicator = document.getElementById('roundIndicator');
            roundIndicator.textContent = round === 1 ? 'Round 1: Individual Answer' : 'Round 2: Group Discussion';
            roundIndicator.style.background = round === 1 ? '#d4edda' : '#d1ecf1';
            roundIndicator.style.color = round === 1 ? '#155724' : '#0c5460';
            
            // Show player selector for 2 players
            if (playerCount === 2) {
              document.getElementById('playerSelector').classList.remove('hidden');
              updatePlayerButtons();
            }
            
            // Update question
            document.getElementById('questionText').textContent = question.questionText;
            
            // Create answer buttons
            const answerContainer = document.getElementById('answerButtons');
            answerContainer.innerHTML = '';
            question.answerOptions.forEach((option, index) => {
              const btn = document.createElement('button');
              btn.className = 'btn btn-large';
              btn.style.cssText = 'width: 100%; margin: 5px 0; background: #f8f9fa; color: #333; border: 2px solid #dee2e6;';
              btn.textContent = option;
              btn.onclick = () => selectAnswer(index);
              answerContainer.appendChild(btn);
            });
            
            // Reset submit button to default state
            const submitBtn = document.getElementById('submitBtn');
            submitBtn.textContent = 'Submit Answer';
            submitBtn.style.cssText = 'width: 100%; padding: 20px; font-size: 18px; background: #28a745; color: white; border: none; border-radius: 8px; margin-top: 20px;';
            submitBtn.disabled = true;
            
            // Restore selected answer if switching players
            restoreSelectedAnswer();
          }
          
          function switchPlayer(playerNum) {
            currentPlayer = playerNum;
            updatePlayerButtons();
            restoreSelectedAnswer();
          }
          
          function updatePlayerButtons() {
            const player1Btn = document.getElementById('player1Btn');
            const player2Btn = document.getElementById('player2Btn');
            
            if (currentPlayer === 1) {
              player1Btn.style.cssText = 'background: #007bff; color: white; margin: 0 5px;';
              player2Btn.style.cssText = 'background: #e9ecef; color: #333; margin: 0 5px;';
            } else {
              player1Btn.style.cssText = 'background: #e9ecef; color: #333; margin: 0 5px;';
              player2Btn.style.cssText = 'background: #007bff; color: white; margin: 0 5px;';
            }
          }
          
          function selectAnswer(answerIndex) {
            selectedAnswer = answerIndex;
            const answerKey = 'player' + currentPlayer + '_q' + currentQuestionIndex + '_r' + currentRound;
            answers[answerKey] = answerIndex;
            
            // Update button styles
            const answerButtons = document.getElementById('answerButtons').children;
            for (let i = 0; i < answerButtons.length; i++) {
              if (i === answerIndex) {
                answerButtons[i].style.cssText = 'width: 100%; margin: 5px 0; background: #007bff; color: white; border: 2px solid #007bff;';
              } else {
                answerButtons[i].style.cssText = 'width: 100%; margin: 5px 0; background: #f8f9fa; color: #333; border: 2px solid #dee2e6;';
              }
            }
            
            document.getElementById('submitBtn').disabled = false;
          }
          
          function restoreSelectedAnswer() {
            const answerKey = 'player' + currentPlayer + '_q' + currentQuestionIndex + '_r' + currentRound;
            const savedAnswer = answers[answerKey];
            
            if (savedAnswer !== undefined) {
              selectAnswer(savedAnswer);
            } else {
              selectedAnswer = null;
              // Reset all buttons
              const answerButtons = document.getElementById('answerButtons').children;
              for (let i = 0; i < answerButtons.length; i++) {
                answerButtons[i].style.cssText = 'width: 100%; margin: 5px 0; background: #f8f9fa; color: #333; border: 2px solid #dee2e6;';
              }
              document.getElementById('submitBtn').disabled = true;
            }
          }
          
          function submitAnswer() {
            if (selectedAnswer === null) return;
            
            fetch('/api/sessions/' + sessionId + '/submit', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                deviceId: deviceId,
                playerNumber: currentPlayer,
                questionIndex: currentQuestionIndex,
                round: currentRound,
                selectedAnswer: selectedAnswer
              })
            }).then(() => {
              document.getElementById('quiz').classList.add('hidden');
              document.getElementById('submitted').classList.remove('hidden');
              document.getElementById('submittedPlayer').textContent = 'Answer submitted for Player ' + currentPlayer;
              
              // Check if we need to show switch player option
              if (playerCount === 2) {
                const otherPlayer = currentPlayer === 1 ? 2 : 1;
                const otherPlayerKey = 'player' + otherPlayer + '_q' + currentQuestionIndex + '_r' + currentRound;
                
                if (answers[otherPlayerKey] === undefined) {
                  document.getElementById('switchPlayerSection').classList.remove('hidden');
                  document.getElementById('switchToOtherPlayer').textContent = 'Switch to Player ' + otherPlayer;
                } else {
                  // Both players have answered - show completion message
                  document.getElementById('submittedPlayer').textContent = 'Both players have submitted their answers';
                }
              }
            }).catch(error => {
              console.error('Error submitting answer:', error);
            });
          }
          
          function switchToOtherPlayer() {
            const otherPlayer = currentPlayer === 1 ? 2 : 1;
            const otherPlayerKey = 'player' + otherPlayer + '_q' + currentQuestionIndex + '_r' + currentRound;
            
            // Check if other player has already answered
            if (answers[otherPlayerKey] !== undefined) {
              // Other player already answered, just switch to show their answer
              currentPlayer = otherPlayer;
              document.getElementById('submittedPlayer').textContent = 'Both players have submitted their answers';
              document.getElementById('switchPlayerSection').classList.add('hidden');
              return;
            }
            
            currentPlayer = otherPlayer;
            
            document.getElementById('submitted').classList.add('hidden');
            document.getElementById('quiz').classList.remove('hidden');
            document.getElementById('switchPlayerSection').classList.add('hidden');
            
            updatePlayerButtons();
            restoreSelectedAnswer();
          }
          
          function showAnswerReveal(question, questionIndex, correctAnswer) {
            currentQuestion = question;
            currentQuestionIndex = questionIndex;
            currentRound = 3;
            
            document.getElementById('waiting').classList.add('hidden');
            document.getElementById('submitted').classList.add('hidden');
            document.getElementById('quiz').classList.remove('hidden');
            
            // Update round indicator
            const roundIndicator = document.getElementById('roundIndicator');
            roundIndicator.textContent = 'Correct Answer Revealed';
            roundIndicator.style.background = '#fff3cd';
            roundIndicator.style.color = '#856404';
            
            // Show player selector for 2 players
            if (playerCount === 2) {
              document.getElementById('playerSelector').classList.remove('hidden');
              updatePlayerButtons();
            }
            
            // Update question
            document.getElementById('questionText').textContent = question.questionText;
            
            // Create answer buttons with correct answer highlighting
            const answerContainer = document.getElementById('answerButtons');
            answerContainer.innerHTML = '';
            
            const currentPlayerAnswerKey = 'player' + currentPlayer + '_q' + questionIndex + '_r2';
            const selectedAnswer = answers[currentPlayerAnswerKey];
            
            question.answerOptions.forEach((option, index) => {
              const btn = document.createElement('button');
              btn.className = 'btn btn-large';
              btn.disabled = true;
              
              const isCorrect = index === correctAnswer;
              const wasSelected = selectedAnswer === index;
              
              if (isCorrect) {
                btn.style.cssText = 'width: 100%; margin: 5px 0; background: #28a745; color: white; border: 2px solid #28a745; font-weight: 600;';
                btn.textContent = option + ' ✓';
              } else if (wasSelected) {
                btn.style.cssText = 'width: 100%; margin: 5px 0; background: #dc3545; color: white; border: 2px solid #dc3545;';
                btn.textContent = option + ' (Your answer)';
              } else {
                btn.style.cssText = 'width: 100%; margin: 5px 0; background: #f8f9fa; color: #333; border: 2px solid #dee2e6;';
                btn.textContent = option;
              }
              
              answerContainer.appendChild(btn);
            });
            
            // Show feedback message
            const submitBtn = document.getElementById('submitBtn');
            if (selectedAnswer === correctAnswer) {
              submitBtn.textContent = '🎉 Correct! Well done!';
              submitBtn.style.cssText = 'width: 100%; padding: 20px; font-size: 18px; background: #28a745; color: white; border: none; border-radius: 8px; margin-top: 20px;';
            } else {
              submitBtn.textContent = 'The correct answer was: ' + question.answerOptions[correctAnswer];
              submitBtn.style.cssText = 'width: 100%; padding: 20px; font-size: 16px; background: #6c757d; color: white; border: none; border-radius: 8px; margin-top: 20px;';
            }
            submitBtn.disabled = true;
          }
          
          // Check if session exists
          fetch('/api/sessions/' + sessionId)
            .then(response => {
              if (!response.ok) {
                document.getElementById('setup').classList.add('hidden');
                document.getElementById('error').classList.remove('hidden');
              }
            })
            .catch(error => {
              console.error('Error checking session:', error);
            });
        </script>
      </body>
    </html>
  `);
});

if (process.env.NODE_ENV === 'production') {
  app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '../client/build/index.html'));
  });
}

server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});