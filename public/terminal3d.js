import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.158.0/build/three.module.js';

export class Terminal3D {
  constructor(scene) {
    this.scene = scene;
    this.terminal = null;
    this.terminalCanvas = null;
    this.texture = null;
    this.mesh = null;
    this.socket = null;
    this.isReady = false;

    this.init();
    this.connectToBackend();
  }

  init() {
    // Create hidden div for xterm.js
    const container = document.createElement('div');
    container.style.position = 'absolute';
    container.style.left = '-9999px';
    container.style.width = '1024px';
    container.style.height = '768px';
    document.body.appendChild(container);

    // Initialize xterm.js terminal
    this.terminal = new Terminal({
      cols: 80,
      rows: 24,
      fontSize: 16,
      fontFamily: 'Consolas, "Courier New", monospace',
      theme: {
        background: '#0f0f1e',
        foreground: '#00ff00',
        cursor: '#00ff00',
        black: '#000000',
        red: '#ff5555',
        green: '#50fa7b',
        yellow: '#f1fa8c',
        blue: '#bd93f9',
        magenta: '#ff79c6',
        cyan: '#8be9fd',
        white: '#bbbbbb',
        brightBlack: '#555555',
        brightRed: '#ff6e6e',
        brightGreen: '#69ff94',
        brightYellow: '#ffffa5',
        brightBlue: '#d6acff',
        brightMagenta: '#ff92df',
        brightCyan: '#a4ffff',
        brightWhite: '#ffffff'
      },
      cursorBlink: true,
      cursorStyle: 'block'
    });

    this.terminal.open(container);

    // Get the canvas element created by xterm.js
    this.terminalCanvas = container.querySelector('canvas');

    if (!this.terminalCanvas) {
      console.error('Failed to get terminal canvas');
      return;
    }

    // Create texture from canvas
    this.texture = new THREE.CanvasTexture(this.terminalCanvas);
    this.texture.minFilter = THREE.LinearFilter;
    this.texture.magFilter = THREE.LinearFilter;

    // Create plane geometry for terminal display
    const width = 2.5;
    const height = (width * this.terminalCanvas.height) / this.terminalCanvas.width;

    const geometry = new THREE.PlaneGeometry(width, height);
    const material = new THREE.MeshBasicMaterial({
      map: this.texture,
      side: THREE.DoubleSide
    });

    this.mesh = new THREE.Mesh(geometry, material);
    this.scene.add(this.mesh);

    // Add a border frame
    const frameGeometry = new THREE.PlaneGeometry(width + 0.1, height + 0.1);
    const frameMaterial = new THREE.MeshBasicMaterial({
      color: 0x333333,
      side: THREE.DoubleSide
    });
    const frame = new THREE.Mesh(frameGeometry, frameMaterial);
    frame.position.z = -0.01;
    this.mesh.add(frame);

    console.log('Terminal3D initialized');
  }

  connectToBackend() {
    // Connect to Socket.io server
    this.socket = io();

    this.socket.on('connect', () => {
      console.log('Connected to backend');
      // Create terminal session
      this.socket.emit('create-terminal');
    });

    this.socket.on('terminal-ready', (data) => {
      console.log('Terminal ready:', data);
      this.isReady = true;
    });

    this.socket.on('terminal-output', (data) => {
      // Write data to xterm.js terminal
      if (this.terminal) {
        this.terminal.write(data);
      }
    });

    this.socket.on('terminal-exit', (data) => {
      console.log('Terminal exited:', data);
      this.isReady = false;
    });

    this.socket.on('disconnect', () => {
      console.log('Disconnected from backend');
      this.isReady = false;
    });
  }

  handleKeyPress(key, ctrlKey = false, altKey = false) {
    if (!this.isReady || !this.socket) {
      return;
    }

    // Handle Ctrl combinations
    if (ctrlKey && key.length === 1) {
      const code = key.toLowerCase().charCodeAt(0);
      if (code >= 97 && code <= 122) { // a-z
        this.socket.emit('terminal-input', String.fromCharCode(code - 96));
        return;
      }
    }

    // Handle special keys
    if (key === 'Enter') {
      this.socket.emit('terminal-input', '\r');
    } else if (key === 'Backspace') {
      this.socket.emit('terminal-input', '\x7f');
    } else if (key === 'Tab') {
      this.socket.emit('terminal-input', '\t');
    } else if (key === 'Space' || key === ' ') {
      this.socket.emit('terminal-input', ' ');
    } else if (key === 'Escape') {
      this.socket.emit('terminal-input', '\x1b');
    } else if (key === 'ArrowUp') {
      this.socket.emit('terminal-input', '\x1b[A');
    } else if (key === 'ArrowDown') {
      this.socket.emit('terminal-input', '\x1b[B');
    } else if (key === 'ArrowRight') {
      this.socket.emit('terminal-input', '\x1b[C');
    } else if (key === 'ArrowLeft') {
      this.socket.emit('terminal-input', '\x1b[D');
    } else if (key === 'Home') {
      this.socket.emit('terminal-input', '\x1b[H');
    } else if (key === 'End') {
      this.socket.emit('terminal-input', '\x1b[F');
    } else if (key === 'Delete') {
      this.socket.emit('terminal-input', '\x1b[3~');
    } else if (key === 'PageUp') {
      this.socket.emit('terminal-input', '\x1b[5~');
    } else if (key === 'PageDown') {
      this.socket.emit('terminal-input', '\x1b[6~');
    } else if (key === 'Insert') {
      this.socket.emit('terminal-input', '\x1b[2~');
    } else if (key.length === 1) {
      // Regular character
      this.socket.emit('terminal-input', key);
    }
  }

  focus() {
    // Visual feedback when terminal is focused
    if (this.mesh) {
      this.mesh.material.emissive = new THREE.Color(0x222222);
      this.mesh.material.emissiveIntensity = 0.3;
    }
  }

  update() {
    // Update texture from canvas
    if (this.texture && this.terminalCanvas) {
      this.texture.needsUpdate = true;
    }
  }

  set position(pos) {
    if (this.mesh) {
      this.mesh.position.copy(pos);
    }
  }

  get position() {
    return this.mesh ? this.mesh.position : new THREE.Vector3();
  }
}
