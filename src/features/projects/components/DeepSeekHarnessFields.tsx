import { useEffect, useId, useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { useI18n } from "../../../shared/i18n/index";
import { getDeepSeekSourceRoot, setDeepSeekSourceRoot } from "../../../shared/lib/deepseekHarness";
import { Input } from "../../../shared/ui/input";
import { Button } from "../../../shared/ui/button";
import { validateDeepSeekSource } from "../api/deepseekSource";

interface Props {
  envText: string;
  onChange: (value: string) => void;
  native: boolean;
}

/** Keep optional source debugging under advanced settings, preserving existing project configuration. */
export function DeepSeekHarnessFields({ envText, onChange, native }: Props) {
  const { t } = useI18n();
  const [error, setError] = useState("");
  const [checking, setChecking] = useState(false);
  const root = getDeepSeekSourceRoot(envText);
  const [draft, setDraft] = useState(root);
  const [expanded, setExpanded] = useState(Boolean(root));
  const inputId = useId();
  useEffect(() => {
    setDraft((current) => current.trim() === root ? current : root);
    if (root) setExpanded(true);
  }, [root]);
  const update = (value: string) => {
    try {
      onChange(setDeepSeekSourceRoot(envText, value));
      setDraft(value);
      setError("");
    } catch {
      setError(t("configModal.deepseek.envInvalid"));
    }
  };
  const browse = async () => {
    try {
      const selected = await open({ directory: true, title: t("configModal.deepseek.sourceRoot") });
      if (typeof selected !== "string") return;
      setChecking(true);
      update(selected);
      await validateDeepSeekSource(selected, envText);
    } catch (failure) {
      setError(String(failure instanceof Error ? failure.message : failure));
    } finally {
      setChecking(false);
    }
  };
  if (!native && !root) return null;
  return (
    <details
      open={expanded}
      onToggle={(event) => setExpanded(event.currentTarget.open)}
      className="rounded-xl border border-border/70 p-3"
    >
      <summary className="ui-focus-ring cursor-pointer rounded text-xs font-medium text-text-secondary">
        {t("configModal.deepseek.advanced")}
        {root && <span className="ml-2 text-text-muted">{t("configModal.deepseek.sourceActive")}</span>}
      </summary>
      <div className="mt-3 space-y-2">
        <p className="text-xs text-text-muted">{t("configModal.deepseek.help")}</p>
        <div className="ui-config-form-label">
          <label htmlFor={inputId}>
            {t("configModal.deepseek.sourceRoot")}
          </label>
          <div className="mt-1 flex gap-2">
            <Input
              id={inputId}
              value={draft}
              onChange={(event) => update(event.target.value)}
              placeholder={t("configModal.deepseek.installed")}
              disabled={!native && !root}
              aria-invalid={!!error}
            />
            <Button type="button" variant="outline" onClick={() => void browse()} disabled={!native || checking}>
              {t("configModal.deepseek.browse")}
            </Button>
            {root && (
              <Button type="button" variant="outline" onClick={() => update("")}>
                {t("configModal.deepseek.clear")}
              </Button>
            )}
          </div>
        </div>
        {!native && <p className="text-xs text-text-muted">{t("configModal.deepseek.guestHelp")}</p>}
        {error && <p role="alert" className="text-xs text-red-400">{error}</p>}
      </div>
    </details>
  );
}
