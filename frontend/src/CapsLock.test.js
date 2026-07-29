import { fireEvent, render, screen } from '@testing-library/react';
import App from './App';

describe('CapsLock remapping', () => {
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

  const activateKeymap = () => {
    fireEvent.keyDown(document, { key: '/' });
    fireEvent.keyDown(document, { key: 'k' });
    fireEvent.keyDown(document, { key: 'e' });
    fireEvent.keyDown(document, { key: 'y' });
    fireEvent.keyDown(document, { key: 'm' });
    fireEvent.keyDown(document, { key: 'a' });
    fireEvent.keyDown(document, { key: 'p' });
    fireEvent.keyDown(document, { key: 'Enter' });
  };

  test('CapsLock sends Escape when keymap is enabled', () => {
    render(<App />);
    const shell = screen.getByTestId('vr-shell');
    fireEvent.focus(shell);
    activateKeymap();
    socket.emit.mockClear();

    fireEvent.keyDown(document, { code: 'CapsLock' });
    expect(socket.emit).toHaveBeenCalledWith('terminal-input', '\x1b');
  });
});
