import { useCallback, useSyncExternalStore } from "react";
import { Globe } from "lucide-react";
import { openUrl } from "@tauri-apps/plugin-opener";
import { toast } from "sonner";
import { useI18n } from "../../../shared/i18n/index";
import { isDeepSeekHarnessTool, isDeepSeekWebCommand } from "../../../shared/lib/deepseekHarness";
import { useTerminalStore } from "../state";
import {
  getDeepSeekWebUrl, subscribeDeepSeekWebSession,
} from "../api/deepseekWebRuntime";

/** Reopen the current Web service; a remote loopback address requires explicit tunnelling. */
export function DeepSeekWebButton() {
  const { t } = useI18n();
  const session = useTerminalStore((state) => state.sessions.find((item) => item.id === state.activeSessionId));
  const sessionId = session?.id ?? "";
  const status = useTerminalStore((state) => state.sessionStatuses[sessionId]);
  const enabled = !!session && (
    isDeepSeekHarnessTool(session.cliTool) || isDeepSeekWebCommand(session.startupCmd)
  );
  const subscribe = useCallback((notify: () => void) => (
    enabled ? subscribeDeepSeekWebSession(sessionId, notify) : () => undefined
  ), [enabled, sessionId]);
  const snapshot = useCallback(() => getDeepSeekWebUrl(sessionId), [sessionId]);
  const url = useSyncExternalStore(subscribe, snapshot, () => null);
  if (!enabled) return null;
  const remote = session.environmentType === "ssh";
  const title = remote ? t("terminal.deepseek.sshForward")
    : url ? t("terminal.deepseek.open") : t("terminal.deepseek.waiting");
  const open = async () => {
    if (!url || remote) return;
    try {
      await openUrl(url);
    } catch {
      toast.error(t("terminal.deepseek.openFailed"));
    }
  };
  return (
    <button
      type="button"
      className="ui-focus-ring ui-icon-action"
      disabled={!url || remote || status !== "running"}
      onClick={() => void open()}
      title={title}
      aria-label={title}
      data-testid="deepseek-web-open"
    >
      <Globe size={13} strokeWidth={1.8} />
    </button>
  );
}
