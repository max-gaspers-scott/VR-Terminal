import { encodeKeyEvent } from './terminalInput';

test('encodes arrow keys as ansi escapes', () => {
  expect(encodeKeyEvent({ key: 'ArrowUp', altKey: false, ctrlKey: false, metaKey: false })).toBe('\x1b[A');
});

test('encodes ctrl letters as control bytes', () => {
  expect(encodeKeyEvent({ key: 'c', altKey: false, ctrlKey: true, metaKey: false })).toBe('\x03');
});

test('encodes ctrl slash as unit separator', () => {
  expect(encodeKeyEvent({ key: '/', altKey: false, ctrlKey: true, metaKey: false })).toBe('\x1f');
});

test('encodes ctrl slash by physical key code even when key value differs', () => {
  expect(encodeKeyEvent({ key: 'Dead', code: 'Slash', altKey: false, ctrlKey: true, metaKey: false })).toBe('\x1f');
});

test('encodes ctrl numpad divide as unit separator', () => {
  expect(encodeKeyEvent({ key: '/', code: 'NumpadDivide', altKey: false, ctrlKey: true, metaKey: false })).toBe('\x1f');
});

test('encodes printable characters directly', () => {
  expect(encodeKeyEvent({ key: 'M', altKey: false, ctrlKey: false, metaKey: false })).toBe('M');
});