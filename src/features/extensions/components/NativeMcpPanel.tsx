import { useState } from "react";
import { Alert, Button, Group, Modal, Select, Stack, Text } from "@mantine/core";
import { useI18n } from "../../../shared/i18n";
import type { ExtensionCli } from "../../../shared/types/extensions";
import { previewNativeMcp, type NativeMcpPreview } from "../api/native";

/** Read-only native preview; the MCP toolbar owns the explicit save workflow. */
export function NativeMcpPanel({ onClose }: { onClose: () => void }) {
  const { t } = useI18n();
  const [cli, setCli] = useState<ExtensionCli>("claude");
  const [preview, setPreview] = useState<NativeMcpPreview | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inspect = async () => {
    setBusy(true); setError(null); setPreview(null);
    try { setPreview(await previewNativeMcp(cli)); }
    catch (cause) { setError(String(cause).split(":", 1)[0]); }
    finally { setBusy(false); }
  };
  return <Modal opened onClose={() => { if (!busy) onClose(); }}
    title={t("extensions.native.configPreview")} size="lg" centered zIndex={70}
    closeOnClickOutside={!busy} closeOnEscape={!busy}
    closeButtonProps={{ disabled: busy, "aria-label": t("extensions.import.close") }}>
    <Stack gap="sm">
      <Text size="sm" c="dimmed">{t("extensions.save.previewHelp")}</Text>
      <Group align="end">
        <Select label={t("extensions.skills.cli")} value={cli} disabled={busy} data={[
          { value: "claude", label: "Claude" }, { value: "codex", label: "Codex" }, { value: "grok", label: "Grok" },
        ]} onChange={(value) => { setCli(value as ExtensionCli); setPreview(null); setError(null); }} />
        <Button loading={busy} onClick={() => void inspect()}>{t("extensions.native.preview")}</Button>
      </Group>
      {error && <Alert color="red">{t("extensions.errors.generic")} {error.match(/^(extensions|provider)_[a-z0-9_]+$/) ? error : ""}</Alert>}
      {preview && <Stack gap="xs">
        <Text size="sm" className="break-all">{preview.path}</Text>
        <Text size="sm">{t("extensions.native.existing")}: {preview.existingKeys.join(", ") || "—"}</Text>
        <Text size="sm">{t("extensions.native.enabled")}: {preview.enabledKeys.join(", ") || "—"}</Text>
        {preview.removedKeys.length > 0 && <Alert color="yellow">{t("extensions.native.removed")}: {preview.removedKeys.join(", ")}</Alert>}
        <Group>
          {!preview.changed && <Text size="sm" c="dimmed">{t("extensions.native.current")}</Text>}
        </Group>
      </Stack>}
    </Stack>
  </Modal>;
}
