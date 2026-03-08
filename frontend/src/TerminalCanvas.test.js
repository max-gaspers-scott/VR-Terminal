import { render, screen } from '@testing-library/react';
import TerminalCanvas from './TerminalCanvas';

test('shows placeholder before a snapshot arrives', () => {
  render(<TerminalCanvas snapshot={null} />);

  expect(screen.getByText(/waiting for terminal stream/i)).toBeInTheDocument();
});