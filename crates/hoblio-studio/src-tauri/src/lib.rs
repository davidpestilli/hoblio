use hoblio_model::{FlowGraph, FlowManifest, FlowProject, ProjectVariables, validate_graph, validate_project};
use tauri::Emitter;
use hoblio_runtime::{request_run_cancel, run_project_with_listener};
use hoblio_serde::{
    load_flow_file, load_project, list_project_flows, save_flow_document, save_project,
    validate_project_composition, validate_project_dir,
};

#[derive(serde::Serialize)]
struct FlowDocumentDto {
    graph: FlowGraph,
    variables: ProjectVariables,
}

#[tauri::command]
fn load_project_cmd(path: String) -> Result<FlowProject, String> {
    load_project(&path).map_err(|e| e.to_string())
}

#[tauri::command]
fn list_project_flows_cmd(path: String) -> Result<Vec<hoblio_serde::ProjectFlowEntry>, String> {
    let project = load_project(&path).map_err(|e| e.to_string())?;
    Ok(list_project_flows(&project.manifest))
}

#[tauri::command]
fn load_flow_document_cmd(path: String, relative: String) -> Result<FlowDocumentDto, String> {
    let root = std::path::PathBuf::from(&path);
    let loaded = load_flow_file(&root.join(&relative)).map_err(|e| e.to_string())?;
    Ok(FlowDocumentDto {
        graph: loaded.graph,
        variables: loaded.variables,
    })
}

#[tauri::command]
fn save_flow_document_cmd(
    path: String,
    relative: String,
    graph: FlowGraph,
    variables: ProjectVariables,
) -> Result<(), String> {
    validate_graph(&graph).map_err(|e| e.to_string())?;
    save_flow_document(std::path::Path::new(&path), &relative, &graph, &variables)
        .map_err(|e| e.to_string())
}

#[tauri::command]
fn save_project_cmd(path: String, project: FlowProject) -> Result<(), String> {
    validate_project(&project).map_err(|e| e.to_string())?;
    save_project(&path, &project).map_err(|e| e.to_string())
}

#[tauri::command]
fn save_manifest_cmd(path: String, manifest: FlowManifest) -> Result<(), String> {
    let manifest_path = std::path::PathBuf::from(&path).join(hoblio_serde::MANIFEST_FILE);
    let text = serde_json::to_string_pretty(&manifest).map_err(|e| e.to_string())?;
    std::fs::write(manifest_path, format!("{text}\n")).map_err(|e| e.to_string())
}

#[tauri::command]
fn validate_project_cmd(project: FlowProject) -> Result<(), String> {
    validate_project(&project).map_err(|e| e.to_string())
}

#[tauri::command]
fn validate_project_dir_cmd(path: String) -> Result<(), String> {
    validate_project_dir(&path).map_err(|e| e.to_string())
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
    if let (Some(dir), Some(root_path)) = (&root, root.as_ref()) {
        let _ = dir;
        validate_project_composition(root_path, &project).map_err(|e| e.to_string())?;
    }
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
            list_project_flows_cmd,
            load_flow_document_cmd,
            save_flow_document_cmd,
            save_project_cmd,
            save_manifest_cmd,
            validate_project_cmd,
            validate_project_dir_cmd,
            run_flow_cmd,
            cancel_run_cmd,
        ])
        .run(tauri::generate_context!())
        .expect("error while running Hoblio Studio");
}
