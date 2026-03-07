import logo from './logo.svg';
import './App.css';
import { useState } from 'react';

function App() {
  const [apiStatus, setApiStatus] = useState('');

  const checkApiHealth = async () => {
    const apiUrl = process.env.REACT_APP_API_URL || 'http://localhost:8081';
    try {
      const response = await fetch(`${apiUrl}/health`);
      if (response.ok) {
        const data = await response.text();
        // The user said the endpoint should return 'healthy' or an error.
        // We will check if the response body contains 'healthy'.
        if (data.toLowerCase().includes('healthy')) {
          setApiStatus('Backend API is healthy!');
        } else {
          setApiStatus(`Backend API is unhealthy. Response: ${data}`);
        }
      } else {
        setApiStatus(`Error: Backend API returned status ${response.status}`);
      }
    } catch (error) {
      console.error('Error checking API health:', error);
      setApiStatus('Error: Could not connect to the backend API.');
    }
  };

  return (
    <div className="App">
      <header className="App-header">
        <img src={logo} className="App-logo" alt="logo" />
        <p>
          Click the button to check the backend API health.
        </p>
        <button onClick={checkApiHealth} className="App-button">
          Check API Health
        </button>
        {apiStatus && <p>{apiStatus}</p>}
        <a
          className="App-link"
          href="https://reactjs.org"
          target="_blank"
          rel="noopener noreferrer"
        >
          Learn React
        </a>
      </header>
    </div>
  );
}

export default App;
