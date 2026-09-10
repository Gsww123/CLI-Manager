import { invoke } from "@tauri-apps/api/core";

export type ExtensionEnvironmentKind = "local" | "wsl";

export interface ExtensionHomeState {
  identity: {
    environmentKind: ExtensionEnvironmentKind;
    environmentId: string;
    identity: string;
  };
  mode: "auto" | "manual";
  homePath: string;
  source: "auto" | "manual";
  targets: {
    homePath: string;
    claudeConfigDir: string;
    claudeHistoryRoot: string;
    codexConfigDir: string;
    codexHistoryRoot: string;
    grokConfigDir: string;
    grokHistoryRoot: string;
  };
}

export interface ExtensionHomeInput {
  environmentKind: ExtensionEnvironmentKind;
  environmentId?: string | null;
  mode: "auto" | "manual";
  homePath?: string | null;
}

/** 读取当前活动 Home；三个 CLI 共用同一份环境解析结果。 */
export function getActiveExtensionHome(): Promise<ExtensionHomeState> {
  return invoke<ExtensionHomeState>("provider_home_active_get");
}

/** 按环境身份读取 Home，切换环境时由调用方丢弃旧请求结果。 */
export function getExtensionHome(
  environmentKind: ExtensionEnvironmentKind,
  environmentId: string | null,
): Promise<ExtensionHomeState> {
  return invoke<ExtensionHomeState>("provider_home_get", {
    environmentKind,
    environmentId,
  });
}

/** 枚举可选 WSL 发行版，不在 WebView 内推断或拼接发行版路径。 */
export function listExtensionWslDistros(): Promise<string[]> {
  return invoke<string[]>("provider_wsl_list_distros");
}

/** 预览手动 Home 的解析结果，不写入偏好。 */
export function previewExtensionHome(input: ExtensionHomeInput): Promise<ExtensionHomeState> {
  return invoke<ExtensionHomeState>("provider_home_preview", { input });
}

/** 保存共享 Home 选择，后端负责环境和路径校验。 */
export function selectExtensionHome(input: ExtensionHomeInput): Promise<ExtensionHomeState> {
  return invoke<ExtensionHomeState>("provider_home_select", { input });
}

/** 将当前环境恢复为默认 Home。 */
export function resetExtensionHome(
  environmentKind: ExtensionEnvironmentKind,
  environmentId: string | null,
): Promise<ExtensionHomeState> {
  return invoke<ExtensionHomeState>("provider_home_reset", {
    environmentKind,
    environmentId,
  });
}
