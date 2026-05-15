import { act, fireEvent, render, screen } from '@testing-library/react';
import App from './App';

describe('Keymap functionality', () => {
  let socket;
  let socketHandlers = {};

  beforeEach(() => {
    socketHandlers = {};
    socket = {
      on: jest.fn((eventName, handler) => {
        socketHandlers[eventName] = handler;
      }),
      emit: jest.fn(),
      close: jest.fn(),
      connected: true,
    };
    window.io = jest.fn(() => socket);
    jest.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
      setTransform: jest.fn(),
      clearRect: jest.fn(),
      fillRect: jest.fn(),
      fillText: jest.fn(),
      strokeRect: jest.fn(),
      beginPath: jest.fn(),
      rect: jest.fn(),
      clip: jest.fn(),
      save: jest.fn(),
      restore: jest.fn(),
      moveTo: jest.fn(),
      lineTo: jest.fn(),
      stroke: jest.fn(),
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  const activateKeymap = (shell) => {
    fireEvent.keyDown(document, { key: '/' });
    fireEvent.keyDown(document, { key: 'k' });
    fireEvent.keyDown(document, { key: 'e' });
    fireEvent.keyDown(document, { key: 'y' });
    fireEvent.keyDown(document, { key: 'm' });
    fireEvent.keyDown(document, { key: 'a' });
    fireEvent.keyDown(document, { key: 'p' });
    fireEvent.keyDown(document, { key: 'Enter' });
  };

  test('toggles keymap with /keymap', () => {
    const { rerender } = render(<App />);
    const shell = screen.getByTestId('vr-shell');
    fireEvent.focus(shell);

    activateKeymap(shell);

    // After activation, holding 'f' (Ctrl) and pressing 'c' should send Ctrl+C (\x03)
    fireEvent.keyDown(document, { code: 'KeyF' });
    fireEvent.keyDown(document, { key: 'c', code: 'KeyC' });
    expect(socket.emit).toHaveBeenCalledWith('terminal-input', '\x03');

    // KeyUp KeyF to clean up
    fireEvent.keyUp(document, { code: 'KeyF' });

    // Toggle off
    activateKeymap(shell);
    socket.emit.mockClear();

    // Now holding 'f' and pressing 'c' should send 'f' then 'c'
    fireEvent.keyDown(document, { key: 'f', code: 'KeyF' });
    fireEvent.keyDown(document, { key: 'c', code: 'KeyC' });
    expect(socket.emit).toHaveBeenCalledWith('terminal-input', 'f');
    expect(socket.emit).toHaveBeenCalledWith('terminal-input', 'c');
  });

  test('home-row modifiers work', () => {
    render(<App />);
    const shell = screen.getByTestId('vr-shell');
    fireEvent.focus(shell);
    activateKeymap(shell);
    socket.emit.mockClear();

    // KeyF -> Ctrl
    fireEvent.keyDown(document, { code: 'KeyF' });
    fireEvent.keyDown(document, { key: 'c', code: 'KeyC' });
    expect(socket.emit).toHaveBeenCalledWith('terminal-input', '\x03');
    fireEvent.keyUp(document, { code: 'KeyF' });
    socket.emit.mockClear();

    // KeyS -> Alt
    fireEvent.keyDown(document, { code: 'KeyS' });
    fireEvent.keyDown(document, { key: 'b', code: 'KeyB' });
    expect(socket.emit).toHaveBeenCalledWith('terminal-input', '\x1bb');
    fireEvent.keyUp(document, { code: 'KeyS' });
    socket.emit.mockClear();

    // KeyD -> Shift
    fireEvent.keyDown(document, { code: 'KeyD' });
    fireEvent.keyDown(document, { key: '1', code: 'Digit1' });
    expect(socket.emit).toHaveBeenCalledWith('terminal-input', '!');
    fireEvent.keyUp(document, { code: 'KeyD' });
    socket.emit.mockClear();

    // KeyA -> Meta
    fireEvent.keyDown(document, { code: 'KeyA' });
    fireEvent.keyDown(document, { key: 'x', code: 'KeyX' });
    // Meta keys are currently ignored by encodeKeyEvent in terminalInput.js (returns null)
    expect(socket.emit).not.toHaveBeenCalled();
    fireEvent.keyUp(document, { code: 'KeyA' });
  });

  test('tap home-row key sends the key itself', () => {
    render(<App />);
    const shell = screen.getByTestId('vr-shell');
    fireEvent.focus(shell);
    activateKeymap(shell);
    socket.emit.mockClear();

    fireEvent.keyDown(document, { code: 'KeyF' });
    fireEvent.keyUp(document, { code: 'KeyF' });
    expect(socket.emit).toHaveBeenCalledWith('terminal-input', 'f');
  });

  test('multiple modifiers work together', () => {
    render(<App />);
    const shell = screen.getByTestId('vr-shell');
    fireEvent.focus(shell);
    activateKeymap(shell);
    socket.emit.mockClear();

    // Hold KeyF (Ctrl) and KeyS (Alt)
    fireEvent.keyDown(document, { code: 'KeyF' });
    fireEvent.keyDown(document, { code: 'KeyS' });
    fireEvent.keyDown(document, { key: 'x', code: 'KeyX' });

    // Ctrl+X is \x18. Alt + Ctrl+X is \x1b\x18
    expect(socket.emit).toHaveBeenCalledWith('terminal-input', '\x1b\x18');
  });

  test('shift modifier transforms home-row key tap', () => {
    render(<App />);
    const shell = screen.getByTestId('vr-shell');
    fireEvent.focus(shell);
    activateKeymap(shell);
    socket.emit.mockClear();

    // Hold KeyK (Shift) and tap KeyJ (j)
    fireEvent.keyDown(document, { code: 'KeyK' });
    fireEvent.keyDown(document, { code: 'KeyJ' });
    fireEvent.keyUp(document, { code: 'KeyJ' });

    // Should send 'J'
    expect(socket.emit).toHaveBeenCalledWith('terminal-input', 'J');
  });
});
