# VR-Terminal

A high-performance PTY terminal emulator for WebVR. Interact with your computer's CLI applications and files from within a virtual reality environment (Meta Quest, phone VR, etc.).

## Why VR-Terminal?

Traditional VNC or screen-casting solutions for VR often suffer from high bandwidth requirements and latency because they stream grids of pixels. VR-Terminal takes a different approach by streaming a **grid of characters**, similar to how SSH or local terminals work.

- **Low Bandwidth:** Only character data and styling metadata are sent over the wire.
- **Portability:** Designed to work on any device with a modern web browser and WebVR support.
- **Native Performance:** Uses a real PTY (Pseudo-Terminal) on the host machine for full compatibility with CLI tools.

## ⚠️ Security Warning

**VR-Terminal provides direct shell access to your host computer via a web browser.**

- **Localhost Only:** By default, you should only run this on `localhost`.
- **Network Exposure:** Do **NOT** make this application accessible from the public internet or an ntrusted network unless you have implemented robust authentication and understand the security implications.
- **Root Access:** Avoid running the backend as a root user, as any user with access to the web interface will have full control over your system.

## Technical Stack

### Backend (Rust)
- **Axum:** High-performance web framework.
- **Socketioxide:** Socket.IO server implementation for real-time grid streaming.
- **Portable-PTY:** Cross-platform PTY interface.
- **VTE:** A library-agnostic terminal emulator engine (parser).
- **Tokio:** Asynchronous runtime for handling multiple concurrent streams.

### Frontend (React & A-Frame)
- **React:** Component-based UI logic.
- **A-Frame:** WebVR framework for rendering the virtual environment.
- **2D Canvas Texture:** The terminal is rendered to a 2D canvas and mapped as a dynamic texture onto a 3D plane in the VR scene.
- **Socket.IO Client:** Receives real-time terminal snapshots.

## Getting Started

### Prerequisites
- [Rust](https://www.rust-lang.org/) (latest stable)
- [Node.js](https://nodejs.org/) (v18+)
- [Docker](https://www.docker.com/) (optional, for containerized deployment)

### Manual Setup

1. **Clone the repository:**
   ```bash
   git clone https://github.com/your-username/VR-Terminal.git
   cd VR-Terminal
   ```

2. **Build the Frontend:**
   ```bash
   cd frontend
   npm install
   npm run build
   cd ..
   ```

3. **Run the Backend:**
   ```bash
   cargo run --release
   ```
   The server will start at `http://localhost:8081`.

4. **Access the Terminal:**
   Open `http://localhost:8081` in your browser. Click "Enter VR" to switch to the virtual environment.

### Docker Setup

You can also run the entire stack using Docker Compose:

```bash
docker-compose up --build
```

### SSL/TLS Setup

For WebVR to work properly on some headsets (like Meta Quest), you may need to serve the application over HTTPS.

1. **Generate self-signed certificates:**
   ```bash
   mkdir -p certs
   openssl req -x509 -newkey rsa:4096 -keyout certs/key.pem -out certs/cert.pem -days 365 -nodes -subj "/CN=localhost"
   ```

2. **Run with TLS enabled:**
   ```bash
   TLS_ENABLED=true TLS_CERT_PATH=certs/cert.pem TLS_KEY_PATH=certs/key.pem cargo run --release
   ```

## Environment Variables

- `PORT`: The port the server listens on (default: `8081`).
- `TLS_ENABLED`: Set to `true` to enable HTTPS (requires `TLS_CERT_PATH` and `TLS_KEY_PATH`).
- `FRONTEND_BUILD_DIR`: Path to the frontend build artifacts (default: `frontend/build`).
- `CORS_ALLOWED_ORIGINS`: Comma-separated list of allowed origins.

## Roadmap

- [ ] **G1 Support:** Optimized rendering for low-end VR headsets.
- [ ] **Remote Server Options:** Support for connecting to remote SSH targets.
- [ ] **Keybard mapping as part of the terminal, for folks that use tools like kanata**

## License

Apache 2.0
