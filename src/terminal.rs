use portable_pty::{CommandBuilder, PtySize, native_pty_system};
use serde::Serialize;
use std::io::{IsTerminal, Read, Write};
use std::path::Path;
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
    scroll_region_top: usize,
    scroll_region_bottom: usize,
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
            scroll_region_top: 0,
            scroll_region_bottom: rows.saturating_sub(1),
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

    fn styled_blank_cell(&self) -> Cell {
        Cell {
            ch: ' ',
            fg: self.current_fg,
            bg: self.current_bg,
            bold: self.current_bold,
            underline: self.current_underline,
            reverse: self.current_reverse,
        }
    }

    fn blank_row(&self) -> Vec<Cell> {
        vec![self.styled_blank_cell(); self.cols]
    }

    fn first_param(params: &Params, default: u16) -> u16 {
        params
            .iter()
            .next()
            .and_then(|param| param.first())
            .copied()
            .unwrap_or(default)
    }

    fn nth_param(params: &Params, index: usize, default: u16) -> u16 {
        params
            .iter()
            .nth(index)
            .and_then(|param| param.first())
            .copied()
            .unwrap_or(default)
    }

    fn set_cursor(&mut self, row: usize, col: usize) {
        self.cursor_row = row.min(self.rows.saturating_sub(1));
        self.cursor_col = col.min(self.cols.saturating_sub(1));
    }

    fn set_scroll_region(&mut self, top: usize, bottom: usize) {
        if top >= self.rows || bottom >= self.rows || top >= bottom {
            return;
        }

        self.scroll_region_top = top;
        self.scroll_region_bottom = bottom;
        self.set_cursor(0, 0);
    }

    fn scroll_up_region(&mut self, top: usize, bottom: usize) {
        if top >= self.rows || bottom >= self.rows || top > bottom {
            return;
        }

        if top == bottom {
            self.grid[bottom] = self.blank_row();
            return;
        }

        self.grid[top..=bottom].rotate_left(1);
        self.grid[bottom] = self.blank_row();
    }

    fn linefeed(&mut self) {
        if self.cursor_row == self.scroll_region_bottom {
            self.scroll_up_region(self.scroll_region_top, self.scroll_region_bottom);
        } else if self.cursor_row < self.rows.saturating_sub(1) {
            self.cursor_row += 1;
        }
    }

    fn clear_row_range(&mut self, row: usize, start: usize, end: usize) {
        if row >= self.rows || start >= end {
            return;
        }

        let blank = self.styled_blank_cell();
        for cell in self.grid[row][start.min(self.cols)..end.min(self.cols)].iter_mut() {
            *cell = blank.clone();
        }
    }

    fn clear_rows(&mut self, start_row: usize, end_row: usize) {
        if start_row >= end_row {
            return;
        }

        let blank = self.styled_blank_cell();
        for row in self.grid[start_row.min(self.rows)..end_row.min(self.rows)].iter_mut() {
            for cell in row.iter_mut() {
                *cell = blank.clone();
            }
        }
    }

    fn erase_in_display(&mut self, mode: u16) {
        match mode {
            0 => {
                self.clear_row_range(self.cursor_row, self.cursor_col, self.cols);
                self.clear_rows(self.cursor_row.saturating_add(1), self.rows);
            }
            1 => {
                self.clear_rows(0, self.cursor_row);
                self.clear_row_range(self.cursor_row, 0, self.cursor_col.saturating_add(1));
            }
            2 | 3 => self.clear_rows(0, self.rows),
            _ => {}
        }
    }

    fn erase_in_line(&mut self, mode: u16) {
        match mode {
            0 => self.clear_row_range(self.cursor_row, self.cursor_col, self.cols),
            1 => self.clear_row_range(self.cursor_row, 0, self.cursor_col.saturating_add(1)),
            2 => self.clear_row_range(self.cursor_row, 0, self.cols),
            _ => {}
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
                self.set_cursor(row.saturating_sub(1), col.saturating_sub(1));
            }
            // Cursor up/down/right/left.
            'A' => {
                let amount = Self::first_param(params, 1) as usize;
                self.cursor_row = self.cursor_row.saturating_sub(amount);
            }
            'B' => {
                let amount = Self::first_param(params, 1) as usize;
                self.cursor_row = (self.cursor_row + amount).min(self.rows.saturating_sub(1));
            }
            'C' => {
                let amount = Self::first_param(params, 1) as usize;
                self.cursor_col = (self.cursor_col + amount).min(self.cols.saturating_sub(1));
            }
            'D' => {
                let amount = Self::first_param(params, 1) as usize;
                self.cursor_col = self.cursor_col.saturating_sub(amount);
            }
            // Horizontal / vertical absolute cursor positioning.
            'G' => {
                let col = Self::first_param(params, 1) as usize;
                self.cursor_col = col.saturating_sub(1).min(self.cols.saturating_sub(1));
            }
            'd' => {
                let row = Self::first_param(params, 1) as usize;
                self.cursor_row = row.saturating_sub(1).min(self.rows.saturating_sub(1));
            }
            // SGR: colors and attributes ESC[...m
            'm' => {
                let sgr_params: Vec<u16> = params
                    .iter()
                    .flat_map(|param| param.iter().copied())
                    .collect();
                self.apply_sgr(&sgr_params);
            }
            // Erase display / erase line.
            'J' => self.erase_in_display(Self::first_param(params, 0)),
            'K' => self.erase_in_line(Self::first_param(params, 0)),
            'r' => {
                let top = Self::nth_param(params, 0, 1);
                let bottom = Self::nth_param(params, 1, self.rows as u16);
                let top = if top == 0 { 1 } else { top } as usize;
                let bottom = if bottom == 0 {
                    self.rows as u16
                } else {
                    bottom
                } as usize;

                if top < bottom && bottom <= self.rows {
                    self.set_scroll_region(top - 1, bottom - 1);
                }
            }
            _ => {}
        }
    }

    // Newline / carriage return
    fn execute(&mut self, byte: u8) {
        match byte {
            b'\n' => {
                self.linefeed();
            }
            b'\r' => {
                self.cursor_col = 0;
            }
            b'\x08' => {
                self.cursor_col = self.cursor_col.saturating_sub(1);
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

fn preferred_terminal_program(shell_from_env: Option<&str>) -> String {
    shell_from_env
        .filter(|shell| !shell.trim().is_empty())
        .filter(|shell| Path::new(shell).exists())
        .unwrap_or("/bin/sh")
        .to_string()
}

fn build_terminal_command(shell_from_env: Option<&str>) -> CommandBuilder {
    let program = preferred_terminal_program(shell_from_env);
    let mut cmd = CommandBuilder::new(program);
    cmd.arg("-i");
    cmd.env("TERM", "xterm-256color");
    cmd.env("COLORTERM", "truecolor");
    cmd
}

pub fn main_terminal(tx: watch::Sender<TerminalSnapshot>, input_rx: mpsc::Receiver<Vec<u8>>) {
    let rows = DEFAULT_ROWS;
    let cols = DEFAULT_COLS;
    let stdin_is_terminal = std::io::stdin().is_terminal();
    let raw_mode_enabled = if stdin_is_terminal {
        match crossterm::terminal::enable_raw_mode() {
            Ok(()) => true,
            Err(error) => {
                eprintln!("failed to enable raw mode for local stdin bridge: {error}");
                false
            }
        }
    } else {
        false
    };

    let pty_system = native_pty_system();
    let pair = pty_system
        .openpty(PtySize {
            rows: 40,
            cols: 120,
            pixel_width: 0,
            pixel_height: 0,
        })
        .unwrap();

    let cmd = build_terminal_command(std::env::var("SHELL").ok().as_deref());
    let child = match pair.slave.spawn_command(cmd) {
        Ok(child) => child,
        Err(error) => {
            eprintln!("failed to spawn terminal process: {error}");
            return;
        }
    };
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
    if raw_mode_enabled {
        let writer_for_stdin = Arc::clone(&writer);
        std::thread::spawn(move || {
            let mut buf = [0u8; 4096];
            let stdin = std::io::stdin();
            let mut inp = stdin.lock();
            loop {
                match inp.read(&mut buf) {
                    Ok(0) | Err(_) => break,
                    Ok(n) => {
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
    }

    let writer_for_socket = Arc::clone(&writer);
    std::thread::spawn(move || {
        while let Ok(bytes) = input_rx.recv() {
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
                // print_grid(&grid);
                // At this point grid.grid is up to date — render it however you want
                // For now just print the top-left cell as a sanity check:
                // println!("{}", grid.grid[0][0].ch);
            }
        }
    }
    // Wait for the child process to exit
    child.lock().unwrap().wait().unwrap();

    if raw_mode_enabled {
        crossterm::terminal::disable_raw_mode().ok();
    }
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

    fn rendered_rows(grid: &TerminalGrid) -> Vec<String> {
        grid.grid
            .iter()
            .map(|row| row.iter().map(|cell| cell.ch).collect())
            .collect()
    }

    #[test]
    fn erase_in_line_clears_stale_characters_after_shorter_redraw() {
        let mut grid = TerminalGrid::new(1, 8);
        let mut parser = Parser::new();

        parser.advance(&mut grid, b"LAZYVIM");
        parser.advance(&mut grid, b"\rabc\x1b[K");

        let rendered: String = grid.grid[0].iter().map(|cell| cell.ch).collect();
        assert_eq!(rendered, "abc     ");
    }

    #[test]
    fn cursor_backward_sequence_moves_write_position() {
        let mut grid = TerminalGrid::new(1, 4);
        let mut parser = Parser::new();

        parser.advance(&mut grid, b"ABCD\x1b[2DZ");

        let rendered: String = grid.grid[0].iter().map(|cell| cell.ch).collect();
        assert_eq!(rendered, "ABZD");
        assert_eq!(grid.cursor_col, 3);
    }

    #[test]
    fn backspace_moves_cursor_left_for_overwrite() {
        let mut grid = TerminalGrid::new(1, 3);
        let mut parser = Parser::new();

        parser.advance(&mut grid, b"AB\x08Z");

        let rendered: String = grid.grid[0].iter().map(|cell| cell.ch).collect();
        assert_eq!(rendered, "AZ ");
        assert_eq!(grid.cursor_col, 2);
    }

    #[test]
    fn repeated_blank_lines_at_bottom_scroll_full_viewport() {
        let mut grid = TerminalGrid::new(3, 1);
        let mut parser = Parser::new();

        parser.advance(&mut grid, b"A\r\nB\r\n\r\n");

        assert_eq!(rendered_rows(&grid), vec!["B", " ", " "]);
        assert_eq!(grid.cursor_row, 2);
        assert_eq!(grid.cursor_col, 0);
    }

    #[test]
    fn newline_past_last_row_scrolls_up() {
        let mut grid = TerminalGrid::new(3, 1);
        let mut parser = Parser::new();

        parser.advance(&mut grid, b"A\r\nB\r\nC\r\nD");

        assert_eq!(rendered_rows(&grid), vec!["B", "C", "D"]);
        assert_eq!(grid.cursor_row, 2);
        assert_eq!(grid.cursor_col, 1);
    }

    #[test]
    fn scroll_region_preserves_bottom_status_line() {
        let mut grid = TerminalGrid::new(3, 4);
        let mut parser = Parser::new();

        parser.advance(&mut grid, b"\x1b[1;2rA\r\nB\x1b[3;1HS\x1b[2;1H\r\nC");

        assert_eq!(rendered_rows(&grid), vec!["B   ", "C   ", "S   "]);
        assert_eq!(grid.cursor_row, 1);
        assert_eq!(grid.cursor_col, 1);
    }

    #[test]
    fn tmux_clear_sequence_clears_visible_grid() {
        let mut grid = TerminalGrid::new(2, 5);
        let mut parser = Parser::new();

        parser.advance(&mut grid, b"HELLO\r\nWORLD");
        parser.advance(&mut grid, b"\x1b[H\x1b[J\x1b[3J");

        assert!(grid.grid.iter().flatten().all(|cell| cell.ch == ' '));
        assert_eq!(grid.cursor_row, 0);
        assert_eq!(grid.cursor_col, 0);
    }

    #[test]
    fn clear_sequence_repositions_prompt_at_top() {
        let mut grid = TerminalGrid::new(3, 5);
        let mut parser = Parser::new();

        parser.advance(&mut grid, b"A\r\nB\r\nC\x1b[H\x1b[J\x1b[3J>>>");

        assert_eq!(rendered_rows(&grid), vec![">>>  ", "     ", "     "]);
        assert_eq!(grid.cursor_row, 0);
        assert_eq!(grid.cursor_col, 3);
    }

    #[test]
    fn preferred_terminal_program_uses_existing_shell_env() {
        assert_eq!(preferred_terminal_program(Some("/bin/sh")), "/bin/sh");
    }

    #[test]
    fn preferred_terminal_program_falls_back_when_shell_missing() {
        assert_eq!(preferred_terminal_program(Some("/definitely/missing/shell")), "/bin/sh");
        assert_eq!(preferred_terminal_program(None), "/bin/sh");
    }
}
