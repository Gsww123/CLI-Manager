import { invoke } from "@tauri-apps/api/core";
import { translateCurrent } from "../../../shared/i18n/index";

export interface DeepSeekSourceInfo {
  entryPath: string;
  version: string;
}

/** Validate the user's selected official source tree before saving or creating a PTY. */
export async function validateDeepSeekSource(sourceRoot: string): Promise<DeepSeekSourceInfo> {
  try {
    return await invoke<DeepSeekSourceInfo>("deepseek_web_validate_source", { sourceRoot });
  } catch (error) {
    const code = String(error);
    const key = code.includes("deepseek_source_unbuilt")
      ? "configModal.deepseek.sourceUnbuilt"
      : "configModal.deepseek.sourceInvalid";
    throw new Error(translateCurrent(key));
  }
}

/** Translate stable launch errors without exposing shell/parser codes in the UI. */
export function deepSeekLaunchError(error: unknown): Error {
  const message = error instanceof Error ? error.message : String(error);
  const keys = {
    deepseek_source_invalid: "configModal.deepseek.sourceInvalid",
    deepseek_source_native_only: "configModal.deepseek.guestHelp",
    deepseek_shell_unsupported: "configModal.deepseek.shellUnsupported",
    deepseek_web_profile_required: "configModal.deepseek.profileRequired",
    deepseek_env_invalid: "configModal.deepseek.envInvalid",
  } as const;
  const key = keys[message as keyof typeof keys];
  return key ? new Error(translateCurrent(key)) : error instanceof Error ? error : new Error(message);
}
