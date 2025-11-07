const express = require('express');
const http = require('http');
const socketIO = require('socket.io');
const pty = require('node-pty');
const os = require('os');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = socketIO(server);

// Serve static files from the public directory
app.use(express.static(path.join(__dirname, 'public')));

// Store terminal sessions
const terminals = {};
const logs = {};

// Socket.io connection handling
io.on('connection', (socket) => {
  console.log('Client connected:', socket.id);

  // Create a new terminal session
  socket.on('create-terminal', () => {
    // Determine shell based on OS
    const shell = os.platform() === 'win32' ? 'powershell.exe' : 'bash';

    // Spawn terminal process
    const term = pty.spawn(shell, [], {
      name: 'xterm-color',
      cols: 80,
      rows: 24,
      cwd: process.env.HOME || process.env.USERPROFILE,
      env: process.env
    });

    // Store terminal instance
    terminals[socket.id] = term;
    logs[socket.id] = '';

    console.log(`Created terminal for ${socket.id} (pid: ${term.pid})`);

    // Send terminal output to client
    term.on('data', (data) => {
      logs[socket.id] += data;
      socket.emit('terminal-output', data);
    });

    // Handle terminal exit
    term.on('exit', (code, signal) => {
      console.log(`Terminal ${socket.id} exited with code ${code}`);
      delete terminals[socket.id];
      delete logs[socket.id];
      socket.emit('terminal-exit', { code, signal });
    });

    // Send confirmation to client
    socket.emit('terminal-ready', {
      pid: term.pid,
      cols: term.cols,
      rows: term.rows
    });
  });

  // Handle input from client
  socket.on('terminal-input', (data) => {
    if (terminals[socket.id]) {
      terminals[socket.id].write(data);
    }
  });

  // Handle terminal resize
  socket.on('terminal-resize', ({ cols, rows }) => {
    if (terminals[socket.id]) {
      terminals[socket.id].resize(cols, rows);
      console.log(`Resized terminal ${socket.id} to ${cols}x${rows}`);
    }
  });

  // Handle disconnection
  socket.on('disconnect', () => {
    console.log('Client disconnected:', socket.id);

    // Kill terminal process
    if (terminals[socket.id]) {
      terminals[socket.id].kill();
      delete terminals[socket.id];
      delete logs[socket.id];
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`VR Terminal Server running on http://localhost:${PORT}`);
  console.log('Open in VR-enabled browser to start using the terminal');
});
