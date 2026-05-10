import './App.css';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import TerminalCanvas from './TerminalCanvas';
import { encodeKeyEvent } from './terminalInput';

const TERMINAL_VR_SCALE = '2 2 1';

export function getApiUrl(location = typeof window !== 'undefined' ? window.location : undefined) {
  const configuredApiUrl = process.env.REACT_APP_API_URL?.trim();

  if (configuredApiUrl) {
    return configuredApiUrl;
  }

  if (location?.origin && location.origin !== 'null') {
    if (location.protocol && location.hostname && location.port === '3000') {
      return `${location.protocol}//${location.hostname}:8081`;
    }

    return location.origin;
  }

  return 'http://localhost:8081';
}

function cloneTerminalSnapshot(snapshot) {
  return {
    ...snapshot,
    grid: snapshot.grid.map((row) => ({
      ...row,
      cells: row.cells.map((cell) => ({ ...cell })),
    })),
  };
}

function App() {
  const [terminalSnapshot, setTerminalSnapshot] = useState(null);
  const [terminalFocused, setTerminalFocused] = useState(false);
  const [isVrActive, setIsVrActive] = useState(false);
  const [screenPosition, setScreenPosition] = useState({ x: 0, y: 5, z: -5.5 });
  const [commandBuffer, setCommandBuffer] = useState('');

  const sceneRef = useRef(null);
  const socketRef = useRef(null);
  const terminalShellRef = useRef(null);
  const terminalCanvasRef = useRef(null);
  const terminalPlaneRef = useRef(null);
  const terminalTextureRef = useRef(null);

  useEffect(() => {
    if (typeof window.io !== 'function') {
      return undefined;
    }

    const socket = window.io(getApiUrl(), { path: '/socket.io' });
    socketRef.current = socket;

    socket.on('connect', () => {
      terminalShellRef.current?.focus();
    });

    socket.on('disconnect', () => {});
    socket.on('connect_error', () => {});

    socket.on('terminal-grid', (snapshot) => {
      setTerminalSnapshot(cloneTerminalSnapshot(snapshot));
    });

    return () => {
      socketRef.current = null;
      socket.close();
    };
  }, []);

  const emitTerminalInput = useCallback((encoded) => {
    if (socketRef.current?.connected) {
      socketRef.current.emit('terminal-input', encoded);
    }
  }, []);

  const SPECIAL_COMMANDS = useMemo(() => ({
    '/up': () => setScreenPosition((pos) => ({ ...pos, y: pos.y + 2 })),
    '/down': () => setScreenPosition((pos) => ({ ...pos, y: pos.y - 2 })),
    '/left': () => setScreenPosition((pos) => ({ ...pos, x: pos.x - 3.025 })),
    '/right': () => setScreenPosition((pos) => ({ ...pos, x: pos.x + 3.025 })),
  }), []);

  const isPrefixOfCommand = useCallback((str) => {
    return Object.keys(SPECIAL_COMMANDS).some((cmd) => cmd.startsWith(str));
  }, [SPECIAL_COMMANDS]);

  const handleTerminalKeyDown = useCallback((event) => {
    const encoded = encodeKeyEvent(event);
    if (!encoded) {
      return false;
    }

    const isPrintable = event.key.length === 1 && !event.ctrlKey && !event.altKey && !event.metaKey;

    if (commandBuffer || event.key === '/') {
      if (isPrintable) {
        const newBuffer = commandBuffer + event.key;
        if (isPrefixOfCommand(newBuffer)) {
          setCommandBuffer(newBuffer);
          event.preventDefault();
          event.stopPropagation();
          return true;
        }

        emitTerminalInput(commandBuffer + event.key);
        setCommandBuffer('');
        event.preventDefault();
        event.stopPropagation();
        return true;
      }

      if (event.key === 'Enter') {
        if (SPECIAL_COMMANDS[commandBuffer]) {
          SPECIAL_COMMANDS[commandBuffer]();
        } else {
          emitTerminalInput(commandBuffer + '\r');
        }
        setCommandBuffer('');
        event.preventDefault();
        event.stopPropagation();
        return true;
      }

      if (event.key === 'Backspace') {
        if (commandBuffer.length > 0) {
          setCommandBuffer(commandBuffer.slice(0, -1));
          event.preventDefault();
          event.stopPropagation();
          return true;
        }
      } else if (event.key === 'Escape') {
        emitTerminalInput(commandBuffer + '\x1b');
        setCommandBuffer('');
        event.preventDefault();
        event.stopPropagation();
        return true;
      } else {
        emitTerminalInput(commandBuffer + encoded);
        setCommandBuffer('');
        event.preventDefault();
        event.stopPropagation();
        return true;
      }
    }

    event.preventDefault();
    event.stopPropagation();
    emitTerminalInput(encoded);

    return true;
  }, [commandBuffer, emitTerminalInput, SPECIAL_COMMANDS, isPrefixOfCommand]);

  const displaySnapshot = useMemo(() => {
    if (!terminalSnapshot) {
      return null;
    }

    if (!commandBuffer) {
      return terminalSnapshot;
    }

    const snapshot = cloneTerminalSnapshot(terminalSnapshot);
    let { cursor_row: r, cursor_col: c } = snapshot;

    for (let i = 0; i < commandBuffer.length; i += 1) {
      if (c >= snapshot.cols) {
        c = 0;
        r += 1;
      }

      if (r >= snapshot.rows) {
        break;
      }

      const row = snapshot.grid[r];
      if (row) {
        row.cells[c] = {
          ch: commandBuffer[i],
          fg: [255, 255, 255],
          bg: [50, 50, 150],
          bold: true,
          underline: false,
          reverse: false,
        };
        row.revision += 1;
      }

      c += 1;
    }

    snapshot.cursor_row = r;
    snapshot.cursor_col = c;

    return snapshot;
  }, [terminalSnapshot, commandBuffer]);

  useEffect(() => {
    if (!terminalFocused) {
      return undefined;
    }

    const handleDocumentKeyDown = (event) => {
      handleTerminalKeyDown(event);
    };

    document.addEventListener('keydown', handleDocumentKeyDown, true);

    return () => {
      document.removeEventListener('keydown', handleDocumentKeyDown, true);
    };
  }, [handleTerminalKeyDown, terminalFocused]);

  useEffect(() => {
    const scene = sceneRef.current;

    if (!scene) {
      return undefined;
    }

    const applyVrModeUi = () => {
      scene.setAttribute('vr-mode-ui', 'enabled: true; cardboardModeEnabled: true');
    };

    applyVrModeUi();
    scene.addEventListener('loaded', applyVrModeUi);

    return () => {
      scene.removeEventListener('loaded', applyVrModeUi);
    };
  }, []);

  useEffect(() => {
    const scene = sceneRef.current;

    if (!scene) {
      return undefined;
    }

    const handleEnterVrState = () => {
      setIsVrActive(true);
      // Force focus back to the terminal shell when entering VR
      // This ensures keyboard input is captured even in VR mode
      setTimeout(() => {
        terminalShellRef.current?.focus();
        setTerminalFocused(true);
      }, 100);
    };
    const handleExitVrState = () => {
      setIsVrActive(false);
      setTerminalFocused(false);
    };

    scene.addEventListener('enter-vr', handleEnterVrState);
    scene.addEventListener('exit-vr', handleExitVrState);

    return () => {
      scene.removeEventListener('enter-vr', handleEnterVrState);
      scene.removeEventListener('exit-vr', handleExitVrState);
    };
  }, []);

  // Periodically refocus the terminal shell while in VR mode
  // VR headsets can steal focus, so we reinforce it every 2 seconds
  useEffect(() => {
    if (!isVrActive) {
      return undefined;
    }

    const focusInterval = setInterval(() => {
      // Only refocus if the shell doesn't already have focus
      if (document.activeElement !== terminalShellRef.current) {
        terminalShellRef.current?.focus();
        setTerminalFocused(true);
      }
    }, 2000);

    return () => {
      clearInterval(focusInterval);
    };
  }, [isVrActive]);

  const handleEnterVr = useCallback(() => {
    const scene = sceneRef.current;

    if (!scene?.enterVR) {
      return;
    }

    try {
      const result = scene.enterVR();
      if (typeof result?.catch === 'function') {
        result.catch(() => {});
      }
    } catch (error) {
      // Ignore here; the important part is exposing a direct user-gesture entry path.
    }
  }, []);

  useEffect(() => {
    const plane = terminalPlaneRef.current;
    const canvas = terminalCanvasRef.current;
    const { THREE } = window;

    if (!plane || !canvas || !THREE) {
      return undefined;
    }

    let disposed = false;

    const applyCanvasTexture = () => {
      if (disposed || terminalTextureRef.current) {
        return;
      }

      const mesh = plane.getObject3D?.('mesh') || plane.object3D?.children?.[0];
      if (!mesh) {
        return;
      }

      const material = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material;
      if (!material) {
        return;
      }

      const texture = new THREE.CanvasTexture(canvas);
      texture.needsUpdate = true;
      terminalTextureRef.current = texture;
      material.map = texture;
      material.color = new THREE.Color('#ffffff');
      material.needsUpdate = true;
    };

    applyCanvasTexture();
    plane.addEventListener('loaded', applyCanvasTexture);

    return () => {
      disposed = true;
      plane.removeEventListener('loaded', applyCanvasTexture);

      if (terminalTextureRef.current) {
        terminalTextureRef.current.dispose();
        terminalTextureRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      if (terminalTextureRef.current) {
        terminalTextureRef.current.needsUpdate = true;
      }
    });

    return () => {
      window.cancelAnimationFrame(frame);
    };
  }, [terminalSnapshot]);

  return (
    <div className="App">
      <div
        ref={terminalShellRef}
        data-testid="vr-shell"
        className={`vr-shell ${terminalFocused ? 'vr-shell-focused' : ''}`}
        tabIndex={0}
        onFocus={() => setTerminalFocused(true)}
        onBlur={() => setTerminalFocused(false)}
        onMouseDown={() => terminalShellRef.current?.focus()}
      >
        <div className="terminal-texture-source" aria-hidden="true">
          <TerminalCanvas
            ref={terminalCanvasRef}
            snapshot={displaySnapshot}
            showPlaceholder={false}
            canvasId="terminal-canvas-texture"
            className="terminal-texture-canvas"
          />
        </div>

        <a-scene
          ref={sceneRef}
          embedded
          data-testid="vr-scene"
          className="vr-scene"
          renderer="colorManagement: true; antialias: true"
        >
          <a-entity position="0 1.6 0">
            <a-camera wasd-controls-enabled="false"></a-camera>
          </a-entity>
          <a-entity light="type: ambient; intensity: 0.85; color: #c8d7ff"></a-entity>
          <a-entity light="type: directional; intensity: 0.65; color: #ffffff" position="-1 3 2"></a-entity>
          <a-plane position="0 0 -4" rotation="-90 0 0" width="30" height="30" color="#11161d"></a-plane>
          <a-sky color="#05070a"></a-sky>
          <a-plane
            ref={terminalPlaneRef}
            data-testid="terminal-plane"
            position={`${screenPosition.x} ${screenPosition.y} ${screenPosition.z}`}
            width="12.1"
            height="8"
            color="#000000"
            material="shader: flat"
          ></a-plane>
        </a-scene>

        {!isVrActive && (
          <button
            type="button"
            className="vr-enter-button"
            onClick={handleEnterVr}
          >
            Enter VR
          </button>
        )}
      </div>
    </div>
  );
}

export default App;
