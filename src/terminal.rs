use portable_pty::{CommandBuilder, PtySize, native_pty_system};
use serde::Serialize;
use std::io::{Read, Write};
use std::sync::{Arc, Mutex, mpsc};
use tokio::sync::watch;
use vte::{Params, Parser, Perform};

pub const DEFAULT_ROWS: usize = 40;
pub const DEFAULT_COLS: usize = 120;
const DEFAULT_FG: [u8; 3] = [255, 255, 255];
const DEFAULT_BG: [u8; 3] = [0, 0, 0];

#[derive(Clone)]
struct Cell {
    ch: char,
    fg: [u8; 3],
    bg: [u8; 3],
    bold: bool,
    underline: bool,
    reverse: bool,
}

#[derive(Clone, Serialize)]
struct SnapshotCell {
    ch: char,
    fg: [u8; 3],
    bg: [u8; 3],
    bold: bool,
    underline: bool,
    reverse: bool,
}

#[derive(Clone, Serialize)]
pub struct TerminalSnapshot {
    rows: usize,
    cols: usize,
    cursor_row: usize,
    cursor_col: usize,
    grid: Vec<Vec<SnapshotCell>>,
}

struct TerminalGrid {
    grid: Vec<Vec<Cell>>,
    cursor_row: usize,
    cursor_col: usize,
    current_fg: [u8; 3],
    current_bg: [u8; 3],
    current_bold: bool,
    current_underline: bool,
    current_reverse: bool,
    rows: usize,
    cols: usize,
}

impl TerminalGrid {
    fn new(rows: usize, cols: usize) -> Self {
        let blank = Self::blank_cell();
        Self {
            grid: vec![vec![blank; cols]; rows],
            cursor_row: 0,
            cursor_col: 0,
            current_fg: [255, 255, 255],
            current_bg: [0, 0, 0],
            current_bold: false,
            current_underline: false,
            current_reverse: false,
            rows,
            cols,
        }
    }

    fn blank_cell() -> Cell {
        Cell {
            ch: ' ',
            fg: DEFAULT_FG,
            bg: DEFAULT_BG,
            bold: false,
            underline: false,
            reverse: false,
        }
    }

    fn reset_attributes(&mut self) {
        self.current_fg = DEFAULT_FG;
        self.current_bg = DEFAULT_BG;
        self.current_bold = false;
        self.current_underline = false;
        self.current_reverse = false;
    }

    fn apply_sgr(&mut self, params: &[u16]) {
        if params.is_empty() {
            self.reset_attributes();
            return;
        }

        let mut i = 0;
        while i < params.len() {
            match params[i] {
                0 => {
                    self.reset_attributes();
                    i += 1;
                }
                1 => {
                    self.current_bold = true;
                    i += 1;
                }
                4 | 21 => {
                    self.current_underline = true;
                    i += 1;
                }
                7 => {
                    self.current_reverse = true;
                    i += 1;
                }
                22 => {
                    self.current_bold = false;
                    i += 1;
                }
                24 => {
                    self.current_underline = false;
                    i += 1;
                }
                27 => {
                    self.current_reverse = false;
                    i += 1;
                }
                30..=37 => {
                    self.current_fg = ansi_color((params[i] - 30) as u8);
                    i += 1;
                }
                40..=47 => {
                    self.current_bg = ansi_color((params[i] - 40) as u8);
                    i += 1;
                }
                90..=97 => {
                    self.current_fg = ansi_color((params[i] - 90 + 8) as u8);
                    i += 1;
                }
                100..=107 => {
                    self.current_bg = ansi_color((params[i] - 100 + 8) as u8);
                    i += 1;
                }
                39 => {
                    self.current_fg = DEFAULT_FG;
                    i += 1;
                }
                49 => {
                    self.current_bg = DEFAULT_BG;
                    i += 1;
                }
                38 => {
                    if let Some((color, consumed)) = parse_extended_color(params, i) {
                        self.current_fg = color;
                        i += consumed;
                    } else {
                        i += 1;
                    }
                }
                48 => {
                    if let Some((color, consumed)) = parse_extended_color(params, i) {
                        self.current_bg = color;
                        i += consumed;
                    } else {
                        i += 1;
                    }
                }
                _ => {
                    i += 1;
                }
            }
        }
    }

    fn snapshot(&self) -> TerminalSnapshot {
        TerminalSnapshot {
            rows: self.rows,
            cols: self.cols,
            cursor_row: self.cursor_row,
            cursor_col: self.cursor_col,
            grid: self
                .grid
                .iter()
                .map(|row| {
                    row.iter()
                        .map(|cell| SnapshotCell {
                            ch: cell.ch,
                            fg: cell.fg,
                            bg: cell.bg,
                            bold: cell.bold,
                            underline: cell.underline,
                            reverse: cell.reverse,
                        })
                        .collect()
                })
                .collect(),
        }
    }
}

impl TerminalSnapshot {
    pub fn blank(rows: usize, cols: usize) -> Self {
        TerminalGrid::new(rows, cols).snapshot()
    }
}

fn parse_extended_color(params: &[u16], index: usize) -> Option<([u8; 3], usize)> {
    match params.get(index + 1).copied() {
        Some(2) if index + 4 < params.len() => Some((
            [
                params[index + 2] as u8,
                params[index + 3] as u8,
                params[index + 4] as u8,
            ],
            5,
        )),
        Some(5) if index + 2 < params.len() => Some((xterm_256_color(params[index + 2] as u8), 3)),
        _ => None,
    }
}

fn ansi_color(index: u8) -> [u8; 3] {
    match index {
        0 => [0, 0, 0],
        1 => [205, 49, 49],
        2 => [13, 188, 121],
        3 => [229, 229, 16],
        4 => [36, 114, 200],
        5 => [188, 63, 188],
        6 => [17, 168, 205],
        7 => [229, 229, 229],
        8 => [102, 102, 102],
        9 => [241, 76, 76],
        10 => [35, 209, 139],
        11 => [245, 245, 67],
        12 => [59, 142, 234],
        13 => [214, 112, 214],
        14 => [41, 184, 219],
        15 => [255, 255, 255],
        _ => DEFAULT_FG,
    }
}

fn xterm_256_color(index: u8) -> [u8; 3] {
    match index {
        0..=15 => ansi_color(index),
        16..=231 => {
            let cube = index - 16;
            let r = cube / 36;
            let g = (cube % 36) / 6;
            let b = cube % 6;
            [cube_component(r), cube_component(g), cube_component(b)]
        }
        232..=255 => {
            let gray = 8 + (index - 232) * 10;
            [gray, gray, gray]
        }
    }
}

fn cube_component(value: u8) -> u8 {
    match value {
        0 => 0,
        _ => 55 + value * 40,
    }
}

// This is where vte calls you back
impl Perform for TerminalGrid {
    // A printable character — put it in the grid
    fn print(&mut self, c: char) {
        if self.cursor_col < self.cols && self.cursor_row < self.rows {
            self.grid[self.cursor_row][self.cursor_col] = Cell {
                ch: c,
                fg: self.current_fg,
                bg: self.current_bg,
                bold: self.current_bold,
                underline: self.current_underline,
                reverse: self.current_reverse,
            };
            self.cursor_col += 1;
        }
    }

    // ESC sequences like cursor movement, clear screen, etc.
    fn csi_dispatch(
        &mut self,
        params: &Params,
        _intermediates: &[u8],
        _ignore: bool,
        action: char,
    ) {
        match action {
            // Cursor position: ESC[row;colH
            'H' | 'f' => {
                let mut iter = params.iter();
                let row = iter.next().and_then(|p| p.first()).copied().unwrap_or(1) as usize;
                let col = iter.next().and_then(|p| p.first()).copied().unwrap_or(1) as usize;
                self.cursor_row = (row.saturating_sub(1)).min(self.rows - 1);
                self.cursor_col = (col.saturating_sub(1)).min(self.cols - 1);
            }
            // SGR: colors and attributes ESC[...m
            'm' => {
                let sgr_params: Vec<u16> = params
                    .iter()
                    .flat_map(|param| param.iter().copied())
                    .collect();
                self.apply_sgr(&sgr_params);
            }
            // Erase display: ESC[2J
            'J' => {
                let blank = Cell {
                    ch: ' ',
                    fg: self.current_fg,
                    bg: self.current_bg,
                    bold: self.current_bold,
                    underline: self.current_underline,
                    reverse: self.current_reverse,
                };
                for row in self.grid.iter_mut() {
                    for cell in row.iter_mut() {
                        *cell = blank.clone();
                    }
                }
            }
            _ => {}
        }
    }

    // Newline / carriage return
    fn execute(&mut self, byte: u8) {
        match byte {
            b'\n' => {
                self.cursor_row = (self.cursor_row + 1).min(self.rows - 1);
            }
            b'\r' => {
                self.cursor_col = 0;
            }
            _ => {}
        }
    }
}
fn print_grid(grid: &TerminalGrid) {
    // Clear your real terminal first so it doesn't scroll
    print!("\x1b[2J\x1b[1;1H");
    for row in &grid.grid {
        let line: String = row
            .iter()
            .map(|cell| cell.ch.to_string())
            .collect::<Vec<String>>()
            .join(",");
        println!("{}", line);
    }
    std::io::stdout().flush().unwrap();
}
pub fn main_terminal(tx: watch::Sender<TerminalSnapshot>, input_rx: mpsc::Receiver<Vec<u8>>) {
    let rows = DEFAULT_ROWS;
    let cols = DEFAULT_COLS;
    crossterm::terminal::enable_raw_mode().unwrap();

    let pty_system = native_pty_system();
    let pair = pty_system
        .openpty(PtySize {
            rows: 40,
            cols: 120,
            pixel_width: 0,
            pixel_height: 0,
        })
        .unwrap();

    let cmd = CommandBuilder::new("nvim");
    let child = pair.slave.spawn_command(cmd).unwrap();
    // Drop the slave fd in *this* process. The master reader only returns EIO
    // (signalling EOF) once every holder of the slave fd has closed it.
    // If we leave pair.slave open here, killing the child is not enough —
    // our own open slave fd keeps the master blocked forever.
    drop(pair.slave);
    let child = Arc::new(Mutex::new(child));

    // Thread 1: PTY output → your real stdout
    // let mut reader = pair.master.try_clone_reader().unwrap();
    // std::thread::spawn(move || {
    //     let mut buf = [0u8; 4096];
    //     let stdout = std::io::stdout();
    //     // let mut out = stdout.lock();
    //     loop {
    //         match reader.read(&mut buf) {
    //             Ok(0) | Err(_) => break,
    //             Ok(n) => {
    //                 // out.write_all(&buf[..n]).unwrap();
    //                 // out.flush().unwrap();
    //             }
    //         }
    //     }
    // });

    // Thread 2: your real stdin → PTY input
    let writer = Arc::new(Mutex::new(pair.master.take_writer().unwrap()));
    let child_for_thread = Arc::clone(&child);
    let writer_for_stdin = Arc::clone(&writer);
    std::thread::spawn(move || {
        let mut buf = [0u8; 4096];
        let stdin = std::io::stdin();
        let mut inp = stdin.lock();
        loop {
            match inp.read(&mut buf) {
                Ok(0) | Err(_) => break,
                Ok(n) => {
                    // Ctrl+C in raw mode arrives as byte 0x03 — kill the child and stop
                    if buf[..n].contains(&0x03) {
                        child_for_thread.lock().unwrap().kill().ok();
                        break;
                    }
                    if writer_for_stdin
                        .lock()
                        .unwrap()
                        .write_all(&buf[..n])
                        .is_err()
                    {
                        break;
                    }
                }
            }
        }
    });

    let child_for_socket = Arc::clone(&child);
    let writer_for_socket = Arc::clone(&writer);
    std::thread::spawn(move || {
        while let Ok(bytes) = input_rx.recv() {
            if bytes.contains(&0x03) {
                child_for_socket.lock().unwrap().kill().ok();
            }

            if writer_for_socket.lock().unwrap().write_all(&bytes).is_err() {
                break;
            }
        }
    });

    let mut reader = pair.master.try_clone_reader().unwrap();
    let mut parser = Parser::new();
    let mut grid = TerminalGrid::new(rows, cols);

    let mut buf = [0u8; 4096];
    loop {
        match reader.read(&mut buf) {
            Ok(0) | Err(_) => break,
            Ok(n) => {
                // Feed bytes to vte — it calls back into grid
                parser.advance(&mut grid, &buf[..n]);
                let _ = tx.send(grid.snapshot());
                print_grid(&grid);
                // At this point grid.grid is up to date — render it however you want
                // For now just print the top-left cell as a sanity check:
                // println!("{}", grid.grid[0][0].ch);
            }
        }
    }
    // Wait for the child process to exit
    child.lock().unwrap().wait().unwrap();

    crossterm::terminal::disable_raw_mode().unwrap();
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn blank_snapshot_has_expected_size() {
        let snapshot = TerminalSnapshot::blank(2, 3);

        assert_eq!(snapshot.rows, 2);
        assert_eq!(snapshot.cols, 3);
        assert_eq!(snapshot.grid.len(), 2);
        assert!(snapshot.grid.iter().all(|row| row.len() == 3));
    }

    #[test]
    fn snapshot_captures_grid_contents_and_cursor() {
        let mut grid = TerminalGrid::new(2, 3);
        grid.print('A');

        let snapshot = grid.snapshot();

        assert_eq!(snapshot.grid[0][0].ch, 'A');
        assert_eq!(snapshot.cursor_row, 0);
        assert_eq!(snapshot.cursor_col, 1);
    }

    #[test]
    fn sgr_basic_ansi_colors_update_current_colors() {
        let mut grid = TerminalGrid::new(1, 1);

        grid.apply_sgr(&[31, 44]);

        assert_eq!(grid.current_fg, ansi_color(1));
        assert_eq!(grid.current_bg, ansi_color(4));
    }

    #[test]
    fn sgr_256_color_updates_foreground_and_background() {
        let mut grid = TerminalGrid::new(1, 1);

        grid.apply_sgr(&[38, 5, 196, 48, 5, 33]);

        assert_eq!(grid.current_fg, xterm_256_color(196));
        assert_eq!(grid.current_bg, xterm_256_color(33));
    }

    #[test]
    fn sgr_truecolor_updates_foreground_and_background() {
        let mut grid = TerminalGrid::new(1, 1);

        grid.apply_sgr(&[38, 2, 12, 34, 56, 48, 2, 65, 43, 21]);

        assert_eq!(grid.current_fg, [12, 34, 56]);
        assert_eq!(grid.current_bg, [65, 43, 21]);
    }

    #[test]
    fn sgr_text_attributes_update_and_reset() {
        let mut grid = TerminalGrid::new(1, 1);

        grid.apply_sgr(&[1, 4, 7]);
        assert!(grid.current_bold);
        assert!(grid.current_underline);
        assert!(grid.current_reverse);

        grid.apply_sgr(&[22, 24, 27]);
        assert!(!grid.current_bold);
        assert!(!grid.current_underline);
        assert!(!grid.current_reverse);
    }

    #[test]
    fn snapshot_preserves_text_attributes() {
        let mut grid = TerminalGrid::new(1, 1);

        grid.apply_sgr(&[1, 4, 7, 31, 47]);
        grid.print('Z');

        let snapshot = grid.snapshot();
        let cell = &snapshot.grid[0][0];

        assert_eq!(cell.ch, 'Z');
        assert_eq!(cell.fg, ansi_color(1));
        assert_eq!(cell.bg, ansi_color(7));
        assert!(cell.bold);
        assert!(cell.underline);
        assert!(cell.reverse);
    }
}
