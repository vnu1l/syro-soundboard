use cpal::traits::{DeviceTrait, HostTrait};
use parking_lot::Mutex;
use serde::Serialize;
use std::{collections::HashMap, path::PathBuf, sync::{Arc, atomic::{AtomicBool, Ordering}}, thread::JoinHandle};

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AudioDeviceInfo {
    pub id: String,
    pub name: String,
    pub kind: String,
    pub is_default: bool,
    pub channels: Option<u16>,
    pub sample_rate: Option<u32>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProcessInfo {
    pub pid: u32,
    pub name: String,
    pub executable: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CaptureStart {
    pub id: String,
    pub path: String,
    pub mode: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CaptureResult {
    pub id: String,
    pub path: String,
}

struct CaptureJob {
    stop: Arc<AtomicBool>,
    handle: JoinHandle<Result<(), String>>,
    path: PathBuf,
}

#[derive(Default)]
pub struct CaptureManager {
    jobs: Mutex<HashMap<String, CaptureJob>>,
}

pub fn list_audio_devices() -> Result<Vec<AudioDeviceInfo>, String> {
    let host = cpal::default_host();
    let default_input = host.default_input_device().and_then(|d| d.name().ok());
    let default_output = host.default_output_device().and_then(|d| d.name().ok());
    let mut out = Vec::new();

    for (idx, device) in host.input_devices().map_err(|e| e.to_string())?.enumerate() {
        let name = device.name().unwrap_or_else(|_| format!("Input {idx}"));
        let config = device.default_input_config().ok();
        out.push(AudioDeviceInfo {
            id: format!("input:{idx}"),
            is_default: default_input.as_deref() == Some(name.as_str()),
            name,
            kind: "input".into(),
            channels: config.as_ref().map(|c| c.channels()),
            sample_rate: config.as_ref().map(|c| c.sample_rate().0),
        });
    }
    for (idx, device) in host.output_devices().map_err(|e| e.to_string())?.enumerate() {
        let name = device.name().unwrap_or_else(|_| format!("Output {idx}"));
        let config = device.default_output_config().ok();
        out.push(AudioDeviceInfo {
            id: format!("output:{idx}"),
            is_default: default_output.as_deref() == Some(name.as_str()),
            name,
            kind: "output".into(),
            channels: config.as_ref().map(|c| c.channels()),
            sample_rate: config.as_ref().map(|c| c.sample_rate().0),
        });
    }
    Ok(out)
}

pub fn list_processes() -> Vec<ProcessInfo> {
    use sysinfo::System;
    let mut system = System::new_all();
    system.refresh_all();
    let mut items: Vec<_> = system.processes().iter().map(|(pid, process)| ProcessInfo {
        pid: pid.as_u32(),
        name: process.name().to_string_lossy().into_owned(),
        executable: process.exe().map(|p| p.display().to_string()).unwrap_or_default(),
    }).collect();
    items.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()).then(a.pid.cmp(&b.pid)));
    items
}

impl CaptureManager {
    pub fn start(&self, capture_dir: PathBuf, mode: String, process_id: Option<u32>) -> Result<CaptureStart, String> {
        std::fs::create_dir_all(&capture_dir).map_err(|e| e.to_string())?;
        let id = uuid::Uuid::new_v4().to_string();
        let path = capture_dir.join(format!("{id}.wav"));
        let stop = Arc::new(AtomicBool::new(false));
        let thread_stop = Arc::clone(&stop);
        let thread_path = path.clone();
        let thread_mode = mode.clone();
        let handle = std::thread::Builder::new().name(format!("syro-capture-{id}")).spawn(move || {
            capture_loop(thread_path, thread_mode, process_id, thread_stop)
        }).map_err(|e| e.to_string())?;
        self.jobs.lock().insert(id.clone(), CaptureJob { stop, handle, path: path.clone() });
        Ok(CaptureStart { id, path: path.display().to_string(), mode })
    }

    pub fn stop(&self, id: &str) -> Result<CaptureResult, String> {
        let job = self.jobs.lock().remove(id).ok_or_else(|| "Capture session not found".to_string())?;
        job.stop.store(true, Ordering::Relaxed);
        match job.handle.join() {
            Ok(result) => result?,
            Err(_) => return Err("Capture thread stopped unexpectedly".into()),
        }
        Ok(CaptureResult { id: id.to_string(), path: job.path.display().to_string() })
    }

    pub fn stop_all(&self) {
        let ids: Vec<String> = self.jobs.lock().keys().cloned().collect();
        for id in ids { let _ = self.stop(&id); }
    }
}

#[cfg(not(windows))]
fn capture_loop(_path: PathBuf, _mode: String, _process_id: Option<u32>, _stop: Arc<AtomicBool>) -> Result<(), String> {
    Err("Native system audio capture is currently available on Windows only".into())
}

#[cfg(windows)]
fn capture_loop(path: PathBuf, mode_name: String, process_id: Option<u32>, stop: Arc<AtomicBool>) -> Result<(), String> {
    use std::collections::VecDeque;
    use wasapi::{AudioClient, DeviceEnumerator, Direction, SampleType, StreamMode, WaveFormat, initialize_mta};

    initialize_mta().map_err(|e| e.to_string())?;
    let desired = WaveFormat::new(32, 32, &SampleType::Float, 48_000, 2, None);
    let mut audio_client = if mode_name == "process" {
        let pid = process_id.ok_or_else(|| "A process id is required".to_string())?;
        AudioClient::new_application_loopback_client(pid, true).map_err(|e| e.to_string())?
    } else {
        let device = DeviceEnumerator::new().map_err(|e| e.to_string())?
            .get_default_device(&Direction::Render).map_err(|e| e.to_string())?;
        device.get_iaudioclient().map_err(|e| e.to_string())?
    };

    let buffer_duration_hns = if mode_name == "process" { 0 } else {
        audio_client.get_device_period().map_err(|e| e.to_string())?.0
    };
    audio_client.initialize_client(&desired, &Direction::Capture, &StreamMode::EventsShared { autoconvert: true, buffer_duration_hns }).map_err(|e| e.to_string())?;
    let event = audio_client.set_get_eventhandle().map_err(|e| e.to_string())?;
    let capture = audio_client.get_audiocaptureclient().map_err(|e| e.to_string())?;

    let spec = hound::WavSpec { channels: 2, sample_rate: 48_000, bits_per_sample: 32, sample_format: hound::SampleFormat::Float };
    let mut writer = hound::WavWriter::create(&path, spec).map_err(|e| e.to_string())?;
    let mut bytes = VecDeque::<u8>::new();
    audio_client.start_stream().map_err(|e| e.to_string())?;

    while !stop.load(Ordering::Relaxed) {
        if event.wait_for_event(100).is_err() { continue; }
        loop {
            match capture.get_next_packet_size().map_err(|e| e.to_string())? {
                Some(0) | None => break,
                Some(_) => capture.read_from_device_to_deque(&mut bytes).map_err(|e| e.to_string())?,
            }
        }
        let usable = bytes.len() - (bytes.len() % 4);
        if usable == 0 { continue; }
        let raw: Vec<u8> = bytes.drain(..usable).collect();
        for chunk in raw.chunks_exact(4) {
            writer.write_sample(f32::from_le_bytes([chunk[0], chunk[1], chunk[2], chunk[3]])).map_err(|e| e.to_string())?;
        }
    }
    let _ = audio_client.stop_stream();
    writer.finalize().map_err(|e| e.to_string())?;
    Ok(())
}
