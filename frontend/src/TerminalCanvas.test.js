import { render, screen } from '@testing-library/react';
import TerminalCanvas from './TerminalCanvas';

function createSnapshot(ch = ' ') {
  return {
    rows: 1,
    cols: 1,
    cursor_row: 0,
    cursor_col: 0,
    grid: [{
      revision: 1,
      cells: [{
        ch,
        fg: [255, 255, 255],
        bg: [0, 0, 0],
        bold: false,
        underline: false,
        reverse: false,
      }],
    }],
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

test('draws a status message onto the canvas when placeholder mode is disabled and no snapshot has arrived', () => {
  render(<TerminalCanvas snapshot={null} showPlaceholder={false} />);

  expect(mockContext.fillText).toHaveBeenCalledWith(
    'Waiting for terminal stream…',
    expect.any(Number),
    expect.any(Number),
  );
});

test('draws a status message when the snapshot is present but blank', () => {
  render(<TerminalCanvas snapshot={createSnapshot(' ')} showPlaceholder={false} />);

  expect(mockContext.fillText).toHaveBeenCalledWith(
    'Terminal connected. Waiting for output…',
    expect.any(Number),
    expect.any(Number),
  );
});

test('repaints when the same snapshot object is mutated between renders', () => {
  const snapshot = createSnapshot('A');
  const { rerender } = render(<TerminalCanvas snapshot={snapshot} />);

  expect(mockContext.fillText).toHaveBeenCalledWith('A', expect.any(Number), expect.any(Number));

  jest.clearAllMocks();
  snapshot.grid[0].cells[0].ch = ' ';
  snapshot.grid[0].revision += 1;
  rerender(<TerminalCanvas snapshot={snapshot} />);

  expect(mockContext.fillRect).toHaveBeenCalled();
  expect(mockContext.fillText).toHaveBeenCalledWith(
    'Terminal connected. Waiting for output…',
    expect.any(Number),
    expect.any(Number),
  );
});