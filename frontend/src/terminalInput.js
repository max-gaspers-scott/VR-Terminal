const SPECIAL_KEYS = {
  Enter: '\r',
  Backspace: '\x7f',
  Tab: '\t',
  Escape: '\x1b',
  ArrowUp: '\x1b[A',
  ArrowDown: '\x1b[B',
  ArrowRight: '\x1b[C',
  ArrowLeft: '\x1b[D',
  Home: '\x1b[H',
  End: '\x1b[F',
  PageUp: '\x1b[5~',
  PageDown: '\x1b[6~',
  Insert: '\x1b[2~',
  Delete: '\x1b[3~',
  F1: '\x1bOP',
  F2: '\x1bOQ',
  F3: '\x1bOR',
  F4: '\x1bOS',
  F5: '\x1b[15~',
  F6: '\x1b[17~',
  F7: '\x1b[18~',
  F8: '\x1b[19~',
  F9: '\x1b[20~',
  F10: '\x1b[21~',
  F11: '\x1b[23~',
  F12: '\x1b[24~',
};

function encodeCtrlKey(key) {
  if (key.length !== 1) {
    return null;
  }

  const lower = key.toLowerCase();
  if (lower >= 'a' && lower <= 'z') {
    return String.fromCharCode(lower.charCodeAt(0) - 96);
  }

  switch (key) {
    case ' ':
    case '@':
      return '\x00';
    case '[':
      return '\x1b';
    case '\\':
      return '\x1c';
    case ']':
      return '\x1d';
    case '^':
      return '\x1e';
    case '_':
      return '\x1f';
    default:
      return null;
  }
}

export function encodeKeyEvent(event) {
  if (event.metaKey) {
    return null;
  }

  let output = SPECIAL_KEYS[event.key] || null;

  if (!output && event.ctrlKey) {
    output = encodeCtrlKey(event.key);
  }

  if (!output && event.key.length === 1 && !event.ctrlKey) {
    output = event.key;
  }

  if (!output) {
    return null;
  }

  if (event.altKey && event.key !== 'Alt') {
    return `\x1b${output}`;
  }

  return output;
}