import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import StudentApp from './pages/StudentApp';
import AdminApp from './pages/AdminApp';
import './App.css';

function App() {
  return (
    <Router>
      <div className="App">
        <Routes>
          <Route path="/" element={<AdminApp />} />
          <Route path="/admin" element={<AdminApp />} />
          <Route path="/student/:sessionId" element={<StudentApp />} />
        </Routes>
      </div>
    </Router>
  );
}

export default App;