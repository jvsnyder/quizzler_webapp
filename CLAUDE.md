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
- Two-round answering system:
  - Round 1: Individual answers
  - Round 2: Group discussion and consensus answers
- Player switching functionality with answer persistence
- Real-time question display synchronized with teacher's presentation

### Administrative Web App
- Question management interface
- Configurable answer options (variable number of choices)
- Live results dashboard showing student responses
- Question progression controls
- Session management

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
- current_round (1 or 2)
- status (active/inactive)

Questions:
- question_id (primary key)
- session_id (foreign key)
- question_text
- answer_options (JSON array)
- order_index

Responses:
- response_id (primary key)
- session_id (foreign key)
- question_id (foreign key)
- device_id (to track unique devices)
- player_number (1 or 2)
- round_number (1 or 2)
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
   - Automatic progression from Round 1 to Round 2
   - Different UI states for each round
   - Wait screens between questions

### Administrative Interface
1. **Session Management**
   - Create new quiz sessions
   - Generate QR codes for student access
   - Start/stop sessions

2. **Question Setup**
   - Add multiple questions to session
   - Configure number of answer choices (2-6 options)
   - Edit answer text
   - Reorder questions

3. **Live Dashboard**
   - Real-time response tracking
   - Visual charts showing answer distribution
   - Breakdown by round (individual vs group)
   - Device/player participation metrics

4. **Session Controls**
   - Advance to next question
   - Switch between rounds
   - Reset responses
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
3. Add questions and answer options
4. Display QR code for students
5. Start session
6. Display question on presentation
7. Monitor live responses
8. Advance to Round 2
9. Monitor group responses
10. Advance to next question
11. Repeat steps 6-10

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

# Start development (both server and client)
npm run dev

# Start only backend server
npm run server

# Start only frontend (in separate terminal)
npm run client

# Build client for production
npm run build
```

#### Testing
- No test scripts currently configured
- Client uses react-scripts test framework
- Manual testing through browser interfaces

#### Production Deployment
```bash
# Using PM2 (production process manager)
pm2 start ecosystem.config.js
pm2 status
pm2 logs quizzler
pm2 restart quizzler
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
- `POST /api/sessions/:id/submit` - Submit answer
- `GET /api/sessions/:id/results` - Get results

#### WebSocket Events
**Student Events:**
- `joinSession`, `sessionJoined`, `sessionStarted`
- `nextQuestion`, `nextRound`, `sessionCompleted`

**Admin Events:**
- `joinAdminSession`, `newResponse`

### Development Notes
- The server includes a temporary HTML student interface at `/student/:sessionId` for testing
- Client app proxies API requests to backend via package.json proxy setting
- Production mode serves React build from Express static middleware
- Device IDs are generated and stored in localStorage for tracking responses
- Answer persistence allows player switching without losing selections

## Deployment Options

### Local Development
- Frontend: http://localhost:3000
- Backend: http://localhost:3001

### Production (AWS EC2)
- Single EC2 t2.micro instance (free tier)
- PM2 for process management
- Optional Nginx reverse proxy
- Detailed deployment guide in deploy.md

### Alternative Cloud Options
- AWS Amplify + Lambda + DynamoDB
- Heroku + MongoDB Atlas
- Vercel + Supabase