use std::sync::{Mutex, OnceLock};
use std::time::Duration;

use astrobox_ng_wit::FutureReader;
use astrobox_ng_wit::astrobox::psys_host::ui_v3;
use astrobox_ng_wit::astrobox::psys_host::{device, interconnect, os, register, timer};
use astrobox_ng_wit::exports::astrobox::psys_plugin::{
    event_v3::{self, EventType},
    lifecycle,
};
use serde_json::{Value, json};
use waki::Client;

const PACKAGE_NAME: &str = "com.jiyehoo.banddesk";
const SNAPSHOT_URL: &str = "http://127.0.0.1:17373/v1/snapshot";
const EVENTS_URL: &str = "http://127.0.0.1:17373/v1/events";
const SYNC_NOW_EVENT: &str = "sync-now";
const REFRESH_DELAY_MS: u64 = 2_000;

struct BandDeskBridgePlugin;

#[derive(Clone, Copy)]
enum RelayState {
    Loaded,
    Syncing,
    Sent,
    NoDevice,
    MacUnreachable,
    SendFailed,
}

struct UiState {
    root_element_id: Option<String>,
    relay_state: RelayState,
}

static UI_STATE: OnceLock<Mutex<UiState>> = OnceLock::new();

fn ui_state() -> &'static Mutex<UiState> {
    UI_STATE.get_or_init(|| {
        Mutex::new(UiState {
            root_element_id: None,
            relay_state: RelayState::Loaded,
        })
    })
}

fn snapshot() -> Result<String, String> {
    let response = Client::new()
        .get(SNAPSHOT_URL)
        .connect_timeout(Duration::from_secs(5))
        .send()
        .map_err(|error| error.to_string())?;
    if response.status_code() != 200 {
        return Err(format!("snapshot status {}", response.status_code()));
    }
    let body = response.body().map_err(|error| error.to_string())?;
    let text = String::from_utf8(body).map_err(|error| error.to_string())?;
    let value: Value = serde_json::from_str(&text).map_err(|error| error.to_string())?;
    if value.get("schemaVersion").and_then(Value::as_u64) != Some(1)
        || value.get("type").and_then(Value::as_str) != Some("snapshot")
        || value.get("cardId").and_then(Value::as_str) != Some("codex.rate-limits")
    {
        return Err("snapshot schema mismatch".to_string());
    }
    Ok(text)
}

fn post_event(body: &str) -> Result<(), String> {
    let response = Client::new()
        .post(EVENTS_URL)
        .header("content-type", "application/json")
        // WASI HTTP may otherwise stream the body with chunked transfer
        // encoding. The Mac bridge supports both forms, but an explicit size
        // also keeps older bridge builds from accepting an empty event.
        .header("content-length", body.len().to_string())
        .connect_timeout(Duration::from_secs(5))
        .body(body.as_bytes())
        .send()
        .map_err(|error| error.to_string())?;
    if matches!(response.status_code(), 200 | 202) {
        Ok(())
    } else {
        Err(format!("event status {}", response.status_code()))
    }
}

fn report_snapshot(status: &str, snapshot: Option<&Value>) {
    let mut event = json!({"kind":"relay_status","status":status});
    if let Some(snapshot) = snapshot {
        event["sessionId"] = snapshot["sessionId"].clone();
        event["revision"] = snapshot["revision"].clone();
    }
    if let Err(error) = post_event(&event.to_string()) {
        eprintln!("[band-desk-bridge] relay status report failed: {error}");
    }
}
fn report(status: &str) {
    report_snapshot(status, None);
}

fn band_event(payload: &str) -> Option<Value> {
    let mut value: Value = serde_json::from_str(payload).ok()?;
    // AstroBox 2.1 wraps the app JSON with transport metadata. Forward only
    // the validated app event; never the address or the duplicate hex body.
    if value.get("payloadText").is_some() {
        if value["pkgName"].as_str() != Some(PACKAGE_NAME) {
            return None;
        }
        value = serde_json::from_str(value["payloadText"].as_str()?).ok()?;
    }
    if let Some(text) = value.as_str() {
        value = serde_json::from_str(text).ok()?;
    }
    if value["schemaVersion"].as_u64() != Some(1)
        || value["cardId"].as_str() != Some("codex.rate-limits")
        || !matches!(value["type"].as_str(), Some("ack" | "refresh_request"))
        || value["sessionId"].as_str().is_none()
        || value["revision"].as_u64().is_none()
    {
        return None;
    }
    let mut clean = json!({"schemaVersion":1,"cardId":"codex.rate-limits",
        "type":value["type"],"sessionId":value["sessionId"],"revision":value["revision"]});
    for key in ["appliedAt", "requestedAt"] {
        if value[key].is_number() {
            clean[key] = value[key].clone();
        }
    }
    Some(clean)
}

fn relay_copy(state: RelayState) -> (&'static str, &'static str, &'static str) {
    match state {
        RelayState::Loaded => (
            "已加载",
            "#2563EB",
            "等待首次同步；打开本页会立即尝试连接 Mac 本机桥。",
        ),
        RelayState::Syncing => ("同步中", "#D97706", "正在读取 Mac 快照并检查已连接的手环。"),
        RelayState::Sent => (
            "已转发",
            "#16A34A",
            "最近一次快照已转发；手环确认结果请查看 Mac 菜单栏面板。",
        ),
        RelayState::NoDevice => (
            "未发现设备",
            "#D97706",
            "Mac 桥可访问，但 AstroBox 当前没有可转发的已连接设备。",
        ),
        RelayState::MacUnreachable => (
            "Mac 桥不可达",
            "#DC2626",
            "无法读取 127.0.0.1:17373，请确认 Band Desk Bridge 正在运行。",
        ),
        RelayState::SendFailed => (
            "发送失败",
            "#DC2626",
            "已读取 Mac 快照，但向机器人桌搭发送失败。",
        ),
    }
}

fn build_main_ui(relay_state: RelayState) -> ui_v3::Element {
    let (status_text, status_color, detail_text) = relay_copy(relay_state);
    let status = ui_v3::Element::new(ui_v3::ElementType::Badge, Some(status_text))
        .bg(status_color)
        .text_color("#FFFFFF")
        .padding(8)
        .radius(12);
    let title = ui_v3::Element::new(ui_v3::ElementType::P, Some("Codex 手环同步")).size(26);
    let description = ui_v3::Element::new(ui_v3::ElementType::P, Some(detail_text)).size(16);
    let note = ui_v3::Element::new(
        ui_v3::ElementType::P,
        Some("后台每 15 秒自动同步；也可以点击下方按钮立即重试。"),
    )
    .size(14);
    let sync_button = ui_v3::Element::new(ui_v3::ElementType::Button, Some("立即同步"))
        .bg("#2563EB")
        .text_color("#FFFFFF")
        .padding(12)
        .radius(10)
        .on(ui_v3::Event::Click, SYNC_NOW_EVENT);
    let card = ui_v3::Element::new(ui_v3::ElementType::Card, None)
        .width_full()
        .padding(20)
        .radius(16)
        .border(1, "#334155")
        .child(status)
        .child(title)
        .child(description)
        .child(note)
        .child(sync_button);

    ui_v3::Element::new(ui_v3::ElementType::Div, None)
        .flex()
        .flex_direction(ui_v3::FlexDirection::Column)
        .width_full()
        .padding(24)
        .child(card)
}

fn set_relay_state(relay_state: RelayState) {
    let root_element_id = {
        let mut state = ui_state()
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        state.relay_state = relay_state;
        state.root_element_id.clone()
    };
    if let Some(root_element_id) = root_element_id {
        ui_v3::render(&root_element_id, build_main_ui(relay_state));
    }
}

async fn sync_snapshot() -> RelayState {
    eprintln!("[band-desk-bridge] sync start");
    set_relay_state(RelayState::Syncing);
    let body = match snapshot() {
        Ok(body) => body,
        Err(error) => {
            eprintln!("[band-desk-bridge] snapshot failed: {error}");
            report("mac_unreachable");
            set_relay_state(RelayState::MacUnreachable);
            return RelayState::MacUnreachable;
        }
    };
    eprintln!("[band-desk-bridge] snapshot ready");
    let devices = device::get_connected_device_list().await;
    eprintln!(
        "[band-desk-bridge] connected device count: {}",
        devices.len()
    );
    if devices.is_empty() {
        report("no_device");
        set_relay_state(RelayState::NoDevice);
        return RelayState::NoDevice;
    }
    let mut sent = 0usize;
    for target in devices {
        if register::register_interconnect_recv(&target.addr, PACKAGE_NAME)
            .await
            .is_err()
        {
            eprintln!("[band-desk-bridge] interconnect receive registration failed");
        }
        if interconnect::send_qaic_message(&target.addr, PACKAGE_NAME, &body)
            .await
            .is_ok()
        {
            sent += 1;
        }
    }
    let relay_state = if sent > 0 {
        report_snapshot("sent", serde_json::from_str::<Value>(&body).ok().as_ref());
        RelayState::Sent
    } else {
        report("send_failed");
        RelayState::SendFailed
    };
    set_relay_state(relay_state);
    eprintln!(
        "[band-desk-bridge] sync finished: {}",
        if sent > 0 { "sent" } else { "send_failed" }
    );
    relay_state
}

impl event_v3::Guest for BandDeskBridgePlugin {
    fn on_event(event_type: EventType, event_payload: String) -> FutureReader<String> {
        eprintln!("[band-desk-bridge] host event received");
        astrobox_ng_wit::block_on(async move {
            match event_type {
                EventType::InterconnectMessage => {
                    let Some(event) = band_event(&event_payload) else {
                        report("invalid_band_event");
                        return;
                    };
                    let wants_refresh = event["type"].as_str() == Some("refresh_request");
                    match post_event(&event.to_string()) {
                        Ok(()) => eprintln!("[band-desk-bridge] validated band event forwarded"),
                        Err(error) => {
                            eprintln!("[band-desk-bridge] band event forwarding failed: {error}")
                        }
                    }
                    if wants_refresh {
                        // Give the Mac bridge time to fetch a newer revision;
                        // forwarding immediately would only echo the cached one.
                        set_relay_state(RelayState::Syncing);
                        let _ = timer::set_timeout(REFRESH_DELAY_MS, "refresh-after-mac").await;
                    }
                }
                EventType::Timer | EventType::DeviceAction => {
                    let _ = sync_snapshot().await;
                }
                _ => {}
            }
        });

        // API level 3 requires a FutureReader response. Reuse a host-created
        // future so this synchronous guest export never owns a FutureWriter.
        os::version()
    }

    fn on_ui_event_v3(
        event_id: String,
        event: ui_v3::Event,
        _event_payload: String,
    ) -> FutureReader<String> {
        eprintln!("[band-desk-bridge] ui event received: {event_id}");
        if matches!(event, ui_v3::Event::Click) && event_id == SYNC_NOW_EVENT {
            astrobox_ng_wit::block_on(async {
                let _ = sync_snapshot().await;
            });
        }
        os::version()
    }

    fn on_ui_render(element_id: String) -> FutureReader<()> {
        eprintln!("[band-desk-bridge] ui render requested");
        let relay_state = {
            let mut state = ui_state()
                .lock()
                .unwrap_or_else(|poisoned| poisoned.into_inner());
            state.root_element_id = Some(element_id.clone());
            state.relay_state
        };
        ui_v3::render(&element_id, build_main_ui(relay_state));
        astrobox_ng_wit::block_on(async {
            let _ = sync_snapshot().await;
        });
        completed_unit_future()
    }

    fn on_card_render(_card_id: String) -> FutureReader<()> {
        completed_unit_future()
    }
}

impl lifecycle::Guest for BandDeskBridgePlugin {
    fn on_load() {
        let timer_id = astrobox_ng_wit::block_on(async {
            timer::set_interval(15_000, "codex-snapshot").await
        });
        eprintln!("[band-desk-bridge] interval registered: {timer_id}");
    }
}

fn completed_unit_future() -> FutureReader<()> {
    // Timer IDs start at 1. Clearing this sentinel is a no-op that gives the
    // host a valid unit future to drain without a guest-side FutureWriter.
    timer::clear_timer(u64::MAX)
}

astrobox_ng_wit::export!(BandDeskBridgePlugin);

#[cfg(test)]
mod tests {
    use super::*;
    fn ack() -> Value {
        json!({"schemaVersion":1,"type":"ack","cardId":"codex.rate-limits","sessionId":"test","revision":2,"appliedAt":123})
    }
    #[test]
    fn astrobox_21_envelope_is_unwrapped_without_transport_metadata() {
        let event = ack();
        let envelope = json!({"addr":"redacted-test-device","pkgName":PACKAGE_NAME,"payloadText":event.to_string(),"payloadHex":"unused"});
        assert_eq!(band_event(&envelope.to_string()), Some(event));
    }
    #[test]
    fn raw_messages_and_refresh_requests_remain_supported() {
        let mut event = ack();
        assert_eq!(band_event(&event.to_string()), Some(event.clone()));
        assert_eq!(
            band_event(&Value::String(event.to_string()).to_string()),
            Some(event.clone())
        );
        event["type"] = json!("refresh_request");
        event["requestedAt"] = json!(456);
        assert_eq!(band_event(&event.to_string()), Some(event));
    }
    #[test]
    fn unrelated_apps_malformed_json_and_wrong_protocol_are_rejected() {
        assert!(
            band_event(&json!({"pkgName":"other.app","payloadText":ack().to_string()}).to_string())
                .is_none()
        );
        assert!(
            band_event(&json!({"pkgName":PACKAGE_NAME,"payloadText":"invalid"}).to_string())
                .is_none()
        );
        let mut event = ack();
        event["schemaVersion"] = json!(2);
        assert!(band_event(&event.to_string()).is_none());
        event = ack();
        event["revision"] = json!(-1);
        assert!(band_event(&event.to_string()).is_none());
    }
    #[test]
    fn extra_fields_never_reach_the_mac() {
        let mut event = ack();
        event["private"] = json!("not-forwarded");
        assert_eq!(band_event(&event.to_string()), Some(ack()));
    }
}
