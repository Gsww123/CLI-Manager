use crate::extensions::adapters::{parse_native_config, project_native_config};
use crate::extensions::github::{GithubSkillInstallResult, GithubSkillPreview, GithubSkillRequest};
use crate::extensions::import::{
    ExtensionImportApplyRequest, ExtensionImportPreview, ExtensionImportRequest,
    ExtensionImportResult,
};
use crate::extensions::model::{
    capability_matrix, redact_resource, validation_report, ExtensionCli, McpNativeConfigPreview,
    McpProjectionPreview, McpResource, McpResourceRedacted, McpValidationReport,
};
use crate::extensions::repository;
use crate::extensions::skill_deployment::{
    SkillDeploymentRequest, SkillDeploymentResult, SkillInstallationView, SkillPackageView,
    SkillRestoreResult, SkillUninstallResult,
};
use crate::extensions::{github, import, skill_deployment};

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
// 只改写一个 CLI 的启用开关，后端从完整记录更新，避免脱敏字段被前端回写覆盖。
pub async fn extensions_mcp_set_enabled(
    resource_id: String,
    cli: ExtensionCli,
    enabled: bool,
) -> Result<McpResourceRedacted, String> {
    repository::set_mcp_resource_enabled(&resource_id, cli, enabled).await
}

#[tauri::command]
// 删除受管规范记录，不直接删除任何 CLI 原生配置或外部技能文件。
pub async fn extensions_mcp_delete(resource_id: String) -> Result<(), String> {
    repository::delete_mcp_resource(&resource_id).await
}

#[tauri::command]
// 只读扫描原生配置、cc-switch 数据库或外部 Skill 目录，返回脱敏预览和稳定指纹。
pub async fn extensions_import_preview(
    request: ExtensionImportRequest,
) -> Result<ExtensionImportPreview, String> {
    import::preview(request).await
}

#[tauri::command]
// apply 重新扫描并核对预览指纹，再按明确冲突策略写入规范资源或发布完整 Skill 包。
pub async fn extensions_import_apply(
    request: ExtensionImportApplyRequest,
) -> Result<ExtensionImportResult, String> {
    import::apply(request).await
}

#[tauri::command]
// 列出应用数据中已发布的完整 Skill 包，不读取源目录或返回包正文。
pub async fn extensions_skills_list_packages() -> Result<Vec<SkillPackageView>, String> {
    skill_deployment::list_package_views().await
}

#[tauri::command]
// 列出 Skill 的本机/WSL 部署实例，并实时标记缺失和外部修改。
pub async fn extensions_skills_list_installations() -> Result<Vec<SkillInstallationView>, String> {
    skill_deployment::list_installation_views().await
}

#[tauri::command]
// 将受管完整包部署到明确的环境/Home/CLI，auto 仅在链接能力失败时回退复制。
pub async fn extensions_skills_deploy(
    request: SkillDeploymentRequest,
) -> Result<SkillDeploymentResult, String> {
    skill_deployment::deploy(request).await
}

#[tauri::command]
// 仅卸载仍能由所有权证据确认的目标，外部修改返回错误并保留用户文件。
pub async fn extensions_skills_uninstall(
    installation_id: String,
) -> Result<SkillUninstallResult, String> {
    skill_deployment::uninstall(&installation_id).await
}

#[tauri::command]
// 从受管备份恢复目标；当前记录的外部修改不会被覆盖。
pub async fn extensions_skills_restore(
    installation_id: String,
) -> Result<SkillRestoreResult, String> {
    skill_deployment::restore(&installation_id).await
}

#[tauri::command]
// 解析 GitHub 地址/ref/子目录并锁定 commit，只读取受限数量的 SKILL.md 候选。
pub async fn extensions_github_skill_preview(
    request: GithubSkillRequest,
) -> Result<GithubSkillPreview, String> {
    github::preview(request).await
}

#[tauri::command]
// 下载固定 commit 的完整 Skill 包，经归档边界校验后进入统一受管发布流程。
pub async fn extensions_github_skill_install(
    request: GithubSkillRequest,
) -> Result<GithubSkillInstallResult, String> {
    github::install(request).await
}

#[tauri::command]
// 标记一个 GitHub 预览/安装操作取消；已发布的包保留，后续可安全重试。
pub fn extensions_github_skill_cancel(operation_id: String) -> Result<(), String> {
    github::cancel(&operation_id)
}
