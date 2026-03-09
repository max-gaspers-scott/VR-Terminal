import { act, fireEvent, render, screen } from '@testing-library/react';
import App from './App';

function createSnapshot(ch = ' ') {
  return {
    rows: 1,
    cols: 1,
    cursor_row: 0,
    cursor_col: 0,
    grid: [[{
      ch,
      fg: [255, 255, 255],
      bg: [0, 0, 0],
      bold: false,
      underline: false,
      reverse: false,
    }]],
  };
}

function createMockContext() {
  return {
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
  };
}

let mockContext;

beforeEach(() => {
  mockContext = createMockContext();
  jest.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(mockContext);
});

afterEach(() => {
  jest.restoreAllMocks();
});

test('renders the terminal viewer shell', () => {
  const { container } = render(<App />);

  expect(screen.getByTestId('vr-shell')).toBeInTheDocument();
  expect(screen.getByTestId('vr-scene')).toBeInTheDocument();
  expect(container.querySelector('[data-testid="terminal-plane"]')).not.toBeNull();
  expect(screen.queryByText(/terminal viewer/i)).not.toBeInTheDocument();
});

test('captures ctrl slash from document while terminal is focused', () => {
  const originalIo = window.io;
  const socketHandlers = {};
  const socket = {
    on: jest.fn((eventName, handler) => {
      socketHandlers[eventName] = handler;
    }),
    emit: jest.fn(),
    close: jest.fn(),
    connected: true,
  };

  window.io = jest.fn(() => socket);

  const { container } = render(<App />);
  const shell = container.querySelector('.vr-shell');

  expect(window.io).toHaveBeenCalled();
  expect(shell).not.toBeNull();

  fireEvent.focus(shell);
  fireEvent.keyDown(document, { key: '/', code: 'Slash', ctrlKey: true });

  expect(socket.emit).toHaveBeenCalledWith('terminal-input', '\x1f');

  window.io = originalIo;
});

test('clones incoming terminal snapshots so mutated socket payloads still repaint', () => {
  const originalIo = window.io;
  const socketHandlers = {};
  const socket = {
    on: jest.fn((eventName, handler) => {
      socketHandlers[eventName] = handler;
    }),
    emit: jest.fn(),
    close: jest.fn(),
    connected: true,
  };
  const snapshot = createSnapshot('A');

  window.io = jest.fn(() => socket);

  render(<App />);

  jest.clearAllMocks();

  act(() => {
    socketHandlers['terminal-grid'](snapshot);
  });

  expect(mockContext.fillText).toHaveBeenCalledWith('A', expect.any(Number), expect.any(Number));

  jest.clearAllMocks();
  snapshot.grid[0][0].ch = ' ';

  act(() => {
    socketHandlers['terminal-grid'](snapshot);
  });

  expect(mockContext.fillRect).toHaveBeenCalled();
  expect(mockContext.fillText).toHaveBeenCalledWith(
    'Terminal connected. Waiting for output…',
    expect.any(Number),
    expect.any(Number),
  );

  window.io = originalIo;
});
