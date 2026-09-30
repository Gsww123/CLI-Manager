#![cfg(target_os = "windows")]

use crate::pty::manager::{PtyEventSink, PtyManager, PtyProcessStatus};
use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

struct CaptureSink {
    output: Arc<Mutex<Vec<u8>>>,
}

impl PtyEventSink for CaptureSink {
    fn on_output(&self, _session_id: &str, data: &[u8]) {
        self.output.lock().unwrap().extend_from_slice(data);
    }

    fn on_status(&self, _session_id: &str, _status: PtyProcessStatus) {}
}

struct TestSession {
    manager: PtyManager,
    id: String,
    output: Arc<Mutex<Vec<u8>>>,
}

impl Drop for TestSession {
    fn drop(&mut self) {
        let _ = self.manager.close(&self.id);
    }
}

impl TestSession {
    fn write(&self, input: &str) {
        self.manager.write(&self.id, input).unwrap();
    }

    fn output_text(&self) -> String {
        String::from_utf8_lossy(&self.output.lock().unwrap()).into_owned()
    }

    fn wait_for_complete_line(&self, expected: &str) {
        // Match real standalone output, never the marker embedded in echoed input.
        let controls =
            regex::Regex::new(r"\x1b(?:\[[0-?]*[ -/]*[@-~]|\][^\x07]*(?:\x07|\x1b\\))").unwrap();
        let deadline = Instant::now() + Duration::from_secs(10);
        while Instant::now() < deadline {
            let raw = self.output_text();
            let text = controls.replace_all(&raw, "");
            if text
                .split_inclusive('\n')
                .any(|line| line.ends_with('\n') && line.trim_matches(['\r', '\n']) == expected)
            {
                return;
            }
            std::thread::sleep(Duration::from_millis(25));
        }
        panic!(
            "ConPTY did not produce standalone line {expected:?} within 10 seconds; raw output: {:?}",
            self.output_text()
        );
    }
}

#[test]
fn powershell_web_finally_marker_survives_ctrl_c_without_runtime_monitoring() {
    // Cargo's launcher may ignore Ctrl+C; normal children must not inherit that policy.
    let reset = unsafe { windows_sys::Win32::System::Console::SetConsoleCtrlHandler(None, 0) };
    assert_ne!(
        reset,
        0,
        "Unable to restore default Ctrl+C handling for ConPTY fixture: {}",
        unsafe { windows_sys::Win32::Foundation::GetLastError() }
    );
    let manager = PtyManager::new();
    let id = format!("deepseek-ctrl-c-{}", uuid::Uuid::new_v4());
    let output = Arc::new(Mutex::new(Vec::new()));
    let history_root = tempfile::tempdir().unwrap();
    let env = HashMap::from([
        ("CLI_MANAGER_SHELL_RUNTIME_MONITORING".into(), "0".into()),
        (
            "APPDATA".into(),
            history_root.path().to_string_lossy().into_owned(),
        ),
    ]);
    manager
        .create(
            &id,
            None,
            Some(env),
            Some("powershell"),
            Arc::new(CaptureSink {
                output: Arc::clone(&output),
            }),
        )
        .unwrap();
    let session = TestSession {
        manager,
        id,
        output,
    };
    // Keep long echoed commands on one row so they cannot mimic standalone markers.
    session
        .manager
        .resize(&session.id, 500, 30, None, None)
        .unwrap();
    session.write(
        "if (Get-Module PSReadLine) { Set-PSReadLineOption -HistorySaveStyle SaveNothing }; [Console]::WriteLine(); [Console]::WriteLine('DSH_PTY_SHELL_READY')\r",
    );
    session.wait_for_complete_line("DSH_PTY_SHELL_READY");
    session.write(
        "try { node -e \"process.on('SIGINT',()=>process.exit(130)); process.stdin.resume(); console.log('\\ndsh web: http://127.0.0.1:45131/'); setInterval(()=>{},1000)\" } finally { [Console]::WriteLine(); [Console]::WriteLine('CLI_MANAGER_DSH_WEBUI_STOPPED') }\r",
    );
    session.wait_for_complete_line("dsh web: http://127.0.0.1:45131/");
    session.write("\u{3}");
    session.wait_for_complete_line("CLI_MANAGER_DSH_WEBUI_STOPPED");
    // A stopped Web child must leave its containing interactive shell usable.
    session.write("[Console]::WriteLine(); [Console]::WriteLine('DSH_PTY_SHELL_STILL_ALIVE')\r");
    session.wait_for_complete_line("DSH_PTY_SHELL_STILL_ALIVE");
    assert_eq!(session.manager.status_all()[&session.id].status, "running");
}
