//! Rust-side AI transport for Relax Note.
//!
//! The API key never crosses back into the WebView. Credentials are stored in
//! the OS credential store (Secret Service on Linux) or, when that store is
//! unavailable, in a session-only in-memory map. `ai_chat` resolves the key
//! internally by the request's normalized endpoint identity.
//!
//! This is deliberately NOT a general-purpose HTTP proxy: it accepts only a
//! fixed chat-completions request shape and a validated base URL.

use std::collections::HashMap;
use std::sync::Mutex;
use std::time::Duration;

use serde::{Deserialize, Serialize};
use serde_json::Value;
use tauri::State;
use url::Url;

const KEYRING_SERVICE: &str = "dev.randolf.relaxnote";
const DEFAULT_TIMEOUT_MS: u64 = 45_000;
const MIN_TIMEOUT_MS: u64 = 1_000;
const MAX_TIMEOUT_MS: u64 = 600_000;
const MAX_MESSAGES: usize = 16;
const MAX_MESSAGE_BYTES: usize = 32 * 1024;
const MAX_MODEL_LEN: usize = 128;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AiMessage {
    pub role: String,
    pub content: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AiChatResult {
    pub content: String,
    pub model: String,
    /// Normalized `choices[0].finish_reason`: "stop", "length", "other", or
    /// absent when the provider omits it.
    pub finish_reason: Option<String>,
}

pub struct AiState {
    client: reqwest::Client,
    session_keys: Mutex<HashMap<String, String>>,
    in_flight: Mutex<HashMap<String, tokio::task::AbortHandle>>,
}

impl AiState {
    pub fn new() -> Result<Self, reqwest::Error> {
        let client = reqwest::Client::builder()
            .timeout(Duration::from_millis(DEFAULT_TIMEOUT_MS))
            // A redirect must never be able to carry the Authorization header
            // to a different host.
            .redirect(reqwest::redirect::Policy::none())
            .use_rustls_tls()
            .build()?;
        Ok(Self {
            client,
            session_keys: Mutex::new(HashMap::new()),
            in_flight: Mutex::new(HashMap::new()),
        })
    }
}

fn is_loopback(host: &str) -> bool {
    let h = host.trim_matches(|c| c == '[' || c == ']');
    h.eq_ignore_ascii_case("localhost") || h == "127.0.0.1" || h == "::1"
}

/// Validates a user-configured OpenAI-compatible base URL.
///
/// Only `http`/`https` are allowed; embedded credentials, fragments, and query
/// parameters are rejected. Plain `http` is allowed only for loopback hosts so
/// local Ollama-style endpoints keep working.
pub fn validate_base_url(base_url: &str) -> Result<Url, String> {
    let url = Url::parse(base_url.trim()).map_err(|_| "Invalid endpoint URL".to_string())?;
    match url.scheme() {
        "http" | "https" => {}
        _ => return Err("Only http and https endpoints are supported".to_string()),
    }
    if !url.username().is_empty() || url.password().is_some() {
        return Err("Endpoint URL must not contain embedded credentials".to_string());
    }
    if url.fragment().is_some() {
        return Err("Endpoint URL must not contain a fragment".to_string());
    }
    if url.query().is_some() {
        return Err("Endpoint URL must not contain query parameters".to_string());
    }
    let host = url.host_str().ok_or("Endpoint URL must include a host")?;
    if url.scheme() == "http" && !is_loopback(host) {
        return Err(
            "Plain http is only allowed for localhost, 127.0.0.1, or ::1".to_string(),
        );
    }
    Ok(url)
}

/// Derives the chat-completions endpoint from a base URL, preserving the base
/// path. `Url::join` is intentionally NOT used: joining `chat/completions`
/// against `https://host/v1` would drop the `v1` segment.
pub fn chat_endpoint(base_url: &str) -> Result<Url, String> {
    let mut url = validate_base_url(base_url)?;
    let path = url.path().trim_end_matches('/').to_string();
    let new_path = if path.is_empty() {
        "/chat/completions".to_string()
    } else {
        format!("{path}/chat/completions")
    };
    url.set_path(&new_path);
    url.set_query(None);
    url.set_fragment(None);
    Ok(url)
}

/// Normalized credential identity: scheme + lowercased host + resolved port.
/// `https://host` and `https://host:443` map to the same identity.
pub fn normalized_origin(base_url: &str) -> Result<String, String> {
    let url = validate_base_url(base_url)?;
    let host = url
        .host_str()
        .ok_or("Endpoint URL must include a host")?
        .to_ascii_lowercase();
    match url.port_or_known_default() {
        Some(port) => Ok(format!("{}://{}:{}", url.scheme(), host, port)),
        None => Ok(format!("{}://{}", url.scheme(), host)),
    }
}

fn credential_entry(origin: &str) -> Result<keyring::Entry, String> {
    keyring::Entry::new(KEYRING_SERVICE, origin)
        .map_err(|_| "Secure credential storage is unavailable".to_string())
}

fn load_key(state: &AiState, origin: &str) -> Result<Option<String>, String> {
    if let Some(key) = state
        .session_keys
        .lock()
        .map_err(|_| "Credential state unavailable".to_string())?
        .get(origin)
        .cloned()
    {
        return Ok(Some(key));
    }
    match credential_entry(origin)?.get_password() {
        Ok(key) => Ok(Some(key)),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(_) => Err("Credential store error".to_string()),
    }
}

fn validate_messages(messages: &[AiMessage]) -> Result<(), String> {
    if messages.is_empty() {
        return Err("No messages provided".to_string());
    }
    if messages.len() > MAX_MESSAGES {
        return Err("Too many messages".to_string());
    }
    let mut total = 0usize;
    for message in messages {
        if !matches!(message.role.as_str(), "system" | "user" | "assistant") {
            return Err("Invalid message role".to_string());
        }
        total += message.content.len();
    }
    if total > MAX_MESSAGE_BYTES {
        return Err("Message payload is too large".to_string());
    }
    Ok(())
}

fn validate_model(model: &str) -> Result<(), String> {
    if model.trim().is_empty() {
        return Err("A model name is required".to_string());
    }
    if model.len() > MAX_MODEL_LEN {
        return Err("Model name is too long".to_string());
    }
    if model.chars().any(|c| c.is_control()) {
        return Err("Model name contains control characters".to_string());
    }
    Ok(())
}

fn map_request_error(error: reqwest::Error) -> String {
    if error.is_timeout() {
        "AI request timed out".to_string()
    } else if error.is_connect() {
        "Could not connect to the AI endpoint".to_string()
    } else {
        "AI request failed".to_string()
    }
}

/// Extracts assistant text from a `content` value that may be a string or an
/// array of content parts. Empty/whitespace values are treated as absent.
fn content_text(value: &Value) -> Option<String> {
    match value {
        Value::String(s) => {
            if s.trim().is_empty() {
                None
            } else {
                Some(s.clone())
            }
        }
        Value::Array(parts) => {
            let mut out = String::new();
            for part in parts {
                if let Some(text) = part.get("text").and_then(Value::as_str) {
                    out.push_str(text);
                } else if let Some(text) = part.as_str() {
                    out.push_str(text);
                }
            }
            if out.trim().is_empty() {
                None
            } else {
                Some(out)
            }
        }
        _ => None,
    }
}

/// Normalizes a provider finish reason to one of "stop", "length", or "other".
fn normalize_finish_reason(value: &str) -> String {
    match value {
        "stop" => "stop".to_string(),
        "length" => "length".to_string(),
        _ => "other".to_string(),
    }
}

/// Normalizes an OpenAI-compatible chat-completions response to assistant text.
/// The final `message.content` is authoritative; `reasoning_content` is used
/// only when final content is absent or empty.
fn extract_assistant_text(body: &str, requested_model: &str) -> Result<AiChatResult, String> {
    let value: Value =
        serde_json::from_str(body).map_err(|_| "AI endpoint returned an invalid response".to_string())?;

    let choice = value
        .get("choices")
        .and_then(Value::as_array)
        .and_then(|choices| choices.first());

    let finish_reason = choice
        .and_then(|choice| choice.get("finish_reason"))
        .and_then(Value::as_str)
        .map(normalize_finish_reason);

    if cfg!(debug_assertions) {
        let keys: Vec<&str> = value
            .as_object()
            .map(|object| object.keys().map(String::as_str).collect())
            .unwrap_or_default();
        let choices_count = value
            .get("choices")
            .and_then(Value::as_array)
            .map(Vec::len)
            .unwrap_or(0);
        log::debug!(
            "[ai] response keys={:?} choices={} finish_reason={:?}",
            keys,
            choices_count,
            finish_reason
        );
    }

    let model = value
        .get("model")
        .and_then(Value::as_str)
        .unwrap_or(requested_model)
        .to_string();

    let message = choice.and_then(|choice| choice.get("message"));

    let content = message
        .and_then(|message| message.get("content"))
        .and_then(content_text);

    let content = match content {
        Some(text) => text,
        None => {
            // Reasoning fields must never replace a present final answer.
            let reasoning = message
                .and_then(|message| {
                    message
                        .get("reasoning_content")
                        .or_else(|| message.get("reasoning"))
                })
                .and_then(content_text);
            match reasoning {
                Some(text) => text,
                None => return Err("The AI endpoint returned no assistant content".to_string()),
            }
        }
    };

    if cfg!(debug_assertions) {
        let preview: String = content.chars().take(200).collect();
        log::debug!(
            "[ai] assistant content len={} model={} finish_reason={:?} preview={:?}",
            content.len(),
            model,
            finish_reason,
            preview
        );
    }

    Ok(AiChatResult {
        content,
        model,
        finish_reason,
    })
}

#[allow(clippy::too_many_arguments)]
async fn run_chat(
    state: &AiState,
    base_url: String,
    model: String,
    messages: Vec<AiMessage>,
    temperature: Option<f64>,
    json_mode: Option<bool>,
    max_tokens: Option<u32>,
    request_id: Option<String>,
    timeout_ms: Option<u64>,
) -> Result<AiChatResult, String> {
    let endpoint = chat_endpoint(&base_url)?;
    let origin = normalized_origin(&base_url)?;
    validate_model(&model)?;
    validate_messages(&messages)?;

    // Clamp the per-request timeout to a sane range; omitted → the transport
    // default (DEFAULT_TIMEOUT_MS) still applies, so Vocabulary is unchanged.
    let timeout_ms = timeout_ms
        .map(|ms| ms.clamp(MIN_TIMEOUT_MS, MAX_TIMEOUT_MS))
        .unwrap_or(DEFAULT_TIMEOUT_MS);

    let key = load_key(state, &origin)?
        .ok_or_else(|| "No API key is configured for this endpoint".to_string())?;

    let mut body = serde_json::json!({
        "model": model,
        "messages": messages,
        "temperature": temperature.unwrap_or(0.0).clamp(0.0, 2.0),
    });
    if let Some(max_tokens) = max_tokens {
        body["max_tokens"] = serde_json::json!(max_tokens.min(4096));
    }
    if json_mode.unwrap_or(false) {
        body["response_format"] = serde_json::json!({ "type": "json_object" });
    }

    let client = state.client.clone();
    let requested_model = model.clone();
    let task = tokio::spawn(async move {
        let response = client
            .post(endpoint)
            .timeout(Duration::from_millis(timeout_ms))
            .bearer_auth(key)
            .json(&body)
            .send()
            .await
            .map_err(map_request_error)?;
        let status = response.status();
        if !status.is_success() {
            // Never surface the response body: it may echo request context.
            return Err(format!("AI request failed (HTTP {})", status.as_u16()));
        }
        let text = response
            .text()
            .await
            .map_err(|_| "AI response could not be read".to_string())?;
        extract_assistant_text(&text, &requested_model)
    });

    if let Some(request_id) = request_id.clone() {
        if let Ok(mut in_flight) = state.in_flight.lock() {
            in_flight.insert(request_id, task.abort_handle());
        }
    }

    let result = task.await;
    if let Some(request_id) = request_id {
        if let Ok(mut in_flight) = state.in_flight.lock() {
            in_flight.remove(&request_id);
        }
    }

    match result {
        Ok(Ok(value)) => Ok(value),
        Ok(Err(message)) => Err(message),
        Err(join_error) if join_error.is_cancelled() => Err("AI request was cancelled".to_string()),
        Err(_) => Err("AI request failed".to_string()),
    }
}

#[tauri::command]
pub fn ai_credential_store_available() -> bool {
    keyring::Entry::store_status().is_ok()
}

#[tauri::command]
pub fn ai_set_api_key(
    state: State<'_, AiState>,
    base_url: String,
    key: String,
    persist: bool,
) -> Result<(), String> {
    if key.trim().is_empty() {
        return Err("API key is empty".to_string());
    }
    let origin = normalized_origin(&base_url)?;
    if persist {
        credential_entry(&origin)?
            .set_password(&key)
            .map_err(|_| "Could not save the credential".to_string())?;
    } else {
        state
            .session_keys
            .lock()
            .map_err(|_| "Credential state unavailable".to_string())?
            .insert(origin, key);
    }
    Ok(())
}

#[tauri::command]
pub fn ai_clear_api_key(state: State<'_, AiState>, base_url: String) -> Result<(), String> {
    let origin = normalized_origin(&base_url)?;
    if let Ok(mut keys) = state.session_keys.lock() {
        keys.remove(&origin);
    }
    match credential_entry(&origin)?.delete_credential() {
        Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
        Err(_) => Err("Could not clear the credential".to_string()),
    }
}

#[tauri::command]
pub fn ai_has_api_key(state: State<'_, AiState>, base_url: String) -> Result<bool, String> {
    let origin = normalized_origin(&base_url)?;
    if state
        .session_keys
        .lock()
        .map_err(|_| "Credential state unavailable".to_string())?
        .contains_key(&origin)
    {
        return Ok(true);
    }
    match credential_entry(&origin)?.get_password() {
        Ok(_) => Ok(true),
        Err(keyring::Error::NoEntry) => Ok(false),
        Err(_) => Err("Credential store error".to_string()),
    }
}

#[tauri::command]
#[allow(clippy::too_many_arguments)]
pub async fn ai_chat(
    state: State<'_, AiState>,
    base_url: String,
    model: String,
    messages: Vec<AiMessage>,
    temperature: Option<f64>,
    json_mode: Option<bool>,
    max_tokens: Option<u32>,
    request_id: Option<String>,
    timeout_ms: Option<u64>,
) -> Result<AiChatResult, String> {
    run_chat(
        &state,
        base_url,
        model,
        messages,
        temperature,
        json_mode,
        max_tokens,
        request_id,
        timeout_ms,
    )
    .await
}

#[tauri::command]
pub async fn ai_test_connection(
    state: State<'_, AiState>,
    base_url: String,
    model: String,
) -> Result<(), String> {
    let messages = vec![AiMessage {
        role: "user".to_string(),
        content: "Reply with the single word OK.".to_string(),
    }];
    run_chat(
        &state,
        base_url,
        model,
        messages,
        Some(0.0),
        Some(false),
        Some(8),
        None,
        None,
    )
    .await
    .map(|_| ())
}

#[tauri::command]
pub fn ai_cancel(state: State<'_, AiState>, request_id: String) -> Result<(), String> {
    if let Ok(mut in_flight) = state.in_flight.lock() {
        if let Some(handle) = in_flight.remove(&request_id) {
            handle.abort();
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn endpoint_preserves_base_path() {
        assert_eq!(
            chat_endpoint("https://host/v1").unwrap().as_str(),
            "https://host/v1/chat/completions"
        );
        assert_eq!(
            chat_endpoint("https://host/v1/").unwrap().as_str(),
            "https://host/v1/chat/completions"
        );
        assert_eq!(
            chat_endpoint("https://host/api/v1").unwrap().as_str(),
            "https://host/api/v1/chat/completions"
        );
        assert_eq!(
            chat_endpoint("http://localhost:11434/v1").unwrap().as_str(),
            "http://localhost:11434/v1/chat/completions"
        );
        assert_eq!(
            chat_endpoint("https://host").unwrap().as_str(),
            "https://host/chat/completions"
        );
    }

    #[test]
    fn normalized_origin_is_host_and_port_bound() {
        assert_eq!(
            normalized_origin("https://Host/v1").unwrap(),
            "https://host:443"
        );
        assert_eq!(
            normalized_origin("https://host:443/v1").unwrap(),
            "https://host:443"
        );
        assert_eq!(
            normalized_origin("http://localhost:11434/v1").unwrap(),
            "http://localhost:11434"
        );
    }

    #[test]
    fn rejects_insecure_and_ambiguous_urls() {
        assert!(validate_base_url("ftp://host/v1").is_err());
        assert!(validate_base_url("http://example.com/v1").is_err());
        assert!(validate_base_url("https://user:pass@host/v1").is_err());
        assert!(validate_base_url("https://host/v1?x=1").is_err());
        assert!(validate_base_url("https://host/v1#frag").is_err());
    }

    #[test]
    fn allows_loopback_http() {
        assert!(validate_base_url("http://localhost:11434/v1").is_ok());
        assert!(validate_base_url("http://127.0.0.1:8080/v1").is_ok());
        assert!(validate_base_url("http://[::1]:8080/v1").is_ok());
    }

    #[test]
    fn extracts_string_assistant_content() {
        let body = r#"{"model":"m","choices":[{"message":{"role":"assistant","content":"{\"meaning_zh\":\"x\"}"}}]}"#;
        let result = extract_assistant_text(body, "fallback").unwrap();
        assert_eq!(result.content, r#"{"meaning_zh":"x"}"#);
        assert_eq!(result.model, "m");
    }

    #[test]
    fn extracts_content_array_parts() {
        let body = r#"{"choices":[{"message":{"content":[{"type":"text","text":"a"},{"type":"text","text":"b"}]}}]}"#;
        let result = extract_assistant_text(body, "m").unwrap();
        assert_eq!(result.content, "ab");
    }

    #[test]
    fn prefers_final_content_over_reasoning() {
        let body = r#"{"choices":[{"message":{"content":"final","reasoning_content":"thinking"}}]}"#;
        let result = extract_assistant_text(body, "m").unwrap();
        assert_eq!(result.content, "final");
    }

    #[test]
    fn falls_back_to_reasoning_only_when_content_empty() {
        let body = r#"{"choices":[{"message":{"content":"","reasoning_content":"thinking"}}]}"#;
        let result = extract_assistant_text(body, "m").unwrap();
        assert_eq!(result.content, "thinking");
    }

    #[test]
    fn errors_when_no_assistant_content() {
        assert!(extract_assistant_text(r#"{"choices":[]}"#, "m").is_err());
        assert!(extract_assistant_text(r#"{"choices":[{"message":{"content":"  "}}]}"#, "m").is_err());
        assert!(extract_assistant_text("not json", "m").is_err());
    }

    #[test]
    fn maps_finish_reason_stop() {
        let body = r#"{"choices":[{"finish_reason":"stop","message":{"content":"done"}}]}"#;
        let result = extract_assistant_text(body, "m").unwrap();
        assert_eq!(result.finish_reason.as_deref(), Some("stop"));
    }

    #[test]
    fn maps_finish_reason_length() {
        let body = r#"{"choices":[{"finish_reason":"length","message":{"content":"partial"}}]}"#;
        let result = extract_assistant_text(body, "m").unwrap();
        assert_eq!(result.finish_reason.as_deref(), Some("length"));
    }

    #[test]
    fn missing_finish_reason_is_none() {
        let body = r#"{"choices":[{"message":{"content":"no finish"}}]}"#;
        let result = extract_assistant_text(body, "m").unwrap();
        assert_eq!(result.finish_reason, None);
    }

    #[test]
    fn unknown_finish_reason_maps_to_other() {
        let body = r#"{"choices":[{"finish_reason":"content_filter","message":{"content":"x"}}]}"#;
        let result = extract_assistant_text(body, "m").unwrap();
        assert_eq!(result.finish_reason.as_deref(), Some("other"));
    }

    #[test]
    fn rejects_input_limit_violations_explicitly() {
        let too_many: Vec<AiMessage> = (0..MAX_MESSAGES + 1)
            .map(|i| AiMessage {
                role: "user".to_string(),
                content: format!("m{i}"),
            })
            .collect();
        assert_eq!(validate_messages(&too_many).unwrap_err(), "Too many messages");

        let too_big = vec![AiMessage {
            role: "user".to_string(),
            content: "x".repeat(MAX_MESSAGE_BYTES + 1),
        }];
        assert_eq!(
            validate_messages(&too_big).unwrap_err(),
            "Message payload is too large"
        );
    }
}
