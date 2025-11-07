# VR Terminal

A fully functional terminal emulator in Virtual Reality with complete ANSI color and text formatting support.

## Features

- **Full Terminal Emulation**: Real terminal process using node-pty
- **ANSI Color Support**: Complete color and formatting support via xterm.js
- **VR Interface**: Immersive 3D environment using Three.js and WebXR
- **Virtual Keyboard**: Interactive 3D keyboard for input in VR
- **Real-time Updates**: WebSocket communication for instant terminal I/O
- **Cross-platform**: Works on Windows (PowerShell), macOS, and Linux (Bash)

## Tech Stack

- **Backend**: Node.js, Express, Socket.io, node-pty
- **Frontend**: Three.js, WebXR, xterm.js
- **VR**: WebXR API for VR headset support

## Installation

```bash
npm install
```

## Running

```bash
npm start
```

The server will start on `http://localhost:3000`

## Usage

1. Open the application in a WebXR-compatible browser (Chrome, Edge, Firefox)
2. Connect your VR headset (Meta Quest, Valve Index, etc.)
3. Click the "Enter VR" button
4. Type using either:
   - **Physical Keyboard**: Type directly with any USB/Bluetooth keyboard
   - **Virtual Keyboard**: Point VR controllers at on-screen keys and press trigger

## Input Methods

### Physical Keyboard (Recommended)
- **Direct Typing**: All keys work including special characters
- **Ctrl Combinations**: Ctrl+C, Ctrl+D, Ctrl+Z, etc.
- **Navigation**: Arrow keys, Home, End, Page Up/Down
- **Function Keys**: Delete, Insert, Tab, Escape
- **Copy/Paste**: Standard clipboard operations (Ctrl+V)

### VR Controllers (Optional)
- **Trigger Button**: Select/Click keys on virtual keyboard
- **Controller Ray**: Point at keyboard or terminal
- **Green Ray**: Shows where you're pointing

### Android Phone + Headset
Perfect for mobile VR with a physical keyboard:
- Connect Bluetooth or USB keyboard to Android phone
- Place phone in VR headset (Cardboard, Gear VR, etc.)
- Use physical keyboard to type
- VR controllers are optional

## Testing ANSI Colors

Once in the terminal, try these commands to test color support:

```bash
# List files with colors
ls --color=auto

# Show color test
echo -e "\033[31mRed\033[0m \033[32mGreen\033[0m \033[33mYellow\033[0m \033[34mBlue\033[0m"

# Run a command that uses colors
git status

# Use a tool like htop or vim which use ANSI codes
htop
```

## Project Structure

```
/
├── server.js              # Backend server with node-pty
├── package.json           # Dependencies
└── public/
    ├── index.html         # Entry point
    ├── app.js            # Main VR application
    ├── terminal3d.js     # Terminal rendering in 3D
    └── vrkeyboard.js     # Virtual keyboard implementation
```

## Browser Compatibility

- **Chrome/Edge**: Full WebXR support
- **Firefox**: WebXR support with flag enabled
- **Safari**: Limited WebXR support

## VR Headset Compatibility

- Meta Quest 2/3/Pro
- Valve Index
- HTC Vive
- Windows Mixed Reality
- Any WebXR-compatible headset

## Troubleshooting

### Terminal not connecting
- Ensure the server is running
- Check browser console for errors
- Verify WebSocket connection

### VR not working
- Check if browser supports WebXR
- Ensure VR headset is properly connected
- Try refreshing the page

### Colors not displaying
- ANSI colors should work automatically
- Check terminal theme in `terminal3d.js`
- Ensure the command you're running outputs ANSI codes

## Development

To run in development mode with auto-restart:

```bash
npm run dev
```

## License

MIT
