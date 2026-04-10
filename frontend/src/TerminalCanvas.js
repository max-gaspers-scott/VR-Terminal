import { forwardRef, useCallback, useLayoutEffect, useRef } from 'react';

const CELL_WIDTH = 22;
const CELL_HEIGHT = 40;
const FONT_SIZE = 35;
const FONT_FAMILY = '"DejaVu Sans Mono", "Noto Sans Mono", ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';
const DEFAULT_COLS = 120;
const DEFAULT_ROWS = 40;

const toRgb = ([r, g, b]) => `rgb(${r}, ${g}, ${b})`;

function brightenColor([r, g, b], amount = 0.2) {
  return [r, g, b].map((value) => Math.min(255, Math.round(value + (255 - value) * amount)));
}

function getCellColors(cell) {
  let fg = cell.fg;
  let bg = cell.bg;

  if (cell.reverse) {
    [fg, bg] = [bg, fg];
  }

  if (cell.bold) {
    fg = brightenColor(fg);
  }

  return { fg, bg };
}

function fillHorizontal(ctx, x, y, width, thickness) {
  const top = Math.round(y + (CELL_HEIGHT - thickness) / 2);
  ctx.fillRect(x, top, width, thickness);
}

function fillVertical(ctx, x, y, height, thickness) {
  const left = Math.round(x + (CELL_WIDTH - thickness) / 2);
  ctx.fillRect(left, y, thickness, height);
}

function fillUpper(ctx, x, y, thickness) {
  const left = Math.round(x + (CELL_WIDTH - thickness) / 2);
  ctx.fillRect(left, y, thickness, CELL_HEIGHT / 2);
}

function fillLower(ctx, x, y, thickness) {
  const left = Math.round(x + (CELL_WIDTH - thickness) / 2);
  ctx.fillRect(left, y + CELL_HEIGHT / 2, thickness, Math.ceil(CELL_HEIGHT / 2));
}

function fillStart(ctx, x, y, thickness) {
  const top = Math.round(y + (CELL_HEIGHT - thickness) / 2);
  ctx.fillRect(x, top, CELL_WIDTH / 2, thickness);
}

function fillEnd(ctx, x, y, thickness) {
  const top = Math.round(y + (CELL_HEIGHT - thickness) / 2);
  ctx.fillRect(x + CELL_WIDTH / 2, top, Math.ceil(CELL_WIDTH / 2), thickness);
}

function drawDoubleHorizontal(ctx, x, y) {
  ctx.fillRect(x, y + 6, CELL_WIDTH, 2);
  ctx.fillRect(x, y + 12, CELL_WIDTH, 2);
}

function drawDoubleVertical(ctx, x, y) {
  ctx.fillRect(x + 3, y, 2, CELL_HEIGHT);
  ctx.fillRect(x + 7, y, 2, CELL_HEIGHT);
}

function drawDoubleCorner(ctx, x, y, parts) {
  if (parts.includes('right')) {
    ctx.fillRect(x + Math.floor(CELL_WIDTH / 2), y + 6, Math.ceil(CELL_WIDTH / 2), 2);
    ctx.fillRect(x + Math.floor(CELL_WIDTH / 2), y + 12, Math.ceil(CELL_WIDTH / 2), 2);
  }
  if (parts.includes('left')) {
    ctx.fillRect(x, y + 6, Math.ceil(CELL_WIDTH / 2), 2);
    ctx.fillRect(x, y + 12, Math.ceil(CELL_WIDTH / 2), 2);
  }
  if (parts.includes('up')) {
    ctx.fillRect(x + 3, y, 2, Math.ceil(CELL_HEIGHT / 2));
    ctx.fillRect(x + 7, y, 2, Math.ceil(CELL_HEIGHT / 2));
  }
  if (parts.includes('down')) {
    ctx.fillRect(x + 3, y + Math.floor(CELL_HEIGHT / 2), 2, Math.ceil(CELL_HEIGHT / 2));
    ctx.fillRect(x + 7, y + Math.floor(CELL_HEIGHT / 2), 2, Math.ceil(CELL_HEIGHT / 2));
  }
}

function drawRoundedCorner(ctx, x, y, corner) {
  ctx.lineWidth = 2;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  switch (corner) {
    case 'tl':
      ctx.moveTo(x + CELL_WIDTH / 2, y + CELL_HEIGHT);
      ctx.lineTo(x + CELL_WIDTH / 2, y + CELL_HEIGHT / 2 + 1);
      ctx.quadraticCurveTo(x + CELL_WIDTH / 2, y + 2, x + CELL_WIDTH, y + 2);
      break;
    case 'tr':
      ctx.moveTo(x + CELL_WIDTH / 2, y + CELL_HEIGHT);
      ctx.lineTo(x + CELL_WIDTH / 2, y + CELL_HEIGHT / 2 + 1);
      ctx.quadraticCurveTo(x + CELL_WIDTH / 2, y + 2, x, y + 2);
      break;
    case 'bl':
      ctx.moveTo(x + CELL_WIDTH / 2, y);
      ctx.lineTo(x + CELL_WIDTH / 2, y + CELL_HEIGHT / 2 - 1);
      ctx.quadraticCurveTo(x + CELL_WIDTH / 2, y + CELL_HEIGHT - 2, x + CELL_WIDTH, y + CELL_HEIGHT - 2);
      break;
    case 'br':
      ctx.moveTo(x + CELL_WIDTH / 2, y);
      ctx.lineTo(x + CELL_WIDTH / 2, y + CELL_HEIGHT / 2 - 1);
      ctx.quadraticCurveTo(x + CELL_WIDTH / 2, y + CELL_HEIGHT - 2, x, y + CELL_HEIGHT - 2);
      break;
    default:
      return false;
  }
  ctx.stroke();
  return true;
}

function drawShade(ctx, x, y, alpha) {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.fillRect(x, y, CELL_WIDTH, CELL_HEIGHT);
  ctx.restore();
  return true;
}

function drawQuadrant(ctx, x, y, ch) {
  const halfW = Math.ceil(CELL_WIDTH / 2);
  const halfH = Math.ceil(CELL_HEIGHT / 2);
  switch (ch) {
    case '▘':
      ctx.fillRect(x, y, halfW, halfH);
      return true;
    case '▝':
      ctx.fillRect(x + CELL_WIDTH - halfW, y, halfW, halfH);
      return true;
    case '▖':
      ctx.fillRect(x, y + CELL_HEIGHT - halfH, halfW, halfH);
      return true;
    case '▗':
      ctx.fillRect(x + CELL_WIDTH - halfW, y + CELL_HEIGHT - halfH, halfW, halfH);
      return true;
    case '▚':
      ctx.fillRect(x, y, halfW, halfH);
      ctx.fillRect(x + CELL_WIDTH - halfW, y + CELL_HEIGHT - halfH, halfW, halfH);
      return true;
    case '▞':
      ctx.fillRect(x + CELL_WIDTH - halfW, y, halfW, halfH);
      ctx.fillRect(x, y + CELL_HEIGHT - halfH, halfW, halfH);
      return true;
    default:
      return false;
  }
}

function drawBlockGlyph(ctx, ch, cell, x, y, colors) {
  ctx.fillStyle = toRgb(colors.fg);
  switch (ch) {
    case '█':
      ctx.fillRect(x, y, CELL_WIDTH, CELL_HEIGHT);
      return true;
    case '▀':
      ctx.fillRect(x, y, CELL_WIDTH, Math.ceil(CELL_HEIGHT / 2));
      return true;
    case '▄':
      ctx.fillRect(x, y + Math.floor(CELL_HEIGHT / 2), CELL_WIDTH, Math.ceil(CELL_HEIGHT / 2));
      return true;
    case '▌':
      ctx.fillRect(x, y, Math.ceil(CELL_WIDTH / 2), CELL_HEIGHT);
      return true;
    case '▐':
      ctx.fillRect(x + Math.floor(CELL_WIDTH / 2), y, Math.ceil(CELL_WIDTH / 2), CELL_HEIGHT);
      return true;
    case '░':
      return drawShade(ctx, x, y, 0.25);
    case '▒':
      return drawShade(ctx, x, y, 0.5);
    case '▓':
      return drawShade(ctx, x, y, 0.75);
    case '▘':
    case '▝':
    case '▖':
    case '▗':
    case '▚':
    case '▞':
      return drawQuadrant(ctx, x, y, ch);
    case '─':
      fillHorizontal(ctx, x, y, CELL_WIDTH, 2);
      return true;
    case '━':
      fillHorizontal(ctx, x, y, CELL_WIDTH, 3);
      return true;
    case '│':
      fillVertical(ctx, x, y, CELL_HEIGHT, 2);
      return true;
    case '┃':
      fillVertical(ctx, x, y, CELL_HEIGHT, 3);
      return true;
    case '┌':
      fillEnd(ctx, x, y, 2);
      fillLower(ctx, x, y, 2);
      return true;
    case '┐':
      fillStart(ctx, x, y, 2);
      fillLower(ctx, x, y, 2);
      return true;
    case '└':
      fillEnd(ctx, x, y, 2);
      fillUpper(ctx, x, y, 2);
      return true;
    case '┘':
      fillStart(ctx, x, y, 2);
      fillUpper(ctx, x, y, 2);
      return true;
    case '├':
      fillEnd(ctx, x, y, 2);
      fillVertical(ctx, x, y, CELL_HEIGHT, 2);
      return true;
    case '┤':
      fillStart(ctx, x, y, 2);
      fillVertical(ctx, x, y, CELL_HEIGHT, 2);
      return true;
    case '┬':
      fillHorizontal(ctx, x, y, CELL_WIDTH, 2);
      fillLower(ctx, x, y, 2);
      return true;
    case '┴':
      fillHorizontal(ctx, x, y, CELL_WIDTH, 2);
      fillUpper(ctx, x, y, 2);
      return true;
    case '┼':
      fillHorizontal(ctx, x, y, CELL_WIDTH, 2);
      fillVertical(ctx, x, y, CELL_HEIGHT, 2);
      return true;
    case '┏':
      fillEnd(ctx, x, y, 3);
      fillLower(ctx, x, y, 3);
      return true;
    case '┓':
      fillStart(ctx, x, y, 3);
      fillLower(ctx, x, y, 3);
      return true;
    case '┗':
      fillEnd(ctx, x, y, 3);
      fillUpper(ctx, x, y, 3);
      return true;
    case '┛':
      fillStart(ctx, x, y, 3);
      fillUpper(ctx, x, y, 3);
      return true;
    case '┣':
      fillEnd(ctx, x, y, 3);
      fillVertical(ctx, x, y, CELL_HEIGHT, 3);
      return true;
    case '┫':
      fillStart(ctx, x, y, 3);
      fillVertical(ctx, x, y, CELL_HEIGHT, 3);
      return true;
    case '┳':
      fillHorizontal(ctx, x, y, CELL_WIDTH, 3);
      fillLower(ctx, x, y, 3);
      return true;
    case '┻':
      fillHorizontal(ctx, x, y, CELL_WIDTH, 3);
      fillUpper(ctx, x, y, 3);
      return true;
    case '╋':
      fillHorizontal(ctx, x, y, CELL_WIDTH, 3);
      fillVertical(ctx, x, y, CELL_HEIGHT, 3);
      return true;
    case '═':
      drawDoubleHorizontal(ctx, x, y);
      return true;
    case '║':
      drawDoubleVertical(ctx, x, y);
      return true;
    case '╔':
      drawDoubleCorner(ctx, x, y, ['right', 'down']);
      return true;
    case '╗':
      drawDoubleCorner(ctx, x, y, ['left', 'down']);
      return true;
    case '╚':
      drawDoubleCorner(ctx, x, y, ['right', 'up']);
      return true;
    case '╝':
      drawDoubleCorner(ctx, x, y, ['left', 'up']);
      return true;
    case '╠':
      drawDoubleCorner(ctx, x, y, ['right', 'up', 'down']);
      return true;
    case '╣':
      drawDoubleCorner(ctx, x, y, ['left', 'up', 'down']);
      return true;
    case '╦':
      drawDoubleCorner(ctx, x, y, ['left', 'right', 'down']);
      return true;
    case '╩':
      drawDoubleCorner(ctx, x, y, ['left', 'right', 'up']);
      return true;
    case '╬':
      drawDoubleCorner(ctx, x, y, ['left', 'right', 'up', 'down']);
      return true;
    case '╭':
      return drawRoundedCorner(ctx, x, y, 'tl');
    case '╮':
      return drawRoundedCorner(ctx, x, y, 'tr');
    case '╰':
      return drawRoundedCorner(ctx, x, y, 'bl');
    case '╯':
      return drawRoundedCorner(ctx, x, y, 'br');
    default:
      return false;
  }
}

function sizeCanvas(canvas, width, height, ratio) {
  canvas.width = width * ratio;
  canvas.height = height * ratio;
  canvas.style.width = `${width}px`;
  canvas.style.height = `${height}px`;
}

function snapshotHasVisibleContent(snapshot) {
  return snapshot.grid.some((row) => row.cells.some((cell) => cell.ch !== ' '));
}

function drawStatusCanvas(ctx, width, height, message) {
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = '#05070a';
  ctx.fillRect(0, 0, width, height);
  ctx.fillStyle = '#0f1722';
  ctx.fillRect(width * 0.08, height * 0.16, width * 0.84, height * 0.68);
  ctx.fillStyle = '#8ea3b8';
  ctx.font = `400 22px ${FONT_FAMILY}`;
  ctx.fillText(message, width / 2, height / 2);
}

function drawTerminalSnapshot(ctx, snapshot, lastRevisions) {
  snapshot.grid.forEach((row, rowIndex) => {
    if (lastRevisions && lastRevisions[rowIndex] === row.revision) {
      if (rowIndex === snapshot.cursor_row || rowIndex === lastRevisions.last_cursor_row) {
        // We might need to redraw to add/remove cursor, but let's be simple for now.
      } else {
        return;
      }
    }

    row.cells.forEach((cell, colIndex) => {
      const x = colIndex * CELL_WIDTH;
      const y = rowIndex * CELL_HEIGHT;
      const colors = getCellColors(cell);

      ctx.fillStyle = toRgb(colors.bg);
      ctx.fillRect(x, y, CELL_WIDTH, CELL_HEIGHT);

      if (!drawBlockGlyph(ctx, cell.ch, cell, x, y, colors) && cell.ch !== ' ') {
        ctx.save();
        ctx.beginPath();
        ctx.rect(x, y, CELL_WIDTH, CELL_HEIGHT);
        ctx.clip();
        ctx.fillStyle = toRgb(colors.fg);
        ctx.font = `${cell.bold ? '700' : '400'} ${FONT_SIZE}px ${FONT_FAMILY}`;
        ctx.fillText(cell.ch, x + CELL_WIDTH / 2, y + CELL_HEIGHT / 2 + 0.5);

        if (cell.underline) {
          ctx.beginPath();
          ctx.strokeStyle = toRgb(colors.fg);
          ctx.lineWidth = cell.bold ? 2 : 1;
          ctx.moveTo(x + 1, y + CELL_HEIGHT - 3);
          ctx.lineTo(x + CELL_WIDTH - 1, y + CELL_HEIGHT - 3);
          ctx.stroke();
        }

        ctx.restore();
      } else if (cell.underline) {
        ctx.beginPath();
        ctx.strokeStyle = toRgb(colors.fg);
        ctx.lineWidth = cell.bold ? 2 : 1;
        ctx.moveTo(x + 1, y + CELL_HEIGHT - 3);
        ctx.lineTo(x + CELL_WIDTH - 1, y + CELL_HEIGHT - 3);
        ctx.stroke();
      }

      if (rowIndex === snapshot.cursor_row && colIndex === snapshot.cursor_col) {
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.85)';
        ctx.lineWidth = 1;
        ctx.strokeRect(x + 0.5, y + 0.5, CELL_WIDTH - 1, CELL_HEIGHT - 1);
      }
    });
  });
}

const TerminalCanvas = forwardRef(function TerminalCanvas(
  {
    snapshot,
    showPlaceholder = true,
    canvasId,
    className = 'terminal-canvas',
  },
  forwardedRef,
) {
  const localCanvasRef = useRef(null);

  const setCanvasRef = useCallback((node) => {
    localCanvasRef.current = node;

    if (typeof forwardedRef === 'function') {
      forwardedRef(node);
    } else if (forwardedRef) {
      forwardedRef.current = node;
    }
  }, [forwardedRef]);

  const lastRevisionsRef = useRef({});

  useLayoutEffect(() => {
    if (!localCanvasRef.current) {
      return;
    }

    const canvas = localCanvasRef.current;
    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) {
      return;
    }

    const width = (snapshot?.cols ?? DEFAULT_COLS) * CELL_WIDTH;
    const height = (snapshot?.rows ?? DEFAULT_ROWS) * CELL_HEIGHT;
    const ratio = 1;

    if (canvas.width !== width * ratio || canvas.height !== height * ratio) {
      sizeCanvas(canvas, width, height, ratio);
      lastRevisionsRef.current = {}; // Reset revisions on resize
    }

    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    if (!snapshot) {
      drawStatusCanvas(ctx, width, height, 'Waiting for terminal stream…');
      lastRevisionsRef.current = {};
      return;
    }

    if (!snapshotHasVisibleContent(snapshot)) {
      drawStatusCanvas(ctx, width, height, 'Terminal connected. Waiting for output…');
      lastRevisionsRef.current = {};
      return;
    }

    drawTerminalSnapshot(ctx, snapshot, lastRevisionsRef.current);

    const nextRevisions = {};
    snapshot.grid.forEach((row, i) => {
      nextRevisions[i] = row.revision;
    });
    nextRevisions.last_cursor_row = snapshot.cursor_row;
    lastRevisionsRef.current = nextRevisions;
  });

  if (!snapshot && showPlaceholder) {
    return <div className="terminal-placeholder">Waiting for terminal stream…</div>;
  }

  return <canvas id={canvasId} ref={setCanvasRef} className={className} />;
});

export default TerminalCanvas;
