import React, { useState } from 'react';

const SessionCreator = ({ onCreateSession }) => {
  const [sessionName, setSessionName] = useState('');
  const [questions, setQuestions] = useState([{
    questionText: '',
    answerOptions: ['', ''],
    correctAnswer: 0,
    hasFreetextOption: false
  }]);

  const addQuestion = () => {
    setQuestions([...questions, {
      questionText: '',
      answerOptions: ['', ''],
      correctAnswer: 0,
      hasFreetextOption: false
    }]);
  };

  const removeQuestion = (index) => {
    if (questions.length > 1) {
      setQuestions(questions.filter((_, i) => i !== index));
    }
  };

  const updateQuestion = (index, field, value) => {
    const updatedQuestions = [...questions];
    updatedQuestions[index][field] = value;
    setQuestions(updatedQuestions);
  };

  const addAnswerOption = (questionIndex) => {
    const updatedQuestions = [...questions];
    updatedQuestions[questionIndex].answerOptions.push('');
    setQuestions(updatedQuestions);
  };

  const removeAnswerOption = (questionIndex, optionIndex) => {
    const updatedQuestions = [...questions];
    if (updatedQuestions[questionIndex].answerOptions.length > 2) {
      updatedQuestions[questionIndex].answerOptions.splice(optionIndex, 1);
      // Adjust correct answer index if needed
      if (updatedQuestions[questionIndex].correctAnswer >= optionIndex) {
        updatedQuestions[questionIndex].correctAnswer = Math.max(0, updatedQuestions[questionIndex].correctAnswer - 1);
      }
      setQuestions(updatedQuestions);
    }
  };

  const updateAnswerOption = (questionIndex, optionIndex, value) => {
    const updatedQuestions = [...questions];
    updatedQuestions[questionIndex].answerOptions[optionIndex] = value;
    setQuestions(updatedQuestions);
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    
    if (!sessionName.trim()) {
      alert('Please enter a session name');
      return;
    }

    const invalidQuestions = questions.some(q => 
      !q.questionText.trim() || 
      q.answerOptions.some(option => !option.trim())
    );

    if (invalidQuestions) {
      alert('Please fill in all question texts and answer options');
      return;
    }

    onCreateSession({
      name: sessionName,
      questions: questions.map(q => ({
        questionText: q.questionText.trim(),
        answerOptions: q.answerOptions.map(option => option.trim()),
        correctAnswer: q.correctAnswer,
        hasFreetextOption: q.hasFreetextOption
      }))
    });
  };

  return (
    <div className="card">
      <form onSubmit={handleSubmit}>
        <div className="form-group">
          <label className="form-label">Session Name</label>
          <input
            type="text"
            className="form-input"
            value={sessionName}
            onChange={(e) => setSessionName(e.target.value)}
            placeholder="Enter session name (e.g., Chapter 5 Quiz)"
            required
          />
        </div>

        <h3>Questions</h3>
        
        {questions.map((question, questionIndex) => (
          <div key={questionIndex} className="card" style={{ marginBottom: '20px', backgroundColor: '#f8f9fa' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h4>Question {questionIndex + 1}</h4>
              {questions.length > 1 && (
                <button
                  type="button"
                  className="btn btn-danger"
                  style={{ padding: '8px 12px', fontSize: '14px' }}
                  onClick={() => removeQuestion(questionIndex)}
                >
                  Remove
                </button>
              )}
            </div>

            <div className="form-group">
              <label className="form-label">Question Text</label>
              <textarea
                className="form-input form-textarea"
                value={question.questionText}
                onChange={(e) => updateQuestion(questionIndex, 'questionText', e.target.value)}
                placeholder="Enter your question here..."
                required
              />
            </div>

            <div className="form-group">
              <label className="form-label">Answer Options</label>
              {question.answerOptions.map((option, optionIndex) => (
                <div key={optionIndex} style={{ display: 'flex', gap: '8px', marginBottom: '8px', alignItems: 'center' }}>
                  <input
                    type="radio"
                    name={`correct-${questionIndex}`}
                    checked={question.correctAnswer === optionIndex}
                    onChange={() => updateQuestion(questionIndex, 'correctAnswer', optionIndex)}
                    style={{ marginRight: '8px' }}
                  />
                  <input
                    type="text"
                    className="form-input"
                    value={option}
                    onChange={(e) => updateAnswerOption(questionIndex, optionIndex, e.target.value)}
                    placeholder={`Answer option ${optionIndex + 1}`}
                    required
                    style={{ flex: 1 }}
                  />
                  {question.answerOptions.length > 2 && (
                    <button
                      type="button"
                      className="btn btn-danger"
                      style={{ padding: '8px 12px', fontSize: '14px' }}
                      onClick={() => removeAnswerOption(questionIndex, optionIndex)}
                    >
                      ×
                    </button>
                  )}
                </div>
              ))}
              
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '12px', marginBottom: '8px' }}>
                <p style={{ fontSize: '14px', color: '#666', margin: '0' }}>
                  Select the radio button next to the correct answer
                </p>
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '14px' }}>
                  <input
                    type="checkbox"
                    checked={question.hasFreetextOption}
                    onChange={(e) => updateQuestion(questionIndex, 'hasFreetextOption', e.target.checked)}
                  />
                  Allow "Other (specify)" option
                </label>
              </div>
              
              {question.hasFreetextOption && (
                <div style={{ 
                  background: '#f8f9fa', 
                  padding: '12px', 
                  borderRadius: '6px', 
                  border: '1px solid #dee2e6',
                  marginBottom: '8px'
                }}>
                  <p style={{ fontSize: '14px', color: '#666', margin: '0', fontStyle: 'italic' }}>
                    ✓ Students will see an additional "Other (specify)" option where they can enter custom text
                  </p>
                </div>
              )}
              
              {question.answerOptions.length < 6 && (
                <button
                  type="button"
                  className="btn btn-secondary"
                  style={{ padding: '8px 16px', fontSize: '14px', marginTop: '8px' }}
                  onClick={() => addAnswerOption(questionIndex)}
                >
                  Add Answer Option
                </button>
              )}
            </div>
          </div>
        ))}

        <div style={{ display: 'flex', gap: '12px', marginTop: '20px' }}>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={addQuestion}
          >
            Add Question
          </button>
          
          <button
            type="submit"
            className="btn btn-success"
          >
            Create Session
          </button>
        </div>
      </form>
    </div>
  );
};

export default SessionCreator;