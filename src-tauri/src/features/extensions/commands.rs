use crate::extensions::adapters::{parse_native_config, project_native_config};
use crate::extensions::model::{
    capability_matrix, redact_resource, validation_report, ExtensionCli, McpNativeConfigPreview,
    McpProjectionPreview, McpResource, McpResourceRedacted, McpValidationReport,
};
use crate::extensions::repository;

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct McpProjectionRequest {
    pub cli: ExtensionCli,
    pub base_config: String,
    pub resources: Vec<McpResource>,
}

#[tauri::command]
// 返回静态字段能力矩阵；版本探测和环境差异由后续能力层补充。
pub fn extensions_mcp_capabilities() -> Vec<crate::extensions::model::McpCliCapability> {
    capability_matrix()
}

#[tauri::command]
// 在 Rust 边界校验规范 MCP 资源，不把校验责任下放给 WebView。
pub fn extensions_mcp_validate(resource: McpResource) -> McpValidationReport {
    validation_report(&resource)
}

#[tauri::command]
// 解析原生 MCP 配置并仅返回脱敏资源，供导入预览复用而不暴露环境变量。
pub fn extensions_mcp_parse_native(
    cli: ExtensionCli,
    source: String,
) -> Result<McpNativeConfigPreview, String> {
    let parsed = parse_native_config(cli, &source)?;
    Ok(McpNativeConfigPreview {
        cli: parsed.cli,
        format: parsed.format,
        resources: parsed.resources.iter().map(redact_resource).collect(),
    })
}

#[tauri::command]
// 生成目标 CLI 的字段级投影预览；不支持字段以 issues 返回且不产生可应用内容。
pub fn extensions_mcp_preview(
    request: McpProjectionRequest,
) -> Result<McpProjectionPreview, String> {
    project_native_config(request.cli, &request.base_config, &request.resources)
}

#[tauri::command]
// 列出应用数据中的受管 MCP 资源，返回结构完整但秘密字段已脱敏的 DTO。
pub async fn extensions_mcp_list() -> Result<Vec<McpResourceRedacted>, String> {
    repository::list_mcp_resources().await
}

#[tauri::command]
// 读取单项受管 MCP 资源；缺失记录与数据库损坏保持独立错误码。
pub async fn extensions_mcp_get(resource_id: String) -> Result<McpResourceRedacted, String> {
    repository::get_mcp_resource(&resource_id).await
}

#[tauri::command]
// 保存规范 MCP 资源；仓储层会再次校验并在并发写入时递增 revision。
pub async fn extensions_mcp_upsert(resource: McpResource) -> Result<McpResourceRedacted, String> {
    repository::upsert_mcp_resource(resource).await
}

#[tauri::command]
// 删除受管规范记录，不直接删除任何 CLI 原生配置或外部技能文件。
pub async fn extensions_mcp_delete(resource_id: String) -> Result<(), String> {
    repository::delete_mcp_resource(&resource_id).await
}
