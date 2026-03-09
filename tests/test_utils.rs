//! Test utilities for database setup, data seeding, and cleanup

use sqlx::{PgPool, PgPoolOptions};
use std::env;
use std::process::Command;
use tokio::time::{sleep, Duration};

/// Create a test database connection
pub async fn create_test_database_pool() -> Result<PgPool, Box<dyn std::error::Error>> {
    // Use a separate test database URL, or default to the main one with a test suffix
    let database_url = env::var("TEST_DATABASE_URL")
        .unwrap_or_else(|_| "postgres://dbuser:p@localhost:1111/test_data".to_string());
    
    let pool = PgPoolOptions::new()
        .max_connections(5)
        .connect(&database_url)
        .await?;
    
    Ok(pool)
}

/// Seed the database with test data
pub async fn seed_test_data(pool: &PgPool) -> Result<(), Box<dyn std::error::Error>> {
    // This function would be customized based on the generated API's data model
    // For now, we'll provide a generic template
    
    // Example of how to insert test data:
    /*
    sqlx::query!(
        "INSERT INTO users (id, name, email) VALUES ($1, $2, $3)",
        uuid::Uuid::new_v4(),
        "Test User",
        "test@example.com"
    )
    .execute(pool)
    .await?;
    */
    
    Ok(())
}

/// Clean up test data
pub async fn cleanup_test_data(pool: &PgPool) -> Result<(), Box<dyn std::error::Error>> {
    // This function would be customized based on the generated API's data model
    // For now, we'll provide a generic template
    
    // Example of how to clean up test data:
    /*
    sqlx::query!("DELETE FROM users WHERE email LIKE 'test_%'")
        .execute(pool)
        .await?;
    */
    
    Ok(())
}

/// Set up a test database with migrations
pub async fn setup_test_database() -> Result<PgPool, Box<dyn std::error::Error>> {
    let pool = create_test_database_pool().await?;
    
    // Run migrations
    sqlx::migrate!("../migrations")
        .run(&pool)
        .await
        .map_err(|e| format!("Failed to run migrations: {}", e))?;
    
    // Seed with test data
    seed_test_data(&pool).await?;
    
    Ok(pool)
}

/// Test server management utilities
pub struct TestServer {
    child: Option<tokio::process::Child>,
    port: u16,
}

impl TestServer {
    /// Create a new test server instance
    pub async fn new() -> Result<Self, Box<dyn std::error::Error>> {
        Self::with_port(8082).await
    }
    
    /// Create a new test server instance with a specific port
    pub async fn with_port(port: u16) -> Result<Self, Box<dyn std::error::Error>> {
        let mut cmd = Command::new("cargo");
        cmd.arg("run");
        cmd.env("PORT", port.to_string());
        cmd.env("DATABASE_URL", "postgres://dbuser:p@localhost:1111/test_data");
        
        let child = tokio::process::Command::from(cmd)
            .spawn()
            .map_err(|e| format!("Failed to start test server: {}", e))?;
            
        // Give the server some time to start
        sleep(Duration::from_secs(3)).await;
        
        Ok(TestServer {
            child: Some(child),
            port,
        })
    }
    
    /// Get the base URL for the test server
    pub fn base_url(&self) -> String {
        format!("http://localhost:{}", self.port)
    }
    
    /// Get a reqwest client configured for testing
    pub fn client(&self) -> reqwest::Client {
        reqwest::Client::new()
    }
}

impl Drop for TestServer {
    fn drop(&mut self) {
        if let Some(mut child) = self.child.take() {
            // Attempt to kill the child process
            let _ = child.start_kill();
        }
    }
}
