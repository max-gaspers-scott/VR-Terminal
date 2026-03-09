//! Integration tests for the generated API endpoints

use reqwest;
use serde_json::Value;
use std::process::Command;

// Helper function to start the test server
async fn start_test_server() -> Result<tokio::process::Child, Box<dyn std::error::Error>> {
    let mut cmd = Command::new("cargo");
    cmd.arg("run");
    // You might want to set a different port for testing
    cmd.env("PORT", "8082");
    
    let child = tokio::process::Command::from(cmd)
        .spawn()
        .map_err(|e| format!("Failed to start test server: {}", e))?;
        
    // Give the server some time to start
    tokio::time::sleep(tokio::time::Duration::from_secs(2)).await;
    
    Ok(child)
}

// Helper function to create a test client
fn create_test_client() -> reqwest::Client {
    reqwest::Client::new()
}

#[tokio::test]
async fn test_health_endpoint() {
    // Start the test server
    let _server_handle = start_test_server().await.expect("Failed to start test server");
    
    // Create a client
    let client = create_test_client();
    
    // Make a request to the health endpoint
    let response = client
        .get("http://localhost:8082/health")
        .send()
        .await
        .expect("Failed to send request");
        
    assert_eq!(response.status(), 200);
    
    let body = response
        .text()
        .await
        .expect("Failed to read response body");
        
    assert_eq!(body, "healthy");
}
