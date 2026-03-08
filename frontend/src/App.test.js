import { render, screen } from '@testing-library/react';
import App from './App';

test('renders the terminal viewer shell', () => {
  render(<App />);

  expect(screen.getByText(/terminal viewer/i)).toBeInTheDocument();
  expect(screen.getByText(/waiting for terminal stream/i)).toBeInTheDocument();
  expect(screen.getByText(/click the terminal to focus it/i)).toBeInTheDocument();
});
