# Quizzler - Interactive Classroom Quiz Application

A dual web application system for interactive classroom quizzing designed for 16-17 year old students. The system consists of a student-facing quiz interface and an administrative dashboard for teachers.

## Features

- **Student Interface**: Mobile-friendly quiz interface with 1 or 2 player modes
- **Administrative Dashboard**: Create questions, manage sessions, view live results
- **Real-time Communication**: Live updates using WebSocket technology
- **QR Code Access**: Students can quickly join using QR codes
- **Two-Round System**: Individual answers followed by group discussion
- **Player Switching**: Support for device sharing between students

## Quick Start

### Prerequisites

- Node.js (v16 or higher)
- npm

### Installation

1. Install server dependencies:
```bash
npm install
```

2. Install client dependencies:
```bash
npm run install-client
```

3. Start the development servers:
```bash
npm run dev
```

This will start both the backend server (port 3001) and React development server (port 3000).

### Alternative: Individual Commands

Start backend server:
```bash
npm run server
```

Start frontend (in a separate terminal):
```bash
npm run client
```

## Usage

### For Teachers (Admin Interface)

1. Navigate to `http://localhost:3000` (or your deployed URL)
2. Click "Create New Session"
3. Enter session name and add questions with answer options
4. Create the session and share the QR code with students
5. Start the session and manage question progression
6. View live results and participant responses

### For Students

1. Scan the QR code provided by the teacher
2. Select number of players (1 or 2)
3. Wait for the session to start
4. Answer questions in both individual and group rounds
5. Submit answers and wait for next questions

## Project Structure

```
quizzler/
├── server/
│   └── index.js          # Express server with Socket.io
├── client/
│   ├── public/           # Static files
│   └── src/
│       ├── components/   # React components
│       ├── pages/        # Main page components
│       └── utils/        # Utility functions
├── package.json          # Server dependencies
└── CLAUDE.md            # Detailed project specification
```

## API Endpoints

- `GET /api/sessions` - List all sessions
- `POST /api/sessions` - Create new session
- `GET /api/sessions/:id` - Get session details
- `GET /api/sessions/:id/qr` - Get QR code for session
- `POST /api/sessions/:id/start` - Start session
- `POST /api/sessions/:id/next-question` - Advance to next question
- `POST /api/sessions/:id/next-round` - Advance to next round
- `POST /api/sessions/:id/submit` - Submit student answer
- `GET /api/sessions/:id/results` - Get session results

## WebSocket Events

### Student Events
- `joinSession` - Join a quiz session
- `sessionJoined` - Confirmation of joining
- `sessionStarted` - Session has begun
- `nextQuestion` - New question available
- `nextRound` - Round 2 (group discussion) started
- `sessionCompleted` - Quiz finished

### Admin Events
- `joinAdminSession` - Join admin view for session
- `newResponse` - New student response received

## Deployment

### Production Build

```bash
npm run build
```

### AWS Deployment

The application is designed to work with AWS Free Tier:

1. **Frontend**: Deploy using AWS Amplify
2. **Backend**: Use AWS Lambda + API Gateway
3. **Database**: Amazon DynamoDB (replace in-memory storage)
4. **WebSockets**: AWS WebSocket API

## Technology Stack

- **Backend**: Node.js, Express.js, Socket.io
- **Frontend**: React.js, React Router
- **Real-time**: WebSocket (Socket.io)
- **QR Codes**: qrcode.js library
- **Styling**: CSS3 with responsive design

## Contributing

1. Follow the existing code style and conventions
2. Test both student and admin interfaces
3. Ensure mobile responsiveness
4. Test with multiple concurrent users

## License

MIT License