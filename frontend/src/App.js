import './App.css';
import { useCallback, useEffect, useRef, useState } from 'react';
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
    grid: snapshot.grid.map((row) => row.map((cell) => ({ ...cell }))),
  };
}

function App() {
  const [terminalSnapshot, setTerminalSnapshot] = useState(null);
  const [terminalFocused, setTerminalFocused] = useState(false);
  const [isVrActive, setIsVrActive] = useState(false);
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

  const handleTerminalKeyDown = useCallback((event) => {
    const encoded = encodeKeyEvent(event);
    if (!encoded) {
      return false;
    }

    event.preventDefault();
    event.stopPropagation();
    emitTerminalInput(encoded);

    return true;
  }, [emitTerminalInput]);

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

    const handleEnterVrState = () => setIsVrActive(true);
    const handleExitVrState = () => setIsVrActive(false);

    scene.addEventListener('enter-vr', handleEnterVrState);
    scene.addEventListener('exit-vr', handleExitVrState);

    return () => {
      scene.removeEventListener('enter-vr', handleEnterVrState);
      scene.removeEventListener('exit-vr', handleExitVrState);
    };
  }, []);

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
            snapshot={terminalSnapshot}
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
            position="0 2.9 -5.5"
            width="7.6"
            height="3.1"
            scale={TERMINAL_VR_SCALE}
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
