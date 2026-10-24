use hoblio_model::{FlowProject, validate_project};
use tauri::Emitter;
use hoblio_runtime::{request_run_cancel, run_project_with_listener};
use hoblio_serde::{load_project, save_project};

#[tauri::command]
fn load_project_cmd(path: String) -> Result<FlowProject, String> {
    load_project(&path).map_err(|e| e.to_string())
}

#[tauri::command]
fn save_project_cmd(path: String, project: FlowProject) -> Result<(), String> {
    validate_project(&project).map_err(|e| e.to_string())?;
    save_project(&path, &project).map_err(|e| e.to_string())
}

#[tauri::command]
fn validate_project_cmd(project: FlowProject) -> Result<(), String> {
    validate_project(&project).map_err(|e| e.to_string())
}

#[tauri::command]
fn cancel_run_cmd() {
    request_run_cancel();
}

#[tauri::command]
async fn run_flow_cmd(
    app: tauri::AppHandle,
    project: FlowProject,
    project_dir: Option<String>,
) -> Result<String, String> {
    let app_for_thread = app.clone();
    let root = project_dir.map(std::path::PathBuf::from);
    let outcome = tauri::async_runtime::spawn_blocking(move || {
        run_project_with_listener(
            &project,
            root.as_deref(),
            |event| {
                let _ = app_for_thread.emit("hoblio-run-event", event);
            },
        )
    })
    .await
    .map_err(|e| e.to_string())?
    .map_err(|e| e.to_string())?;

    Ok(outcome.last_node_id)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .invoke_handler(tauri::generate_handler![
            load_project_cmd,
            save_project_cmd,
            validate_project_cmd,
            run_flow_cmd,
            cancel_run_cmd,
        ])
        .run(tauri::generate_context!())
        .expect("error while running Hoblio Studio");
}
