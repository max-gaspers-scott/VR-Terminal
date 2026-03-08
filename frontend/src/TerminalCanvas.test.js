import { render, screen } from '@testing-library/react';
import TerminalCanvas from './TerminalCanvas';

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

test('shows placeholder before a snapshot arrives', () => {
  render(<TerminalCanvas snapshot={null} />);

  expect(screen.getByText(/waiting for terminal stream/i)).toBeInTheDocument();
});

test('repaints when the same snapshot object is mutated between renders', () => {
  const snapshot = createSnapshot('A');
  const { rerender } = render(<TerminalCanvas snapshot={snapshot} />);

  expect(mockContext.fillText).toHaveBeenCalledWith('A', expect.any(Number), expect.any(Number));

  jest.clearAllMocks();
  snapshot.grid[0][0].ch = ' ';
  rerender(<TerminalCanvas snapshot={snapshot} />);

  expect(mockContext.fillRect).toHaveBeenCalled();
  expect(mockContext.fillText).not.toHaveBeenCalled();
});