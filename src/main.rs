use axum::http::Method;
use axum::http::StatusCode;
use axum::{
    Json, Router,
    extract::{self, Path, Query},
    routing::{get, post},
};
use minio_rsc::{Minio, client::PresignedArgs, provider::StaticProvider};
use reqwest;
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use socketioxide;
use sqlx::PgPool;
use sqlx::types::chrono::Utc;
use sqlx::{postgres::PgPoolOptions, prelude::FromRow};
use std::collections::HashMap;
use std::env;
use std::net::SocketAddr;
use std::result::Result;
use std::sync::Arc;
mod terminal;
use terminal::main_terminal;
use tower_http::cors::{AllowOrigin, CorsLayer};

use axum::response::{Html, IntoResponse};
use tower::service_fn;
use tower_http::services::ServeDir;

async fn health() -> String {
    "healthy".to_string()
}

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    main_terminal();
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
        );

    let listener = tokio::net::TcpListener::bind("0.0.0.0:8081").await.unwrap();

    axum::serve(listener, app).await.unwrap();
    Ok(())
}
