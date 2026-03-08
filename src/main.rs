use axum::http::{Method, StatusCode};
use axum::response::{Html, IntoResponse};
use axum::{Router, routing::get};
use socketioxide::{SocketIo, extract::{Data, SocketRef}};
use std::result::Result;
use std::sync::mpsc;
use tokio::sync::watch;
mod terminal;
use terminal::{DEFAULT_COLS, DEFAULT_ROWS, TerminalSnapshot, main_terminal};
use tower::service_fn;
use tower_http::cors::{AllowOrigin, CorsLayer};
use tower_http::services::ServeDir;

async fn health() -> String {
    "healthy".to_string()
}

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
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

    let static_service =
        ServeDir::new("frontend/build").not_found_service(service_fn(|_req| async {
            match tokio::fs::read_to_string("frontend/build/index.html").await {
                Ok(body) => Ok((StatusCode::OK, Html(body)).into_response()),
                Err(err) => Ok((
                    StatusCode::INTERNAL_SERVER_ERROR,
                    format!("Failed to read index.html: {}", err),
                )
                    .into_response()),
            }
        }));

    let app = Router::new()
        .route("/health", get(health))
        //.route("/signed-urls/:video_path", get(get_signed_url))
        .fallback_service(static_service)
        .layer(
            CorsLayer::new()
                .allow_origin(AllowOrigin::list(vec![
                    "http://localhost:3000".parse().unwrap(),
                    "https://example.com".parse().unwrap(),
                ]))
                .allow_methods([Method::GET, Method::POST])
                .allow_headers(tower_http::cors::Any),
        )
        .layer(layer);

    let listener = tokio::net::TcpListener::bind("0.0.0.0:8081").await.unwrap();

    axum::serve(listener, app).await.unwrap();
    Ok(())
}
