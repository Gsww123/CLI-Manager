import { normalizeShellKey } from "../platform/shell";

/** Manager-owned source selection stored alongside existing project environment settings. */
export const DEEPSEEK_SOURCE_ENV = "CLI_MANAGER_DSH_SOURCE_ROOT";
export const DEEPSEEK_WEB_ENV = "CLI_MANAGER_DSH_WEBUI";
export const DEEPSEEK_STOP_MARKER = "CLI_MANAGER_DSH_WEBUI_STOPPED";

/** Match the official launcher, without confusing DeepSeek model providers with a CLI. */
export function isDeepSeekHarnessTool(value: string | null | undefined): boolean {
  return /^(?:deepseek-harness|dsh(?:\.(?:cmd|exe|ps1))?(?:\s+web)?)$/i.test(value?.trim() ?? "");
}

/** Read source selection without changing an invalid environment editor document. */
export function getDeepSeekSourceRoot(envText: string | null | undefined): string {
  try {
    const env: unknown = JSON.parse(envText || "{}");
    if (!env || typeof env !== "object" || Array.isArray(env)) return "";
    const value = (env as Record<string, unknown>)[DEEPSEEK_SOURCE_ENV];
    return typeof value === "string" ? value.trim() : "";
  } catch {
    return "";
  }
}

/** Update only the source selection; malformed JSON remains an explicit form error. */
export function setDeepSeekSourceRoot(envText: string, root: string): string {
  const env: unknown = JSON.parse(envText || "{}");
  if (!env || typeof env !== "object" || Array.isArray(env)) throw new Error("deepseek_env_invalid");
  const next: Record<string, unknown> = { ...env };
  if (root.trim()) next[DEEPSEEK_SOURCE_ENV] = root.trim();
  else delete next[DEEPSEEK_SOURCE_ENV];
  return JSON.stringify(next, null, 2);
}

/** Quote one executable argument using the selected shell's literal rules. */
export function quoteDeepSeekPath(value: string, shell?: string | null): string {
  if (/[\r\n\0]/.test(value)) throw new Error("deepseek_source_invalid");
  const kind = normalizeShellKey(shell);
  if (shell?.trim() && !kind) throw new Error("deepseek_shell_unsupported");
  if (kind === "cmd") {
    if (/["%!^&|<>]/.test(value)) throw new Error("deepseek_source_invalid");
    return `"${value}"`;
  }
  if (kind === "powershell" || kind === "pwsh" || (!kind && /^[a-z]:/i.test(value))) {
    return `'${value.replace(/'/g, "''")}'`;
  }
  return `'${value.replace(/'/g, "'\"'\"'")}'`;
}

/** Build the official Web profile command; an explicit port and browser preference win. */
export function buildDeepSeekWebCommand(
  tool: string,
  extraArgs: string,
  sourceRoot: string,
  shell?: string | null,
  environmentType?: string | null,
): string {
  let args = extraArgs.trim().replace(/^web(?:\s+|$)/i, "").trim();
  const profile = /(?:^|\s)--profile(?:=|\s+)(?:"([^"]+)"|'([^']+)'|([^\s]+))/i.exec(args);
  if (profile && (profile[1] ?? profile[2] ?? profile[3]) !== "web") {
    throw new Error("deepseek_web_profile_required");
  }
  if (sourceRoot && (environmentType === "ssh" || environmentType === "wsl" || normalizeShellKey(shell) === "wsl")) {
    throw new Error("deepseek_source_native_only");
  }
  const root = sourceRoot.trim().replace(/[\\/]+$/, "");
  if (root && !/^(?:[a-z]:[\\/]|\/)/i.test(root)) throw new Error("deepseek_source_invalid");
  const launcher = root
    ? `node ${quoteDeepSeekPath(`${root}/apps/cli/lib/bin.js`, shell)}`
    : (tool.trim().toLowerCase() === "deepseek-harness" ? "dsh" : tool.trim().replace(/\s+web$/i, ""));
  const selectedProfile = profile ? "" : " --profile web";
  if (!/(?:^|\s)--port(?:=|\s|$)/.test(args)
    && !/(?:^|\s)(?:--help|-h|--version|-V|--dump-config|--dump-default-config|--dump-config-schema)(?:\s|$)/.test(args)) {
    args = args ? `${args} --port 0` : "--port 0";
  }
  return `${launcher}${selectedProfile}${args ? ` ${args}` : ""}`;
}

/** Recognize only Web invocations, including the official built source entry. */
export function isDeepSeekWebCommand(command: string | null | undefined): boolean {
  const raw = command?.trim() ?? "";
  const text = raw.includes(DEEPSEEK_STOP_MARKER)
    ? raw.replace(/^try \{ (.*) \} finally \{.*\}$/s, "$1")
      .replace(/^\(trap '[^']+' EXIT; trap 'exit 130' INT; trap 'exit 143' TERM; (.*)\)$/s, "$1")
    : raw;
  const launcher = /^(?:&\s*)?dsh(?:\.(?:cmd|exe|ps1))?(?=\s|$)/i.test(text)
    || (/^(?:&\s*)?node(?:\.exe)?\s+/i.test(text)
      && /apps[\\/]cli[\\/]lib[\\/]bin\.js["']?(?=\s|$)/i.test(text));
  return launcher && /(?:^|\s)(?:web|--profile(?:=|\s+)["']?web["']?)(?=\s|$)/i.test(text);
}

/** Accept an actual local listening address; never persist readiness URLs or tokens. */
export function validateDeepSeekWebUrl(value: string): string | null {
  try {
    const url = new URL(value);
    if (url.protocol !== "http:" || url.username || url.password
      || !["127.0.0.1", "localhost", "[::1]"].includes(url.hostname)
      || !/^http:\/\/(?:127\.0\.0\.1|localhost|\[::1\]):\d+(?:[/?#]|$)/i.test(value)
      || Number(url.port || 80) < 1 || Number(url.port || 80) > 65535) return null;
    return url.href;
  } catch {
    return null;
  }
}

/** Emit a dedicated service-exit line even when optional shell monitoring is disabled. */
export function withDeepSeekStopMarker(command: string | undefined, shell?: string | null): string | undefined {
  if (!isDeepSeekWebCommand(command) || command?.includes(DEEPSEEK_STOP_MARKER)) return command;
  const kind = normalizeShellKey(shell);
  if (shell?.trim() && !kind) throw new Error("deepseek_shell_unsupported");
  if (kind === "cmd") return `${command} & echo ${DEEPSEEK_STOP_MARKER}`;
  if (kind === "powershell" || kind === "pwsh" || !kind) {
    return `try { ${command} } finally { [Console]::WriteLine(); [Console]::WriteLine('${DEEPSEEK_STOP_MARKER}') }`;
  }
  if (kind === "fish") return `${command}; printf '\\n${DEEPSEEK_STOP_MARKER}\\n'`;
  return `(trap 'printf "\\n${DEEPSEEK_STOP_MARKER}\\n"' EXIT; trap 'exit 130' INT; trap 'exit 143' TERM; ${command})`;
}

/** Bounded ordered reader; lifecycle OSCs and readiness share one output sequence. */
export class DeepSeekReadinessReader {
  private decoder = new TextDecoder();
  private pending = "";
  private line = "";

  constructor(private readonly sessionId?: string) {}

  /** Also publish null when this exact service finishes, before a later readiness event. */
  push(data: Uint8Array, onChange?: (url: string | null) => void): string | null {
    const text = this.pending + this.decoder.decode(data, { stream: true });
    this.pending = "";
    let endpoint: string | null = null;
    for (let cursor = 0; cursor < text.length; cursor++) {
      if (text[cursor] === "\x1b" && (text[cursor + 1] === "]" || cursor === text.length - 1)) {
        const rest = text.slice(cursor);
        const osc = /^\x1b\]([^\x07]*?)(?:\x07|\x1b\\)/.exec(rest);
        if (!osc) {
          this.pending = rest.length <= 8192 ? rest : "";
          break;
        }
        const body = osc[1];
        const standard = /^(?:133|633);[ACD](?:;|$)/.test(body);
        const legacy = body.startsWith("777;cli-manager;")
          && (!this.sessionId || body.split(";").includes(`session=${this.sessionId}`))
          && /(?:^|;)event=(?:command_started|command_finished|prompt_shown)(?:;|$)/.test(body);
        if (standard || legacy) {
          this.line = "";
          endpoint = null;
          onChange?.(null);
        }
        cursor += osc[0].length - 1;
      } else if (text[cursor] === "\r" || text[cursor] === "\n") {
        const line = this.line.replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, "");
        this.line = "";
        if (line.trim() === DEEPSEEK_STOP_MARKER) {
          endpoint = null;
          onChange?.(null);
        } else {
          const match = /(?:^|\s)dsh web:\s+(http:\/\/\S+)/.exec(line);
          const url = match && validateDeepSeekWebUrl(match[1]);
          if (url) { endpoint = url; onChange?.(url); }
        }
      } else {
        this.line = (this.line + text[cursor]).slice(-4096);
      }
    }
    return endpoint;
  }

  /** A replay reset starts a different output generation. */
  reset(): void {
    this.decoder = new TextDecoder();
    this.pending = "";
    this.line = "";
  }
}
