import { encodeKeyEvent } from './terminalInput';

test('encodes arrow keys as ansi escapes', () => {
  expect(encodeKeyEvent({ key: 'ArrowUp', altKey: false, ctrlKey: false, metaKey: false })).toBe('\x1b[A');
});

test('encodes ctrl letters as control bytes', () => {
  expect(encodeKeyEvent({ key: 'c', altKey: false, ctrlKey: true, metaKey: false })).toBe('\x03');
});

test('encodes printable characters directly', () => {
  expect(encodeKeyEvent({ key: 'M', altKey: false, ctrlKey: false, metaKey: false })).toBe('M');
});