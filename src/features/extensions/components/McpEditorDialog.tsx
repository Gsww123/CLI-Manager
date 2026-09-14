import { useEffect, useState } from "react";
import { Alert, Button, Group, Modal, Text, Textarea } from "@mantine/core";
import { toast } from "sonner";
import { useI18n } from "../../../shared/i18n";
import type { McpResource, McpResourceRedacted } from "../../../shared/types/extensions";
import { upsertManagedMcpResource, validateExtensionMcpResource } from "../api";
import { mcpEditorJson, parseMcpEditorJson } from "../lib/mcpJsonEditor";

/** Editor scroll is separate from its footer, so long JSON never hides Save/Close. */
export function McpEditorDialog({ resource, open, onClose, onSaved, onBeforeSave }: {
  resource: McpResourceRedacted | null; open: boolean; onClose: () => void; onSaved: (resource: McpResourceRedacted) => void;
  onBeforeSave: () => Promise<void>;
}) {
  const { t } = useI18n();
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  useEffect(() => { if (open) { setDraft(mcpEditorJson(resource)); setError(null); } }, [open, resource]);
  const save = async () => {
    if (saving) return;
    setError(null);
    let parsed: McpResource;
    try { parsed = parseMcpEditorJson(draft, resource); }
    catch { setError(t("extensions.mcp.jsonInvalid")); return; }
    setSaving(true);
    try {
      const report = await validateExtensionMcpResource(parsed);
      if (!report.valid) {
        setError(t("extensions.mcp.editorValidationFailed", { issues: report.issues.map(issue => `${issue.field}: ${issue.code}`).join(", ") }));
        return;
      }
      await onBeforeSave();
      onSaved(await upsertManagedMcpResource(parsed));
      toast.success(t("extensions.mcp.saved"));
      onClose();
    } catch { setError(t("extensions.mcp.saveFailed")); }
    finally { setSaving(false); }
  };
  return <Modal opened={open} onClose={() => { if (!saving) onClose(); }} centered size="lg" zIndex={80}
    title={t(resource ? "extensions.mcp.editorTitleEdit" : "extensions.mcp.editorTitleNew")}
    closeOnEscape={!saving} closeOnClickOutside={!saving} closeButtonProps={{ disabled: saving }}
    styles={{ content: { maxHeight: "90dvh", display: "flex", flexDirection: "column" }, header: { flexShrink: 0 },
      body: { minHeight: 0, display: "flex", flexDirection: "column", overflow: "hidden" } }}>
    <div className="min-h-0 overflow-y-auto">
      <Text size="xs" c="dimmed" mb="sm">{t("extensions.mcp.jsonHelp")}</Text>
      {Boolean(resource?.redactedFields.length) && <Alert color="yellow" mb="sm">{t("extensions.mcp.editorSecretRedacted")}</Alert>}
      {error && <Alert color="red" mb="sm">{error}</Alert>}
      <Textarea aria-label={t("extensions.mcp.editorLabel")} value={draft} disabled={saving}
        onChange={event => setDraft(event.currentTarget.value)} spellCheck={false}
        styles={{ input: { height: "clamp(140px, 38dvh, 360px)", resize: "none", fontFamily: "var(--font-mono, ui-monospace)", fontSize: 12 } }} />
    </div>
    <Group justify="flex-end" mt="md" style={{ flexShrink: 0 }}>
      <Button variant="light" disabled={saving} onClick={onClose}>{t("extensions.import.close")}</Button>
      <Button loading={saving} onClick={() => void save()}>{t("extensions.mcp.save")}</Button>
    </Group>
  </Modal>;
}
