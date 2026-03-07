use portable_pty::{CommandBuilder, PtySize, native_pty_system};
use std::io::{Read, Write};
use std::sync::{Arc, Mutex};
use vte::{Params, Parser, Perform};

#[derive(Clone)]
struct Cell {
    ch: char,
    fg: [u8; 3],
    bg: [u8; 3],
}

struct TerminalGrid {
    grid: Vec<Vec<Cell>>,
    cursor_row: usize,
    cursor_col: usize,
    current_fg: [u8; 3],
    current_bg: [u8; 3],
    rows: usize,
    cols: usize,
}

impl TerminalGrid {
    fn new(rows: usize, cols: usize) -> Self {
        let blank = Cell {
            ch: ' ',
            fg: [255, 255, 255],
            bg: [0, 0, 0],
        };
        Self {
            grid: vec![vec![blank; cols]; rows],
            cursor_row: 0,
            cursor_col: 0,
            current_fg: [255, 255, 255],
            current_bg: [0, 0, 0],
            rows,
            cols,
        }
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
                for param in params.iter() {
                    match param {
                        [0] => {
                            self.current_fg = [255, 255, 255];
                            self.current_bg = [0, 0, 0];
                        }
                        // Foreground RGB: ESC[38;2;r;g;bm  (vte flattens to one slice)
                        [38, 2, r, g, b] => {
                            self.current_fg = [*r as u8, *g as u8, *b as u8];
                        }
                        // Background RGB: ESC[48;2;r;g;bm
                        [48, 2, r, g, b] => {
                            self.current_bg = [*r as u8, *g as u8, *b as u8];
                        }
                        _ => {}
                    }
                }
            }
            // Erase display: ESC[2J
            'J' => {
                let blank = Cell {
                    ch: ' ',
                    fg: self.current_fg,
                    bg: self.current_bg,
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
pub fn main_terminal() {
    let rows = 40usize;
    let cols = 120usize;
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
    let mut reader = pair.master.try_clone_reader().unwrap();
    // std::thread::spawn(move || {
    //     let mut buf = [0u8; 4096];
    //     let stdout = std::io::stdout();
    //     let mut out = stdout.lock();
    //     loop {
    //         match reader.read(&mut buf) {
    //             Ok(0) | Err(_) => break,
    //             Ok(n) => {
    //                 out.write_all(&buf[..n]).unwrap();
    //                 out.flush().unwrap();
    //             }
    //         }
    //     }
    // });

    // Thread 2: your real stdin → PTY input
    let mut writer = pair.master.take_writer().unwrap();
    let child_for_thread = Arc::clone(&child);
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
                    writer.write_all(&buf[..n]).unwrap();
                }
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
