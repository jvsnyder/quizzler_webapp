# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

# Quizzler - Interactive Classroom Quiz Application

## Project Overview
A dual web application system for interactive classroom quizzing designed for 16-17 year old students. The system consists of a student-facing quiz interface and an administrative dashboard for teachers.

## Problem Statement
- Not all students feel comfortable raising their hands to answer questions
- Mixed device availability (some students share phones)
- Need for both individual and group discussion phases for each question

## Solution Architecture

### Student Web App ("Quizzler")
- Browser-based interface accessible via QR code
- Player selection: 1 player or 2 players per device
- Three-phase answering system:
  - Round 1: Individual answers
  - Round 2: Group discussion and consensus answers
  - Round 3: Correct answer reveal with educational feedback
- Player switching functionality with answer persistence
- Real-time question display synchronized with teacher's presentation

### Administrative Web App
- Question management interface with correct answer selection
- Configurable answer options (variable number of choices)
- Live results dashboard showing student responses
- Three-phase question progression controls with back navigation
- Session management with undo functionality

## Technical Requirements

### Frontend (Student App)
- Responsive design for mobile devices
- Simple, large button interface
- Player state management (1 or 2 players)
- Answer persistence during player switching
- Real-time updates from admin controls

### Frontend (Admin App)
- Question input forms with dynamic answer options
- Live results visualization
- Session control buttons (next question, reset, etc.)
- QR code generation for student access

### Backend
- WebSocket connections for real-time updates
- Session management
- Question and answer storage
- Results aggregation and reporting
- API endpoints for CRUD operations

### Database Schema
```
Sessions:
- session_id (primary key)
- created_at
- current_question_index
- current_round (1, 2, or 3)
- status (active/inactive)

Questions:
- question_id (primary key)
- session_id (foreign key)
- question_text
- answer_options (JSON array)
- correct_answer (index of correct option)
- order_index

Responses:
- response_id (primary key)
- session_id (foreign key)
- question_id (foreign key)
- device_id (to track unique devices)
- player_number (1 or 2)
- round_number (1, 2, or 3)
- selected_answer
- submitted_at
```

## Deployment
- AWS Free Tier hosting
- Consider using:
  - AWS Amplify for frontend hosting
  - AWS Lambda + API Gateway for backend
  - Amazon DynamoDB for database
  - AWS WebSocket API for real-time features

## Key Features

### Student Interface
1. **Device Setup**
   - QR code scan to join session
   - Player count selection (1 or 2 players)
   - Simple, touch-friendly interface

2. **Answer Submission**
   - Large, clearly labeled answer buttons
   - Visual feedback for selected answers
   - Submit button with confirmation

3. **Player Switching** (2-player mode)
   - Toggle between Player 1 and Player 2
   - Restore previously selected answers
   - Clear visual indication of current player

4. **Round Management**
   - Automatic progression: Round 1 → Round 2 → Round 3 (Answer Reveal)
   - Different UI states for each round
   - Correct/incorrect answer highlighting in Round 3
   - Educational feedback with celebratory messages
   - Wait screens between questions

### Administrative Interface
1. **Session Management**
   - Create new quiz sessions
   - Generate QR codes for student access
   - Start/stop sessions

2. **Question Setup**
   - Add multiple questions to session
   - Configure number of answer choices (2-6 options)
   - Select correct answer using radio buttons
   - Edit answer text
   - Reorder questions

3. **Live Dashboard**
   - Real-time response tracking
   - Visual charts showing answer distribution
   - Breakdown by round (individual vs group)
   - Device/player participation metrics

4. **Session Controls**
   - Advance to next question with back navigation
   - Switch between rounds with undo functionality  
   - Reveal correct answers to students
   - Back buttons for previous question/round
   - Reset responses (automatic on back navigation)
   - End session

## User Flow

### Student Flow
1. Scan QR code → Access quizzler web app
2. Select number of players (1 or 2)
3. Wait for teacher to start question
4. **Round 1**: Select individual answer → Submit
5. Wait for Round 2 to begin
6. **Round 2**: Discuss in group → Select consensus answer → Submit
7. Wait for next question
8. Repeat steps 4-7

### Teacher Flow
1. Access admin dashboard
2. Create new session
3. Add questions, answer options, and select correct answers
4. Display QR code for students
5. Start session
6. Display question on presentation
7. Monitor live responses (Round 1: Individual)
8. Advance to Round 2 (Group Discussion)
9. Monitor group consensus responses
10. Reveal correct answer (Round 3)
11. Advance to next question or use back navigation if needed
12. Repeat steps 6-11

## Technical Stack Recommendations
- **Frontend**: React.js with responsive CSS
- **Backend**: Node.js with Express
- **Database**: MongoDB or DynamoDB
- **Real-time**: Socket.io or AWS WebSocket API
- **Hosting**: AWS (Amplify + Lambda + DynamoDB)
- **QR Code**: qrcode.js library

## Security Considerations
- Session-based access (no personal data collection)
- Rate limiting on answer submissions
- Input validation and sanitization
- HTTPS enforcement

## Development Phases
1. **Phase 1**: Basic student interface with single player
2. **Phase 2**: Administrative dashboard and question management
3. **Phase 3**: Two-player functionality and player switching
4. **Phase 4**: Real-time features and round management
5. **Phase 5**: AWS deployment and QR code integration
6. **Phase 6**: Testing and refinement

## Success Metrics
- Increased student participation in classroom discussions
- Successful handling of mixed device availability
- Smooth transitions between individual and group answer phases
- Reliable performance with 20-30 concurrent users (typical class size)

## Development Commands

### Project Structure
```
quizzler/
├── server/
│   └── index.js          # Express + Socket.io server
├── client/
│   ├── src/
│   │   ├── App.js        # Main React app with routing
│   │   ├── pages/
│   │   │   ├── AdminApp.js    # Admin dashboard
│   │   │   └── StudentApp.js  # Student interface
│   │   └── components/
│   │       ├── SessionCreator.js
│   │       └── SessionDashboard.js
│   └── package.json      # React app dependencies
├── package.json          # Server dependencies & scripts
├── ecosystem.config.js   # PM2 production config
└── deploy.md            # AWS EC2 deployment instructions
```

### Common Commands

#### Development
```bash
# Install all dependencies (server + client)
npm run install-all

# Start development (both server and client) - React dev server on :3000, Express on :8000
npm run dev

# Start only backend server on port 8000
npm run server

# Start only frontend React dev server on port 3000 (in separate terminal)
npm run client

# Build client for production and start production server
npm run build && npm start

# Build client only (creates client/build directory)
npm run build
```

#### Development Server Access
- **Development Mode**: Frontend http://localhost:3000 (proxies API to :8000)
- **Production Mode**: Full app http://localhost:8000 (serves built React + API)
- **Admin Creator**: http://localhost:8000/admin (embedded HTML interface)
- **Session Dashboard**: http://localhost:8000/dashboard/:sessionId (live session management)
- **Student Interface**: http://localhost:8000/student/:sessionId (built-in HTML interface)

#### Testing
```bash
# Run frontend tests (in client directory)
cd client && npm test

# Manual testing workflow:
# 1. Access /admin to create session with questions
# 2. Access / to see session list with Manage/Delete buttons  
# 3. Click Manage to open /dashboard/:sessionId for live control
# 4. Access /student/:sessionId for student interface testing

# No backend test scripts currently configured
```

#### Production Deployment
```bash
# Using PM2 (production process manager)
pm2 start ecosystem.config.js
pm2 status
pm2 logs quizzler
pm2 restart quizzler

# Direct production start (alternative)
npm run build && NODE_ENV=production npm start
```

#### Troubleshooting Local Development
```bash
# If port conflicts occur, kill processes:
pkill -f node
pkill -f nodemon

# Check what's using ports:
ss -tlnp | grep 3000
ss -tlnp | grep 3001
ss -tlnp | grep 8000

# WSL networking issues: Server runs on port 8000 by default
# Client proxy should point to http://localhost:8000 in client/package.json
```

### Architecture Notes

#### Backend (server/index.js)
- Express.js server with Socket.io integration
- RESTful API endpoints for session management
- In-memory data storage using Maps (sessions and responses)
- QR code generation using qrcode library
- Serves React build files in production mode
- WebSocket events for real-time communication

#### Frontend Architecture
- React Router for navigation (admin vs student interfaces)
- Socket.io-client for real-time communication
- State management using React hooks
- Responsive CSS design for mobile devices
- Local storage for device ID persistence

#### Key API Endpoints
- `GET /api/sessions` - List all sessions
- `POST /api/sessions` - Create new session
- `GET /api/sessions/:id` - Get session details
- `GET /api/sessions/:id/qr` - Generate QR code
- `POST /api/sessions/:id/start` - Start session
- `POST /api/sessions/:id/next-question` - Advance question
- `POST /api/sessions/:id/next-round` - Advance round
- `POST /api/sessions/:id/reveal-answer` - Reveal correct answer (Round 3)
- `POST /api/sessions/:id/back-round` - Go back one round with answer clearing
- `POST /api/sessions/:id/back-question` - Go back one question with answer clearing
- `POST /api/sessions/:id/submit` - Submit answer
- `GET /api/sessions/:id/results` - Get results
- `DELETE /api/sessions/:id` - Delete session

#### WebSocket Events
**Student Events:**
- `joinSession`, `sessionJoined`, `sessionStarted`
- `nextQuestion`, `nextRound`, `revealAnswer`, `sessionCompleted`

**Admin Events:**
- `joinAdminSession`, `newResponse`

**Event Data Structures:**
- `nextQuestion`: { question, questionIndex, round: 1 }
- `nextRound`: { question, questionIndex, round: 2 }
- `revealAnswer`: { question, questionIndex, correctAnswer, round: 3 }

### Development Notes
- **Dual Student Interfaces**: Server includes both a built-in HTML student interface at `/student/:sessionId` AND a React-based interface. The HTML interface is currently the primary working interface with full free-text support.
- Client app proxies API requests to backend via package.json proxy setting (client/package.json proxy: "http://localhost:8000")
- Production mode serves React build from Express static middleware
- Device IDs are generated and stored in localStorage for tracking responses
- Answer persistence allows player switching without losing selections
- Back navigation automatically clears responses to prevent double-counting
- Three-phase system provides educational value through answer revelation
- Correct answer selection uses radio button interface for intuitive admin experience

### Critical Development Information
- **Server Port**: Always runs on port 8000 (not 3001 as originally documented)
- **Free Text Implementation**: Fully implemented in the HTML student interface (`/student/:sessionId`) with support for mixed-mode questions (multiple choice + free text option)
- **Question Property Names**: Questions use `questionText` property (not `text`) - this is critical for proper data flow
- **React Dev Server Issues**: May require hard refresh (Ctrl+Shift+R) or cache clearing when making changes. The HTML interface reloads automatically via nodemon.

### Current Working Configuration (As of Latest Development)
- **Primary Student Interface**: `/student/:sessionId` (HTML-based, fully functional)
- **Admin Interface**: `/admin` (HTML-based) and `/dashboard/:sessionId` (React-based)
- **Free Text Support**: Complete in HTML student interface with visual styling
- **Question Data Structure**: 
  ```javascript
  {
    questionText: "Question content",  // NOT "text"
    answerOptions: ["option1", "option2"],
    correctAnswer: 0,
    hasFreetextOption: true,  // For mixed mode (MC + free text)
    isFreetext: false         // For pure free text questions
  }
  ```
- **Response Submission**: Includes `isOtherOption` flag for free text responses

### Common Development Issues & Solutions
- **Free Text Not Showing**: Check question has `hasFreetextOption: true` and refresh browser cache
- **Port Conflicts**: Server runs on 8000, client proxies from 3000 to 8000 (NOT 3001)
- **React Changes Not Updating**: Try hard refresh, clear cache, or use the HTML interface for immediate testing
- **Session Not Found**: Session IDs are UUIDs - ensure exact match including trailing characters

### Question Type System Implementation
The application supports three distinct question types through question object flags:

**Multiple Choice (default)**: `isFreetext: false, hasFreetextOption: false`
- Standard multiple choice with 2-6 predefined options
- Correct answer stored as index number
- Used for traditional quiz questions with clear correct answers

**Mixed Mode**: `isFreetext: false, hasFreetextOption: true` 
- Multiple choice options PLUS free text "Other" response capability
- Supports both structured and open-ended responses in one question
- Admin interface shows "Add Free Text Response" option

**Free Text Only**: `isFreetext: true`
- Pure text input with no predefined options
- Used for open-ended questions requiring detailed answers
- Admin interface shows "Free Text Response Only" option

### Admin Interface Architecture
Three distinct admin interfaces with different purposes:

1. **Session Creator** (`/admin` route): Embedded HTML interface for question building
   - Dynamic question type switching with conditional UI display
   - Real-time answer option management (add/remove options)
   - Client-side validation before submission
   - Question type radio buttons with live preview

2. **Session Dashboard** (`/dashboard/:sessionId`): Live session management
   - Real-time response monitoring via WebSocket events
   - Session control buttons for phase progression
   - QR code generation for student access
   - Response aggregation display with device/player tracking

3. **React Client Integration**: Production frontend served from `/`
   - React Router handles navigation between views
   - Development proxy routes API calls to Express server
   - Separation: embedded HTML for admin tools, React for student interface

### Data Storage and Response Management
**In-Memory Storage Architecture:**
- Sessions and responses stored in JavaScript Maps (non-persistent)
- Compound response keys: `${deviceId}-${playerNumber}-${questionIndex}-${round}`
- Response metadata includes timestamps, player numbers, round tracking

**Response Management System:**
- Answer persistence: Students can switch players without losing selections
- Strategic response clearing when navigating backwards to prevent double-counting
- Multi-round tracking: Same question can have different responses per round
- Device identification via localStorage for response attribution

### WebSocket Real-Time Communication
- Separate socket rooms: `session-${sessionId}` for students, `admin-${sessionId}` for admin
- Bidirectional events: Student join/response, admin monitoring
- State synchronization: All clients receive live updates for phase transitions
- Event data includes question content, round numbers, and correct answers

### Current Implementation Status
- **Core Features**: ✅ Complete three-phase quiz system with correct answer revelation
- **Question Types**: ✅ Multiple choice, free text, and mixed mode support
- **Admin Controls**: ✅ Three separate admin interfaces with full functionality
- **Student Experience**: ✅ Visual feedback, answer highlighting, and educational messaging
- **Data Persistence**: Currently uses in-memory storage (data lost on server restart)
- **Scalability**: Limited to single server instance due to in-memory storage
- **Production Ready**: Deployed on AWS EC2 with PM2, requires database for long-term persistence
- **Security**: Basic session-based access, no authentication system

### Feature Implementation Summary
**✅ Completed Features:**
- Three-phase quiz flow (Individual → Group → Answer Reveal)
- Three question types: Multiple choice, free text only, mixed mode
- Correct answer selection and storage with validation
- Visual answer feedback with correct/incorrect highlighting
- Back navigation for questions and rounds with response clearing
- Real-time synchronization between admin and student interfaces
- Three distinct admin interfaces: creator, dashboard, and React client
- Dynamic question building with live preview
- Production deployment with PM2 process management
- WSL development environment compatibility

**📋 Potential Enhancements:**
- Database integration for persistent storage (PostgreSQL/MongoDB)
- User authentication and session management
- Advanced analytics and reporting dashboard
- Question bank and template system
- Mobile app development for better device support
- Automated testing suite for backend and frontend
- Performance optimization for large classroom sizes (50+ students)

## Deployment Options

### Local Development
- Frontend: http://localhost:3000
- Backend: http://localhost:8000

### Production (AWS EC2)
- Single EC2 t2.micro instance (free tier)
- PM2 for process management
- Optional Nginx reverse proxy
- Detailed deployment guide in deploy.md

### Alternative Cloud Options
- AWS Amplify + Lambda + DynamoDB
- Heroku + MongoDB Atlas
- Vercel + Supabase