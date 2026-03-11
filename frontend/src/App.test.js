import { act, fireEvent, render, screen } from '@testing-library/react';
import App, { getApiUrl } from './App';

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
  const scene = screen.getByTestId('vr-scene');

  expect(screen.getByTestId('vr-shell')).toBeInTheDocument();
  expect(scene).toBeInTheDocument();
  expect(scene).not.toHaveAttribute('vr-mode-ui', 'enabled: false');
  expect(container.querySelector('[data-testid="terminal-plane"]')).not.toBeNull();
  expect(screen.queryByText(/terminal viewer/i)).not.toBeInTheDocument();
});

test('uses the current page origin for the backend when no API env override is set', () => {
  expect(getApiUrl({ origin: 'http://192.168.1.42:8081' })).toBe('http://192.168.1.42:8081');
});

test('maps the CRA development server port to the backend port', () => {
  expect(getApiUrl({
    origin: 'http://localhost:3000',
    protocol: 'http:',
    hostname: 'localhost',
    port: '3000',
  })).toBe('http://localhost:8081');
});

test('prefers an explicit API override when provided', () => {
  const originalApiUrl = process.env.REACT_APP_API_URL;
  process.env.REACT_APP_API_URL = 'https://api.example.com';

  expect(getApiUrl({ origin: 'http://localhost:3000' })).toBe('https://api.example.com');

  if (originalApiUrl === undefined) {
    delete process.env.REACT_APP_API_URL;
  } else {
    process.env.REACT_APP_API_URL = originalApiUrl;
  }
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
