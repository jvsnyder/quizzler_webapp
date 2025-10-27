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

const PORT = process.env.PORT || 8000;

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
  
  const sessionResponses = responses.get(sessionId);
  const otherResponses = [];
  const freetextResponses = [];
  
  // For pure freetext questions, collect all responses
  if (currentQuestion.isFreetext && sessionResponses) {
    for (const response of sessionResponses.values()) {
      if (response.questionIndex === session.currentQuestionIndex && response.round === 2) {
        freetextResponses.push({
          deviceId: response.deviceId,
          playerNumber: response.playerNumber,
          selectedAnswer: response.selectedAnswer
        });
      }
    }
  }
  
  // Collect "Other" responses for questions with hasFreetextOption
  if (currentQuestion.hasFreetextOption && sessionResponses) {
    for (const response of sessionResponses.values()) {
      if (response.questionIndex === session.currentQuestionIndex && 
          response.round === 2 && 
          response.isOtherOption) {
        otherResponses.push({
          deviceId: response.deviceId,
          playerNumber: response.playerNumber,
          selectedAnswer: response.selectedAnswer
        });
      }
    }
  }
  
  io.to(`session-${sessionId}`).emit('revealAnswer', {
    question: currentQuestion,
    questionIndex: session.currentQuestionIndex,
    correctAnswer: currentQuestion.correctAnswer,
    isFreetext: currentQuestion.isFreetext,
    hasFreetextOption: currentQuestion.hasFreetextOption,
    freetextResponses: freetextResponses,
    otherResponses: otherResponses,
    round: 3
  });
  
  res.json({ success: true });
});

app.post('/api/sessions/:sessionId/back-round', (req, res) => {
  const { sessionId } = req.params;
  const session = sessions.get(sessionId);
  
  if (!session) {
    return res.status(404).json({ error: 'Session not found' });
  }
  
  // Go back one round (3 -> 2, 2 -> 1, can't go below 1)
  if (session.currentRound > 1) {
    const targetRound = session.currentRound - 1;
    session.currentRound = targetRound;
    
    // Clear ALL responses for this question when going back to any round
    const sessionResponses = responses.get(sessionId);
    if (sessionResponses) {
      const keysToDelete = [];
      for (const [key, response] of sessionResponses.entries()) {
        if (response.questionIndex === session.currentQuestionIndex) {
          keysToDelete.push(key);
        }
      }
      keysToDelete.forEach(key => sessionResponses.delete(key));
      console.log(`Cleared ${keysToDelete.length} responses for question ${session.currentQuestionIndex} (all rounds)`);
    }
    
    const currentQuestion = session.questions[session.currentQuestionIndex];
    
    if (session.currentRound === 1) {
      io.to(`session-${sessionId}`).emit('nextQuestion', {
        question: currentQuestion,
        questionIndex: session.currentQuestionIndex,
        round: 1
      });
    } else if (session.currentRound === 2) {
      io.to(`session-${sessionId}`).emit('nextRound', {
        question: currentQuestion,
        questionIndex: session.currentQuestionIndex,
        round: 2
      });
    }
    
    res.json({ success: true, currentRound: session.currentRound });
  } else {
    res.status(400).json({ error: 'Cannot go back from first round' });
  }
});

app.post('/api/sessions/:sessionId/back-question', (req, res) => {
  const { sessionId } = req.params;
  const session = sessions.get(sessionId);
  
  if (!session) {
    return res.status(404).json({ error: 'Session not found' });
  }
  
  // Go back one question (can't go below 0)
  if (session.currentQuestionIndex > 0) {
    session.currentQuestionIndex = session.currentQuestionIndex - 1;
    session.currentRound = 1; // Reset to round 1 when going back to previous question
    
    // Clear all responses for this question (all rounds)
    const sessionResponses = responses.get(sessionId);
    if (sessionResponses) {
      const keysToDelete = [];
      for (const [key, response] of sessionResponses.entries()) {
        if (response.questionIndex === session.currentQuestionIndex) {
          keysToDelete.push(key);
        }
      }
      keysToDelete.forEach(key => sessionResponses.delete(key));
      console.log(`Cleared ${keysToDelete.length} responses for question ${session.currentQuestionIndex}`);
    }
    
    const currentQuestion = session.questions[session.currentQuestionIndex];
    io.to(`session-${sessionId}`).emit('nextQuestion', {
      question: currentQuestion,
      questionIndex: session.currentQuestionIndex,
      round: 1
    });
    
    res.json({ success: true, currentQuestionIndex: session.currentQuestionIndex });
  } else {
    res.status(400).json({ error: 'Cannot go back from first question' });
  }
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
  const { deviceId, playerNumber, questionIndex, round, selectedAnswer, isOtherOption } = req.body;
  
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
    isOtherOption: isOtherOption || false,
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

// Temporary route for testing admin interface
app.get('/admin', (req, res) => {
  res.send(`
    <html>
      <head>
        <title>Create New Quiz Session - Quizzler</title>
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <style>
          body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Oxygen',
                'Ubuntu', 'Cantarell', 'Fira Sans', 'Droid Sans', 'Helvetica Neue',
                sans-serif;
            -webkit-font-smoothing: antialiased;
            -moz-osx-font-smoothing: grayscale;
            margin: 0;
            padding: 20px;
            background-color: #f5f7fa;
          }
          .container {
            max-width: 1200px;
            margin: 0 auto;
            background: white;
            padding: 30px;
            border-radius: 12px;
            box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
          }
          .admin-header h1 {
            font-size: 2.5rem;
            font-weight: 700;
            color: #333;
            margin-bottom: 20px;
          }
          .btn {
            padding: 12px 24px;
            font-size: 16px;
            font-weight: 600;
            border: none;
            border-radius: 8px;
            cursor: pointer;
            text-decoration: none;
            display: inline-block;
            transition: all 0.2s ease;
            margin: 5px;
          }
          .btn-secondary {
            background: #6c757d;
            color: white;
          }
          .btn-success {
            background: #28a745;
            color: white;
          }
          .btn-primary {
            background: #007bff;
            color: white;
          }
          .btn-danger {
            background: #dc3545;
            color: white;
            padding: 8px 16px;
            font-size: 14px;
          }
          .form-group {
            margin: 20px 0;
          }
          .form-label {
            display: block;
            margin-bottom: 8px;
            font-weight: 600;
            color: #333;
          }
          .form-input {
            width: 100%;
            padding: 12px;
            border: 1px solid #dee2e6;
            border-radius: 6px;
            font-size: 16px;
            box-sizing: border-box;
          }
          .form-textarea {
            min-height: 100px;
            resize: vertical;
            font-family: inherit;
          }
          .card {
            background: #f8f9fa;
            border: 1px solid #dee2e6;
            border-radius: 8px;
            padding: 20px;
            margin: 20px 0;
          }
          .question-type-options {
            display: flex;
            flex-direction: column;
            gap: 8px;
            margin: 12px 0;
          }
          .question-type-options label {
            display: flex;
            align-items: center;
            gap: 8px;
            font-weight: normal;
          }
          .answer-option-row {
            display: flex;
            align-items: center;
            gap: 12px;
            margin-bottom: 8px;
          }
          .answer-option-row input[type="radio"] {
            margin: 0;
          }
          .answer-option-row input[type="text"] {
            flex: 1;
          }
          .freetext-note {
            background: #e7f3ff;
            border: 1px solid #b3d9ff;
            border-radius: 6px;
            padding: 12px;
            margin: 12px 0;
            font-style: italic;
            color: #0066cc;
          }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="admin-header">
            <h1>Create New Quiz Session</h1>
            <a href="/" class="btn btn-secondary">Back to Sessions</a>
          </div>
          
          <form id="sessionForm">
            <div class="form-group">
              <label class="form-label">Session Name</label>
              <input
                type="text"
                id="sessionName"
                class="form-input"
                placeholder="Enter session name (e.g., Chapter 5 Quiz)"
                required
              />
            </div>

            <h3>Questions</h3>
            
            <div id="questionsContainer">
              <div class="card question-item" data-index="0">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;">
                  <h4>Question 1</h4>
                </div>

                <div class="form-group">
                  <label class="form-label">Question Text</label>
                  <textarea
                    class="form-input form-textarea question-text"
                    placeholder="Enter your question here..."
                    required
                  ></textarea>
                </div>

                <div class="form-group">
                  <label class="form-label">Question Type</label>
                  <div class="question-type-options">
                    <label>
                      <input type="radio" name="type-0" value="multiple" checked>
                      Multiple Choice (default)
                    </label>
                    <label>
                      <input type="radio" name="type-0" value="mixed">
                      Add Free Text Response
                    </label>
                    <label>
                      <input type="radio" name="type-0" value="freetext">
                      Free Text Response Only
                    </label>
                  </div>
                </div>

                <div class="multiple-choice-options">
                  <label class="form-label">Answer Options</label>
                  <div class="answer-options">
                    <div class="answer-option-row">
                      <input type="radio" name="correct-0" value="0" checked>
                      <input type="text" class="form-input answer-option" placeholder="Option 1" required>
                    </div>
                    <div class="answer-option-row">
                      <input type="radio" name="correct-0" value="1">
                      <input type="text" class="form-input answer-option" placeholder="Option 2" required>
                    </div>
                  </div>
                  <p style="font-size: 14px; color: #666; margin: 8px 0;">
                    Select the radio button next to the correct answer
                  </p>
                  <button type="button" class="btn btn-primary" onclick="addAnswerOption(0)">Add Option</button>
                </div>

                <div class="freetext-info" style="display: none;">
                  <div class="freetext-note">
                    ✓ Students will be able to enter their own text response for this question.
                  </div>
                </div>
              </div>
            </div>

            <div style="margin-top: 20px;">
              <button type="button" class="btn btn-primary" onclick="addQuestion()">Add Question</button>
              <button type="submit" class="btn btn-success">Create Session</button>
            </div>
          </form>
        </div>

        <script>
          let questionCount = 1;
          
          // Handle question type changes
          document.addEventListener('change', function(e) {
            if (e.target.name && e.target.name.startsWith('type-')) {
              const questionIndex = e.target.name.split('-')[1];
              const questionItem = document.querySelector('[data-index="' + questionIndex + '"]');
              const multipleChoice = questionItem.querySelector('.multiple-choice-options');
              const freetextInfo = questionItem.querySelector('.freetext-info');
              
              if (e.target.value === 'freetext') {
                multipleChoice.style.display = 'none';
                freetextInfo.style.display = 'block';
              } else {
                multipleChoice.style.display = 'block';
                freetextInfo.style.display = 'none';
              }
            }
          });
          
          // Add answer option function
          function addAnswerOption(questionIndex) {
            const questionItem = document.querySelector('[data-index="' + questionIndex + '"]');
            const answerOptions = questionItem.querySelector('.answer-options');
            const currentOptions = answerOptions.querySelectorAll('.answer-option');
            const newIndex = currentOptions.length;
            
            if (newIndex < 6) {
              const newOption = document.createElement('div');
              newOption.className = 'answer-option-row';
              newOption.innerHTML = 
                '<input type="radio" name="correct-' + questionIndex + '" value="' + newIndex + '">' +
                '<input type="text" class="form-input answer-option" placeholder="Option ' + (newIndex + 1) + '" required>' +
                '<button type="button" class="btn btn-danger" onclick="removeAnswerOption(this)">×</button>';
              answerOptions.appendChild(newOption);
            }
          }
          
          // Remove answer option function
          function removeAnswerOption(button) {
            const optionDiv = button.parentElement;
            const answerOptions = optionDiv.parentElement;
            const remainingOptions = answerOptions.querySelectorAll('.answer-option');
            
            if (remainingOptions.length > 2) {
              optionDiv.remove();
            }
          }
          
          // Add question function
          function addQuestion() {
            questionCount++;
            const questionsContainer = document.getElementById('questionsContainer');
            const newQuestion = document.createElement('div');
            newQuestion.className = 'card question-item';
            newQuestion.setAttribute('data-index', questionCount - 1);
            newQuestion.innerHTML = 
              '<div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;">' +
                '<h4>Question ' + questionCount + '</h4>' +
                '<button type="button" class="btn btn-danger" onclick="removeQuestion(' + (questionCount - 1) + ')">Remove</button>' +
              '</div>' +
              '<div class="form-group">' +
                '<label class="form-label">Question Text</label>' +
                '<textarea class="form-input form-textarea question-text" placeholder="Enter your question here..." required></textarea>' +
              '</div>' +
              '<div class="form-group">' +
                '<label class="form-label">Question Type</label>' +
                '<div class="question-type-options">' +
                  '<label><input type="radio" name="type-' + (questionCount - 1) + '" value="multiple" checked> Multiple Choice (default)</label>' +
                  '<label><input type="radio" name="type-' + (questionCount - 1) + '" value="mixed"> Add Free Text Response</label>' +
                  '<label><input type="radio" name="type-' + (questionCount - 1) + '" value="freetext"> Free Text Response Only</label>' +
                '</div>' +
              '</div>' +
              '<div class="multiple-choice-options">' +
                '<label class="form-label">Answer Options</label>' +
                '<div class="answer-options">' +
                  '<div class="answer-option-row">' +
                    '<input type="radio" name="correct-' + (questionCount - 1) + '" value="0" checked>' +
                    '<input type="text" class="form-input answer-option" placeholder="Option 1" required>' +
                  '</div>' +
                  '<div class="answer-option-row">' +
                    '<input type="radio" name="correct-' + (questionCount - 1) + '" value="1">' +
                    '<input type="text" class="form-input answer-option" placeholder="Option 2" required>' +
                  '</div>' +
                '</div>' +
                '<p style="font-size: 14px; color: #666; margin: 8px 0;">Select the radio button next to the correct answer</p>' +
                '<button type="button" class="btn btn-primary" onclick="addAnswerOption(' + (questionCount - 1) + ')">Add Option</button>' +
              '</div>' +
              '<div class="freetext-info" style="display: none;">' +
                '<div class="freetext-note">✓ Students will be able to enter their own text response for this question.</div>' +
              '</div>';
            questionsContainer.appendChild(newQuestion);
          }
          
          // Remove question function
          function removeQuestion(questionIndex) {
            const questionItem = document.querySelector('[data-index="' + questionIndex + '"]');
            if (questionItem && document.querySelectorAll('.question-item').length > 1) {
              questionItem.remove();
            }
          }
          
          // Handle form submission
          document.getElementById('sessionForm').addEventListener('submit', function(e) {
            e.preventDefault();
            
            const sessionName = document.getElementById('sessionName').value;
            const questionItems = document.querySelectorAll('.question-item');
            const questions = [];
            
            try {
              questionItems.forEach((item, index) => {
                const questionText = item.querySelector('.question-text').value;
                const questionTypeElement = item.querySelector('input[name="type-' + index + '"]:checked');
                const questionType = questionTypeElement ? questionTypeElement.value : 'multiple';
                
                if (!questionText.trim()) {
                  throw new Error('Question ' + (index + 1) + ' text is required');
                }
                
                const question = {
                  questionText: questionText.trim(),
                  answerOptions: [],
                  correctAnswer: 0,
                  isFreetext: questionType === 'freetext',
                  hasFreetextOption: questionType === 'mixed'
                };
                
                if (questionType === 'multiple' || questionType === 'mixed') {
                  const answerOptions = item.querySelectorAll('.answer-option');
                  const correctRadio = item.querySelector('input[name="correct-' + index + '"]:checked');
                  
                  const options = [];
                  answerOptions.forEach(option => {
                    const optionText = option.value.trim();
                    if (optionText) {
                      options.push(optionText);
                    }
                  });
                  
                  if (questionType === 'multiple' && options.length === 0) {
                    throw new Error('Question ' + (index + 1) + ' needs at least one answer option');
                  }
                  
                  question.answerOptions = options;
                  question.correctAnswer = correctRadio ? parseInt(correctRadio.value) : 0;
                }
                
                questions.push(question);
              });
              
              if (questions.length === 0) {
                throw new Error('At least one question is required');
              }
              
              // Submit to server
              fetch('/api/sessions', {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                  name: sessionName,
                  questions: questions
                })
              })
              .then(response => response.json())
              .then(data => {
                if (data.sessionId) {
                  alert('Session created successfully!');
                  window.location.href = '/';
                } else {
                  throw new Error('Failed to create session');
                }
              })
              .catch(error => {
                console.error('Error creating session:', error);
                alert('Error creating session: ' + error.message);
              });
              
            } catch (error) {
              alert(error.message);
            }
          });
        </script>
      </body>
    </html>
  `);
});

// Dashboard route for session management
app.get('/dashboard/:sessionId', (req, res) => {
  const { sessionId } = req.params;
  res.send(`
    <html>
      <head>
        <title>Session Dashboard - Quizzler</title>
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <style>
          body { font-family: Arial, sans-serif; margin: 20px; background: #f5f5f5; }
          .container { max-width: 1200px; margin: 0 auto; background: white; padding: 30px; border-radius: 12px; box-shadow: 0 4px 6px rgba(0,0,0,0.1); }
          .btn { padding: 12px 20px; margin: 5px; font-size: 16px; border: none; border-radius: 6px; cursor: pointer; text-decoration: none; display: inline-block; }
          .btn-primary { background: #007bff; color: white; }
          .btn-success { background: #28a745; color: white; }
          .btn-warning { background: #ffc107; color: #212529; }
          .btn-secondary { background: #6c757d; color: white; }
          .card { background: #f8f9fa; padding: 20px; margin: 20px 0; border-radius: 8px; border-left: 4px solid #007bff; }
          .results { margin: 20px 0; }
          .response-item { background: #e9ecef; padding: 10px; margin: 5px 0; border-radius: 4px; }
        </style>
        <script src="/socket.io/socket.io.js"></script>
      </head>
      <body>
        <div class="container">
          <h1 id="sessionName">Session Dashboard</h1>
          <div style="margin-bottom: 20px;">
            <a href="/admin" class="btn btn-secondary">← Back to Admin</a>
          </div>
          
          <div class="card">
            <h3>Session Controls</h3>
            <div id="sessionControls">
              <button class="btn btn-success" onclick="startSession()">Start Session</button>
              <button class="btn btn-primary" onclick="nextRound()">Next Round</button>
              <button class="btn btn-warning" onclick="revealAnswer()">Reveal Answer</button>
              <button class="btn btn-primary" onclick="nextQuestion()">Next Question</button>
            </div>
            <div id="currentQuestion" style="margin-top: 20px;"></div>
          </div>
          
          <div class="card">
            <h3>QR Code for Students</h3>
            <div id="qrCode"></div>
          </div>
          
          <div class="card">
            <h3>Live Responses</h3>
            <button class="btn btn-secondary" onclick="refreshResponses()">Refresh</button>
            <div id="responses" class="results"></div>
          </div>
        </div>
        
        <script>
          const sessionId = '${sessionId}';
          let socket;
          
          // Initialize
          document.addEventListener('DOMContentLoaded', function() {
            loadSession();
            loadQRCode();
            loadResponses();
            initSocket();
          });
          
          function initSocket() {
            socket = io();
            socket.emit('joinAdminSession', sessionId);
            
            socket.on('newResponse', function(response) {
              loadResponses();
            });
          }
          
          function loadSession() {
            fetch('/api/sessions/' + sessionId)
              .then(response => response.json())
              .then(session => {
                document.getElementById('sessionName').textContent = session.name + ' - Dashboard';
                document.getElementById('currentQuestion').innerHTML = 
                  '<h4>Current Question:</h4><p>' + 
                  (session.questions && session.questions[session.currentQuestionIndex || 0] ? 
                   session.questions[session.currentQuestionIndex || 0].questionText : 'No question selected') + 
                  '</p>';
              })
              .catch(error => {
                console.error('Error loading session:', error);
                document.getElementById('sessionName').textContent = 'Session Not Found';
              });
          }
          
          function loadQRCode() {
            fetch('/api/sessions/' + sessionId + '/qr')
              .then(response => response.json())
              .then(data => {
                document.getElementById('qrCode').innerHTML = 
                  '<img src="' + data.qrCode + '" alt="QR Code" style="max-width: 200px;"><br>' +
                  '<p style="font-size: 12px; word-break: break-all;">' + data.url + '</p>';
              })
              .catch(error => {
                console.error('Error loading QR code:', error);
              });
          }
          
          function loadResponses() {
            fetch('/api/sessions/' + sessionId + '/results')
              .then(response => response.json())
              .then(responses => {
                const container = document.getElementById('responses');
                if (responses.length === 0) {
                  container.innerHTML = '<p>No responses yet.</p>';
                } else {
                  container.innerHTML = responses.map(r => 
                    '<div class="response-item">' +
                    'Device: ' + r.deviceId.substring(7, 12) + ' | ' +
                    'Player: ' + r.playerNumber + ' | ' +
                    'Round: ' + r.round + ' | ' +
                    'Answer: ' + r.selectedAnswer +
                    '</div>'
                  ).join('');
                }
              })
              .catch(error => {
                console.error('Error loading responses:', error);
              });
          }
          
          function startSession() {
            fetch('/api/sessions/' + sessionId + '/start', { method: 'POST' })
              .then(() => {
                alert('Session started!');
                loadSession();
              })
              .catch(error => {
                console.error('Error starting session:', error);
                alert('Error starting session');
              });
          }
          
          function nextRound() {
            fetch('/api/sessions/' + sessionId + '/next-round', { method: 'POST' })
              .then(() => {
                alert('Advanced to next round!');
                loadSession();
              })
              .catch(error => {
                console.error('Error advancing round:', error);
                alert('Error advancing round');
              });
          }
          
          function revealAnswer() {
            fetch('/api/sessions/' + sessionId + '/reveal-answer', { method: 'POST' })
              .then(() => {
                alert('Answer revealed!');
                loadSession();
              })
              .catch(error => {
                console.error('Error revealing answer:', error);
                alert('Error revealing answer');
              });
          }
          
          function nextQuestion() {
            fetch('/api/sessions/' + sessionId + '/next-question', { method: 'POST' })
              .then(() => {
                alert('Advanced to next question!');
                loadSession();
              })
              .catch(error => {
                console.error('Error advancing question:', error);
                alert('Error advancing question');
              });
          }
          
          function refreshResponses() {
            loadResponses();
          }
        </script>
      </body>
    </html>
  `);
});

// Test route for debugging admin interface
app.get('/test-admin', (req, res) => {
  const fs = require('fs');
  const testFilePath = path.join(__dirname, '../test-admin.html');
  try {
    const content = fs.readFileSync(testFilePath, 'utf8');
    res.send(content);
  } catch (error) {
    res.status(404).send('Test file not found');
  }
});

// Debug endpoint to test if server is responding
app.get('/debug', (req, res) => {
  res.json({
    message: 'Server is working',
    timestamp: new Date().toISOString(),
    sessions: sessions.size,
    responses: responses.size
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
              showAnswerReveal(data.question, data.questionIndex, data);
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
            
            // Create answer interface
            const answerContainer = document.getElementById('answerButtons');
            answerContainer.innerHTML = '';
            
            if (question.isFreetext) {
              const textarea = document.createElement('textarea');
              textarea.className = 'form-textarea';
              textarea.style.cssText = 'width: 100%; min-height: 120px; font-size: 16px; padding: 16px; border: 2px solid #ddd; border-radius: 8px; resize: vertical; margin: 5px 0;';
              textarea.placeholder = 'Enter your answer here...';
              textarea.value = '';
              textarea.oninput = (e) => {
                selectedAnswer = e.target.value;
                document.getElementById('submitBtn').disabled = selectedAnswer === '';
              };
              answerContainer.appendChild(textarea);
            } else {
              question.answerOptions.forEach((option, index) => {
                const btn = document.createElement('button');
                btn.className = 'btn btn-large';
                btn.style.cssText = 'width: 100%; margin: 5px 0; background: #f8f9fa; color: #333; border: 2px solid #dee2e6;';
                btn.textContent = option;
                btn.onclick = () => selectAnswer(index);
                answerContainer.appendChild(btn);
              });
              
              // Add free text option if hasFreetextOption is true
              if (question.hasFreetextOption) {
                const freetextContainer = document.createElement('div');
                freetextContainer.style.cssText = 'margin-top: 16px; padding: 16px; background: #f8f9fa; border-radius: 8px; border: 2px solid #dee2e6;';
                
                const label = document.createElement('h4');
                label.textContent = 'Or enter your own response:';
                label.style.cssText = 'margin: 0 0 12px 0; color: #495057;';
                freetextContainer.appendChild(label);
                
                const textarea = document.createElement('textarea');
                textarea.id = 'freetextInput';
                textarea.style.cssText = 'width: 100%; min-height: 80px; font-size: 16px; padding: 12px; border: 2px solid #ddd; border-radius: 8px; resize: vertical; box-sizing: border-box;';
                textarea.placeholder = 'Type your own answer here...';
                textarea.oninput = (e) => {
                  const otherIndex = question.answerOptions.length;
                  if (e.target.value.trim()) {
                    selectAnswer(otherIndex);
                    selectedAnswer = e.target.value.trim();
                  } else {
                    selectedAnswer = null;
                    document.getElementById('submitBtn').disabled = true;
                  }
                };
                freetextContainer.appendChild(textarea);
                
                answerContainer.appendChild(freetextContainer);
              }
            }
            
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
            
            // Update button styles for multiple choice
            const answerButtons = document.getElementById('answerButtons').children;
            for (let i = 0; i < answerButtons.length; i++) {
              if (answerButtons[i].tagName === 'BUTTON') {
                if (i === answerIndex) {
                  answerButtons[i].style.cssText = 'width: 100%; margin: 5px 0; background: #007bff; color: white; border: 2px solid #007bff;';
                } else {
                  answerButtons[i].style.cssText = 'width: 100%; margin: 5px 0; background: #f8f9fa; color: #333; border: 2px solid #dee2e6;';
                }
              }
            }
            
            document.getElementById('submitBtn').disabled = false;
          }
          
          function restoreSelectedAnswer() {
            const answerKey = 'player' + currentPlayer + '_q' + currentQuestionIndex + '_r' + currentRound;
            const savedAnswer = answers[answerKey];
            
            if (savedAnswer !== undefined) {
              if (currentQuestion.isFreetext) {
                const textarea = document.getElementById('answerButtons').querySelector('textarea');
                if (textarea) {
                  textarea.value = savedAnswer;
                  selectedAnswer = savedAnswer;
                  document.getElementById('submitBtn').disabled = savedAnswer === '';
                }
              } else {
                selectAnswer(savedAnswer);
              }
            } else {
              selectedAnswer = null;
              if (currentQuestion.isFreetext) {
                const textarea = document.getElementById('answerButtons').querySelector('textarea');
                if (textarea) {
                  textarea.value = '';
                }
              } else {
                // Reset all buttons
                const answerButtons = document.getElementById('answerButtons').children;
                for (let i = 0; i < answerButtons.length; i++) {
                  if (answerButtons[i].tagName === 'BUTTON') {
                    answerButtons[i].style.cssText = 'width: 100%; margin: 5px 0; background: #f8f9fa; color: #333; border: 2px solid #dee2e6;';
                  }
                }
              }
              document.getElementById('submitBtn').disabled = true;
            }
          }
          
          function submitAnswer() {
            if (selectedAnswer === null || selectedAnswer === '') return;
            
            // Check if this is a free text response for mixed mode questions
            const isOtherOption = currentQuestion.hasFreetextOption && 
                                 typeof selectedAnswer === 'string' && 
                                 selectedAnswer !== null;
            
            fetch('/api/sessions/' + sessionId + '/submit', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                deviceId: deviceId,
                playerNumber: currentPlayer,
                questionIndex: currentQuestionIndex,
                round: currentRound,
                selectedAnswer: selectedAnswer,
                isOtherOption: isOtherOption
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
          
          function showAnswerReveal(question, questionIndex, data) {
            currentQuestion = question;
            currentQuestionIndex = questionIndex;
            currentRound = 3;
            
            document.getElementById('waiting').classList.add('hidden');
            document.getElementById('submitted').classList.add('hidden');
            document.getElementById('quiz').classList.remove('hidden');
            
            // Update round indicator
            const roundIndicator = document.getElementById('roundIndicator');
            roundIndicator.textContent = data.isFreetext ? 'All Responses' : 'Correct Answer Revealed';
            roundIndicator.style.background = '#fff3cd';
            roundIndicator.style.color = '#856404';
            
            // Show player selector for 2 players
            if (playerCount === 2) {
              document.getElementById('playerSelector').classList.remove('hidden');
              updatePlayerButtons();
            }
            
            // Update question
            document.getElementById('questionText').textContent = question.questionText;
            
            // Create answer interface based on question type
            const answerContainer = document.getElementById('answerButtons');
            answerContainer.innerHTML = '';
            
            const currentPlayerAnswerKey = 'player' + currentPlayer + '_q' + questionIndex + '_r2';
            const selectedAnswer = answers[currentPlayerAnswerKey];
            
            if (data.isFreetext) {
              // Show freetext responses
              const yourAnswerDiv = document.createElement('div');
              yourAnswerDiv.style.cssText = 'background: #d1ecf1; color: #0c5460; padding: 16px; border-radius: 8px; margin-bottom: 16px;';
              yourAnswerDiv.innerHTML = 
                '<h4>Your Answer:</h4>' +
                '<p style="background: #f8f9fa; padding: 12px; border-radius: 8px; border: 2px solid #007bff; font-style: italic; margin: 8px 0;">' +
                  '"' + (selectedAnswer || 'No answer submitted') + '"' +
                '</p>';
              answerContainer.appendChild(yourAnswerDiv);
              
              const allResponsesDiv = document.createElement('div');
              allResponsesDiv.style.cssText = 'background: #f8f9fa; padding: 16px; border-radius: 8px;';
              let allResponsesHtml = '<h4>All Class Responses:</h4>';
              
              if (data.freetextResponses && data.freetextResponses.length > 0) {
                allResponsesHtml += '<div style="max-height: 300px; overflow-y: auto;">';
                data.freetextResponses.forEach((response, index) => {
                  allResponsesHtml += 
                    '<div style="background: #f8f9fa; padding: 8px 12px; margin: 4px 0; border-radius: 6px; border-left: 4px solid #007bff;">' +
                      '<span style="font-size: 14px; color: #666;">Player ' + response.playerNumber + ': </span>' +
                      '<span style="font-style: italic;">"' + response.selectedAnswer + '"</span>' +
                    '</div>';
                });
                allResponsesHtml += '</div>';
              } else {
                allResponsesHtml += '<p style="color: #666; font-style: italic;">No responses submitted yet.</p>';
              }
              
              allResponsesDiv.innerHTML = allResponsesHtml;
              answerContainer.appendChild(allResponsesDiv);
              
              // Update submit button for freetext
              const submitBtn = document.getElementById('submitBtn');
              submitBtn.textContent = 'Waiting for teacher to continue...';
              submitBtn.style.cssText = 'width: 100%; padding: 20px; font-size: 16px; background: #6c757d; color: white; border: none; border-radius: 8px; margin-top: 20px;';
              submitBtn.disabled = true;
            } else {
              // Show multiple choice with correct answer highlighting
              question.answerOptions.forEach((option, index) => {
                const btn = document.createElement('button');
                btn.className = 'btn btn-large';
                btn.disabled = true;
                
                const isCorrect = index === data.correctAnswer;
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
              
              // Show feedback message for multiple choice
              const submitBtn = document.getElementById('submitBtn');
              if (selectedAnswer === data.correctAnswer) {
                submitBtn.textContent = '🎉 Correct! Well done!';
                submitBtn.style.cssText = 'width: 100%; padding: 20px; font-size: 18px; background: #28a745; color: white; border: none; border-radius: 8px; margin-top: 20px;';
              } else {
                submitBtn.textContent = 'The correct answer was: ' + question.answerOptions[data.correctAnswer];
                submitBtn.style.cssText = 'width: 100%; padding: 20px; font-size: 16px; background: #6c757d; color: white; border: none; border-radius: 8px; margin-top: 20px;';
              }
              submitBtn.disabled = true;
            }
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

// Root route - serve the main dashboard
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '../client/build/index.html'));
});

if (process.env.NODE_ENV === 'production') {
  app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '../client/build/index.html'));
  });
}

server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Access at: http://localhost:${PORT}`);
});