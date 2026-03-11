
# -----------------------------------------------------------------------------
#  Multi-stage Dockerfile for "testing" Rust / Axum API (production)
# -----------------------------------------------------------------------------
# 1. Builder image: compile the binary in release mode
# -----------------------------------------------------------------------------
FROM rustlang/rust:nightly-bookworm-slim AS builder

# Install build dependencies that some crates (e.g. sqlx / openssl) may need
RUN apt-get update && apt-get install -y --no-install-recommends pkg-config libssl-dev ca-certificates && rm -rf /var/lib/apt/lists/*

# Create app directory inside the container
WORKDIR /app

# Cache dependencies first – copy manifest files only
COPY Cargo.toml Cargo.lock ./

# Set the default toolchain to nightly
RUN rustup default nightly

# Dummy main to build dependency layers and speed up subsequent builds
# RUN echo "fn main() {}" > src/main.rs #     && cargo build --release #     && rm -rf src

# Copy the actual source tree and build the real binary
COPY . .
RUN cargo build -j 6 --release


# -----------------------------------------------------------------------------
# Frontend build stage
# -----------------------------------------------------------------------------
FROM node:18-alpine AS frontend-builder

WORKDIR /app/frontend

COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci

COPY frontend/ ./
RUN npm run build


# -----------------------------------------------------------------------------
# 2. Runtime image: copy the binary into a minimal base image
# -----------------------------------------------------------------------------
FROM debian:bookworm-slim AS runtime

# Install certificates (TLS) & clean apt caches
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates curl libssl3 && rm -rf /var/lib/apt/lists/*

# Create an unprivileged user to run the app
RUN useradd -m -u 10001 appuser

WORKDIR /app

# Copy compiled binary & frontend build output
COPY --from=builder /app/target/release/test2 ./vr-terminal
COPY --from=frontend-builder /app/frontend/build ./frontend/build

# Ensure the binary is executable
RUN chown -R appuser:appuser /app && chmod +x /app/vr-terminal

USER appuser

# The application listens on port 8081 – expose it to the host
EXPOSE 8081

# Start the server
CMD ["/app/vr-terminal"]

