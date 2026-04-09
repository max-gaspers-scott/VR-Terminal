use axum::http::{HeaderValue, Method, StatusCode};
use axum::response::{Html, IntoResponse};
use axum::{Router, routing::get};
use axum_server::tls_rustls::RustlsConfig;
use socketioxide::{
    SocketIo,
    extract::{Data, SocketRef},
};
use std::env;
use std::net::SocketAddr;
use std::path::PathBuf;
use std::result::Result;
use std::sync::mpsc;
use tokio::sync::watch;
mod terminal;
use terminal::{DEFAULT_COLS, DEFAULT_ROWS, TerminalSnapshot, main_terminal};
use tower::service_fn;
use tower_http::cors::{AllowOrigin, Any, CorsLayer};
use tower_http::services::ServeDir;

async fn health() -> String {
    "healthy".to_string()
}

fn frontend_build_dir() -> PathBuf {
    if let Some(path) = env::var_os("FRONTEND_BUILD_DIR") {
        return PathBuf::from(path);
    }

    if let Ok(current_dir) = env::current_dir() {
        let candidate = current_dir.join("frontend").join("build");
        if candidate.exists() {
            return candidate;
        }
    }

    if let Ok(current_exe) = env::current_exe() {
        if let Some(executable_dir) = current_exe.parent() {
            let candidate = executable_dir.join("frontend").join("build");
            if candidate.exists() {
                return candidate;
            }
        }
    }

    PathBuf::from("frontend").join("build")
}

fn cors_layer() -> Result<CorsLayer, Box<dyn std::error::Error>> {
    let cors = CorsLayer::new()
        .allow_methods([Method::GET, Method::POST, Method::OPTIONS])
        .allow_headers(Any);

    match env::var("CORS_ALLOWED_ORIGINS") {
        Ok(value) => {
            let value = value.trim();

            if value.is_empty() {
                Ok(cors)
            } else if value == "*" {
                Ok(cors.allow_origin(Any))
            } else {
                let origins = value
                    .split(',')
                    .map(str::trim)
                    .filter(|origin| !origin.is_empty())
                    .map(HeaderValue::from_str)
                    .collect::<Result<Vec<_>, _>>()?;

                if origins.is_empty() {
                    Ok(cors)
                } else {
                    Ok(cors.allow_origin(AllowOrigin::list(origins)))
                }
            }
        }
        Err(_) => Ok(cors.allow_origin(AllowOrigin::list([
            "http://localhost:3000".parse()?,
            "http://127.0.0.1:3000".parse()?,
        ]))),
    }
}

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    dotenv::dotenv().ok();

    let (terminal_tx, terminal_rx) =
        watch::channel(TerminalSnapshot::blank(DEFAULT_ROWS, DEFAULT_COLS));
    let (input_tx, input_rx) = mpsc::channel();

    std::thread::spawn(move || {
        main_terminal(terminal_tx, input_rx);
    });

    let (layer, io) = SocketIo::new_layer();
    io.ns("/", move |s: SocketRef| {
        let mut terminal_rx = terminal_rx.clone();
        let input_tx = input_tx.clone();
        async move {
            s.on("terminal-input", move |Data(input): Data<String>| {
                let input_tx = input_tx.clone();
                async move {
                    let _ = input_tx.send(input.into_bytes());
                }
            });

            s.emit("terminal-grid", &*terminal_rx.borrow()).ok();

            let socket = s.clone();
            tokio::spawn(async move {
                while terminal_rx.changed().await.is_ok() {
                    let snapshot = terminal_rx.borrow().clone();
                    if socket.emit("terminal-grid", &snapshot).is_err() {
                        break;
                    }
                }
            });
        }
    });

    let frontend_build_dir = frontend_build_dir();
    let frontend_index_path = frontend_build_dir.join("index.html");
    let static_service =
        ServeDir::new(&frontend_build_dir).not_found_service(service_fn(move |_req| {
            let frontend_index_path = frontend_index_path.clone();
            async move {
                match tokio::fs::read_to_string(&frontend_index_path).await {
                    Ok(body) => Ok((StatusCode::OK, Html(body)).into_response()),
                    Err(err) => Ok((
                        StatusCode::INTERNAL_SERVER_ERROR,
                        format!("Failed to read index.html: {}", err),
                    )
                        .into_response()),
                }
            }
        }));

    let cors = cors_layer()?;
    let port = match env::var("PORT") {
        Ok(value) => value.parse::<u16>()?,
        Err(_) => 8081,
    };

    let app = Router::new()
        .route("/health", get(health))
        //.route("/signed-urls/:video_path", get(get_signed_url))
        .fallback_service(static_service)
        .layer(cors)
        .layer(layer);

    // Check if TLS is enabled via environment variables
    let tls_enabled = env::var("TLS_ENABLED").unwrap_or_default() == "true";

    if tls_enabled {
        let cert_path = env::var("TLS_CERT_PATH").unwrap_or_else(|_| "certs/cert.pem".to_string());
        let key_path = env::var("TLS_KEY_PATH").unwrap_or_else(|_| "certs/key.pem".to_string());

        let rustls_config = RustlsConfig::from_pem_file(cert_path, key_path).await?;

        println!("Starting HTTPS server on 0.0.0.0:{}...", port);
        let addr = SocketAddr::from(([0, 0, 0, 0], port));
        axum_server::bind_rustls(addr, rustls_config)
            .serve(app.into_make_service())
            .await?;
    } else {
        let listener = tokio::net::TcpListener::bind(("0.0.0.0", port)).await?;
        println!("Starting HTTP server on 0.0.0.0:{}...", port);
        axum::serve(listener, app).await?;
    }

    Ok(())
}
