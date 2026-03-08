import './App.css';
import { useEffect, useMemo, useRef, useState } from 'react';
import TerminalCanvas from './TerminalCanvas';
import { encodeKeyEvent } from './terminalInput';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:8081';

function App() {
  const [apiStatus, setApiStatus] = useState('');
  const [socketStatus, setSocketStatus] = useState('connecting');
  const [socketError, setSocketError] = useState('');
  const [terminalSnapshot, setTerminalSnapshot] = useState(null);
  const [terminalFocused, setTerminalFocused] = useState(false);
  const socketRef = useRef(null);
  const terminalShellRef = useRef(null);

  useEffect(() => {
    if (typeof window.io !== 'function') {
      setSocketStatus('client-missing');
      setSocketError('Socket.IO client script is not loaded.');
      return undefined;
    }

    const socket = window.io(API_URL, { path: '/socket.io' });
    socketRef.current = socket;

    socket.on('connect', () => {
      setSocketStatus('connected');
      setSocketError('');
      terminalShellRef.current?.focus();
    });

    socket.on('disconnect', () => {
      setSocketStatus('disconnected');
    });

    socket.on('connect_error', (error) => {
      setSocketStatus('error');
      setSocketError(error.message);
    });

    socket.on('terminal-grid', (snapshot) => {
      setTerminalSnapshot(snapshot);
    });

    return () => {
      socketRef.current = null;
      socket.close();
    };
  }, []);

  const dimensionsLabel = useMemo(() => {
    if (!terminalSnapshot) {
      return 'waiting for grid';
    }

    return `${terminalSnapshot.cols} × ${terminalSnapshot.rows}`;
  }, [terminalSnapshot]);

  const checkApiHealth = async () => {
    try {
      const response = await fetch(`${API_URL}/health`);
      if (response.ok) {
        const data = await response.text();
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

  const handleTerminalKeyDown = (event) => {
    const encoded = encodeKeyEvent(event);
    if (!encoded) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    if (socketRef.current?.connected) {
      socketRef.current.emit('terminal-input', encoded);
    }
  };

  return (
    <div className="App">
      <div className="App-shell">
        <div className="App-toolbar">
          <div>
            <h1>Terminal Viewer</h1>
            <p>Live canvas rendering for the streamed terminal grid.</p>
          </div>
          <div className="App-actions">
            <button onClick={checkApiHealth} className="App-button">
              Check API Health
            </button>
            <span className={`status-pill status-${socketStatus}`}>
              Socket: {socketStatus}
            </span>
            <span className="status-pill">Grid: {dimensionsLabel}</span>
          </div>
        </div>

        {apiStatus && <p className="info-banner">{apiStatus}</p>}
        {socketError && <p className="info-banner info-banner-error">{socketError}</p>}
        <p className="terminal-hint">
          {terminalFocused ? 'Terminal focused — keyboard input goes to the PTY.' : 'Click the terminal to focus it, then type to send input to the PTY.'}
        </p>

        <div
          ref={terminalShellRef}
          className={`terminal-shell ${terminalFocused ? 'terminal-shell-focused' : ''}`}
          tabIndex={0}
          onFocus={() => setTerminalFocused(true)}
          onBlur={() => setTerminalFocused(false)}
          onKeyDown={handleTerminalKeyDown}
          onMouseDown={() => terminalShellRef.current?.focus()}
        >
          <TerminalCanvas snapshot={terminalSnapshot} />
        </div>
      </div>
    </div>
  );
}

export default App;
