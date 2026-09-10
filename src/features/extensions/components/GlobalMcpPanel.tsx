import { useEffect, useMemo, useState } from "react";
import {
  Alert,
  Badge,
  Button,
  Card,
  Group,
  Select,
  SimpleGrid,
  Stack,
  Switch,
  Text,
  Textarea,
} from "@mantine/core";
import { AlertTriangle, Braces, Check, Code2, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useI18n, type TranslationKey } from "../../../shared/i18n/index";
import { useAppConfirm } from "../../../shared/ui/useAppConfirm";
import {
  deleteManagedMcpResource,
  previewExtensionMcpProjection,
  setManagedMcpResourceEnabled,
  upsertManagedMcpResource,
  validateExtensionMcpResource,
} from "../api";
import type {
  ExtensionCli,
  McpCliCapability,
  McpProjectionPreview,
  McpResource,
  McpResourceRedacted,
} from "../../../shared/types/extensions";
import { ExtensionImportDialog } from "./ExtensionImportDialog";

const CLI_ORDER: ExtensionCli[] = ["claude", "codex", "grok"];

const CLI_LABEL_KEYS: Record<ExtensionCli, TranslationKey> = {
  claude: "extensions.mcp.cliClaude",
  codex: "extensions.mcp.cliCodex",
  grok: "extensions.mcp.cliGrok",
};

const TRANSPORT_KEYS: Record<McpResource["transport"], TranslationKey> = {
  stdio: "extensions.mcp.transportStdio",
  sse: "extensions.mcp.transportSse",
  streamableHttp: "extensions.mcp.transportHttp",
};

const CAPABILITY_STATUS_KEYS: Record<string, TranslationKey> = {
  supported: "extensions.status.supported",
  globalOnly: "extensions.status.globalOnly",
  unknown: "extensions.status.unknown",
  error: "extensions.status.error",
};

function newResourceId(): string {
  const randomUuid = globalThis.crypto?.randomUUID?.();
  return `mcp-${randomUuid ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`}`;
}

function emptyResource(): McpResource {
  return {
    schemaVersion: 1,
    resourceId: newResourceId(),
    serverKey: "",
    name: "",
    transport: "stdio",
    command: "",
    args: [],
    cwd: null,
    url: null,
    env: {},
    headers: {},
    secretRefs: {},
    timeout: null,
    perCliExtensions: {},
    enabledByCli: { claude: true, codex: true, grok: true },
    source: null,
    extra: {},
  };
}

function editableResource(resource: McpResourceRedacted): McpResource {
  const { redactedFields: _redactedFields, ...editable } = resource;
  return {
    ...editable,
    enabledByCli: {
      claude: resource.enabledByCli?.claude ?? true,
      codex: resource.enabledByCli?.codex ?? true,
      grok: resource.enabledByCli?.grok ?? true,
    },
  } as McpResource;
}

function asObject(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function parseResourceDraft(value: string): McpResource {
  const parsed = asObject(JSON.parse(value));
  if (!parsed) throw new Error("invalid-json");
  const enabledByCli = asObject(parsed.enabledByCli);
  parsed.enabledByCli = {
    claude: enabledByCli?.claude !== false,
    codex: enabledByCli?.codex !== false,
    grok: enabledByCli?.grok !== false,
  };
  return parsed as McpResource;
}

function sourceLabel(resource: McpResourceRedacted, fallback: string): string {
  return resource.source?.label?.trim() || resource.source?.kind?.trim() || fallback;
}

function capabilityColor(status: string): string {
  if (status === "supported") return "green";
  if (status === "globalOnly") return "yellow";
  if (status === "error") return "red";
  return "gray";
}

interface McpEditorDialogProps {
  resource: McpResourceRedacted | null;
  open: boolean;
  onClose: () => void;
  onSaved: (resource: McpResourceRedacted) => void;
}

function McpEditorDialog({ resource, open, onClose, onSaved }: McpEditorDialogProps) {
  const { t } = useI18n();
  const [draft, setDraft] = useState(() => JSON.stringify(resource ? editableResource(resource) : emptyResource(), null, 2));
  const [invalidJson, setInvalidJson] = useState(false);
  const [saving, setSaving] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setDraft(JSON.stringify(resource ? editableResource(resource) : emptyResource(), null, 2));
      setInvalidJson(false);
      setValidationError(null);
    }
  }, [open, resource]);

  const isRedacted = Boolean(resource?.redactedFields.length);

  const save = async () => {
    setInvalidJson(false);
    setValidationError(null);
    let parsed: McpResource;
    try {
      parsed = parseResourceDraft(draft);
    } catch {
      setInvalidJson(true);
      return;
    }
    if (isRedacted) {
      setValidationError(t("extensions.mcp.editorSecretSaveBlocked"));
      return;
    }
    setSaving(true);
    try {
      const report = await validateExtensionMcpResource(parsed);
      if (!report.valid) {
        setValidationError(t("extensions.mcp.editorValidationFailed", {
          issues: report.issues.map((issue) => `${issue.field}: ${issue.code}`).join(", "),
        }));
        return;
      }
      const saved = await upsertManagedMcpResource(parsed);
      onSaved(saved);
      toast.success(t("extensions.mcp.saved"));
      onClose();
    } catch {
      toast.error(t("extensions.mcp.saveFailed"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className={`fixed inset-0 z-[60] ${open ? "flex" : "hidden"} items-center justify-center bg-black/50 p-4`}
      role="dialog"
      aria-modal="true"
      aria-label={t(resource ? "extensions.mcp.editorTitleEdit" : "extensions.mcp.editorTitleNew")}
      onClick={onClose}
    >
      <div
        className="ui-surface-card flex max-h-[92vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl p-5"
        onClick={(event) => event.stopPropagation()}
      >
        <Stack gap="sm">
          <Group justify="space-between" align="flex-start" wrap="wrap">
            <Stack gap={2}>
              <Text fw={650}>{t(resource ? "extensions.mcp.editorTitleEdit" : "extensions.mcp.editorTitleNew")}</Text>
              <Text size="xs" c="dimmed">{t("extensions.mcp.editorDescription")}</Text>
            </Stack>
            <Button variant="subtle" color="gray" onClick={onClose}>{t("extensions.import.close")}</Button>
          </Group>
          {isRedacted && (
            <Alert color="yellow" variant="light" icon={<AlertTriangle size={16} />}>
              {t("extensions.mcp.editorSecretRedacted")}
            </Alert>
          )}
          {(invalidJson || validationError) && (
            <Alert color="red" variant="light" icon={<AlertTriangle size={16} />}>
              {invalidJson ? t("extensions.mcp.editorInvalidJson") : validationError}
            </Alert>
          )}
          <Textarea
            label={t("extensions.mcp.editorLabel")}
            aria-label={t("extensions.mcp.editorLabel")}
            value={draft}
            onChange={(event) => setDraft(event.currentTarget.value)}
            minRows={18}
            autosize
            maxRows={30}
            spellCheck={false}
            styles={{ input: { fontFamily: "var(--font-mono, ui-monospace)", fontSize: 12 } }}
          />
          <Group justify="flex-end" gap="xs">
            <Button variant="light" color="gray" onClick={onClose}>{t("extensions.import.close")}</Button>
            <Button color="cliPrimary" leftSection={<Check size={15} />} loading={saving} onClick={() => void save()}>
              {t("extensions.mcp.save")}
            </Button>
          </Group>
        </Stack>
      </div>
    </div>
  );
}

interface ProjectionDialogProps {
  resources: McpResourceRedacted[];
  open: boolean;
  onClose: () => void;
  capabilities: McpCliCapability[];
}

function ProjectionDialog({ resources, open, onClose, capabilities }: ProjectionDialogProps) {
  const { t } = useI18n();
  const [cli, setCli] = useState<ExtensionCli>("claude");
  const [preview, setPreview] = useState<McpProjectionPreview | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);

  const generate = async () => {
    setLoading(true);
    setError(false);
    try {
      const requestResources = resources.map(editableResource);
      const baseConfig = cli === "claude" ? "{}" : "";
      setPreview(await previewExtensionMcpProjection({ cli, baseConfig, resources: requestResources }));
    } catch {
      setPreview(null);
      setError(true);
    } finally {
      setLoading(false);
    }
  };

  const selectedCapability = capabilities.find((item) => item.cli === cli);

  return (
    <div
      className={`fixed inset-0 z-[60] ${open ? "flex" : "hidden"} items-center justify-center bg-black/50 p-4`}
      role="dialog"
      aria-modal="true"
      aria-label={t("extensions.mcp.projectionTitle")}
      onClick={onClose}
    >
      <div className="ui-surface-card flex max-h-[92vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl p-5" onClick={(event) => event.stopPropagation()}>
        <Stack gap="sm">
          <Group justify="space-between" align="flex-start" wrap="wrap">
            <Stack gap={2}>
              <Text fw={650}>{t("extensions.mcp.projectionTitle")}</Text>
              <Text size="xs" c="dimmed">{t("extensions.mcp.projectionDescription")}</Text>
            </Stack>
            <Button variant="subtle" color="gray" onClick={onClose}>{t("extensions.import.close")}</Button>
          </Group>
          <Alert color="blue" variant="light" icon={<Code2 size={16} />}>
            {t("extensions.mcp.projectionBaseNote")}
          </Alert>
          <Group align="flex-end" gap="xs" wrap="wrap">
            <Select
              className="min-w-[220px] flex-1"
              label={t("extensions.mcp.projectionSelectCli")}
              value={cli}
              data={CLI_ORDER.map((item) => ({ value: item, label: t(CLI_LABEL_KEYS[item]) }))}
              onChange={(value) => {
                setCli((value as ExtensionCli) || "claude");
                setPreview(null);
              }}
            />
            <Button color="cliPrimary" loading={loading} onClick={() => void generate()}>
              {t("extensions.mcp.projectionGenerate")}
            </Button>
          </Group>
          {selectedCapability && (
            <Group gap="xs" wrap="wrap">
              <Badge color={capabilityColor(selectedCapability.status)}>
                {t(CAPABILITY_STATUS_KEYS[selectedCapability.status] ?? "extensions.status.unknown")}
              </Badge>
              <Text size="xs" c="dimmed">
                {t("extensions.mcp.formatVersion", { format: selectedCapability.format.toUpperCase(), version: selectedCapability.version ?? "-" })}
              </Text>
            </Group>
          )}
          {error && <Alert color="red" icon={<AlertTriangle size={16} />}>{t("extensions.errors.generic")}</Alert>}
          {preview && (
            <Stack gap="xs" mih={0} className="min-h-0">
              <Group gap="xs">
                <Badge color={preview.status === "ready" ? "green" : "red"}>
                  {t(preview.status === "ready" ? "extensions.mcp.projectionReady" : "extensions.mcp.projectionUnsupported")}
                </Badge>
                <Text size="xs" c="dimmed">{t("extensions.mcp.selectedCount", { count: preview.resources.length })}</Text>
              </Group>
              {preview.issues.length > 0 && (
                <Alert color="red" variant="light" icon={<AlertTriangle size={16} />}>
                  {preview.issues.map((issue) => `${issue.field}: ${issue.code}`).join(" · ")}
                </Alert>
              )}
              <Textarea
                label={t("extensions.mcp.projectionContent")}
                value={preview.content || t("extensions.mcp.projectionEmpty")}
                readOnly
                minRows={12}
                autosize
                maxRows={22}
                spellCheck={false}
                styles={{ input: { fontFamily: "var(--font-mono, ui-monospace)", fontSize: 12 } }}
              />
            </Stack>
          )}
        </Stack>
      </div>
    </div>
  );
}

interface GlobalMcpPanelProps {
  resources: McpResourceRedacted[];
  capabilities: McpCliCapability[];
  loading: boolean;
  searchValue: string;
  onRefresh: () => Promise<void>;
  onResourceChanged: (resource: McpResourceRedacted) => void;
  onResourceDeleted: (resourceId: string) => void;
}

/** MCP 全局资源列表：编辑 canonical JSON、维护逐 CLI 开关并提供脱敏投影预览。 */
export function GlobalMcpPanel({
  resources,
  capabilities,
  loading,
  searchValue,
  onRefresh,
  onResourceChanged,
  onResourceDeleted,
}: GlobalMcpPanelProps) {
  const { t } = useI18n();
  const { confirm, confirmDialog } = useAppConfirm();
  const [editorResource, setEditorResource] = useState<McpResourceRedacted | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [projectionOpen, setProjectionOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [workingToggle, setWorkingToggle] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);

  const filteredResources = useMemo(() => {
    const query = searchValue.trim().toLocaleLowerCase();
    if (!query) return resources;
    return resources.filter((resource) => [
      resource.name,
      resource.serverKey,
      resource.source?.identity ?? "",
      resource.source?.label ?? "",
    ].some((value) => value.toLocaleLowerCase().includes(query)));
  }, [resources, searchValue]);

  const toggle = async (resource: McpResourceRedacted, cli: ExtensionCli, enabled: boolean) => {
    const key = `${resource.resourceId}:${cli}`;
    setWorkingToggle(key);
    try {
      const updated = await setManagedMcpResourceEnabled(resource.resourceId, cli, enabled);
      onResourceChanged(updated);
    } catch {
      toast.error(t("extensions.mcp.toggleFailed", { cli: t(CLI_LABEL_KEYS[cli]) }));
    } finally {
      setWorkingToggle(null);
    }
  };

  const remove = async (resource: McpResourceRedacted) => {
    const accepted = await confirm({
      title: t("extensions.mcp.delete"),
      message: t("extensions.mcp.deleteConfirm", { name: resource.name }),
      confirmText: t("extensions.mcp.delete"),
      danger: true,
    });
    if (!accepted) return;
    setDeleting(resource.resourceId);
    try {
      await deleteManagedMcpResource(resource.resourceId);
      onResourceDeleted(resource.resourceId);
    } catch {
      toast.error(t("extensions.mcp.deleteFailed"));
    } finally {
      setDeleting(null);
    }
  };

  return (
    <Stack gap="md">
      {confirmDialog}
      <Group justify="space-between" align="flex-start" wrap="wrap">
        <Stack gap={2}>
          <Text fw={650}>{t("extensions.mcp.title")}</Text>
          <Text size="xs" c="dimmed">{t("extensions.mcp.description")}</Text>
        </Stack>
        <Group gap="xs">
          <Button size="compact-sm" variant="subtle" color="gray" loading={loading} onClick={() => void onRefresh()}>
            {t("extensions.refresh")}
          </Button>
          <Button size="compact-sm" variant="light" leftSection={<Braces size={15} />} onClick={() => setProjectionOpen(true)}>
            {t("extensions.mcp.projection")}
          </Button>
          <Button size="compact-sm" variant="light" leftSection={<Plus size={15} />} onClick={() => {
            setEditorResource(null);
            setEditorOpen(true);
          }}>
            {t("extensions.mcp.add")}
          </Button>
          <Button size="compact-sm" color="cliPrimary" onClick={() => setImportOpen(true)}>
            {t("extensions.mcp.import")}
          </Button>
        </Group>
      </Group>

      <Card withBorder radius="lg" padding="md" className="border-border/70 bg-surface-container-low">
        <Stack gap="sm">
          <Group justify="space-between" wrap="wrap">
            <Text size="sm" fw={600}>{t("extensions.mcp.capabilities")}</Text>
            <Text size="xs" c="dimmed">{t("extensions.mcp.selectedCount", { count: resources.length })}</Text>
          </Group>
          <SimpleGrid cols={{ base: 1, sm: 3 }} spacing="xs">
            {capabilities.map((capability) => (
              <div key={capability.cli} className="min-w-0 rounded-lg border border-border/60 px-3 py-2">
                <Group justify="space-between" gap="xs">
                  <Text size="sm" fw={600}>{t(CLI_LABEL_KEYS[capability.cli])}</Text>
                  <Badge size="sm" color={capabilityColor(capability.status)}>
                    {t(CAPABILITY_STATUS_KEYS[capability.status] ?? "extensions.status.unknown")}
                  </Badge>
                </Group>
                <Text size="xs" c="dimmed" className="mt-1">
                  {t("extensions.mcp.formatVersion", { format: capability.format.toUpperCase(), version: capability.version ?? "-" })}
                </Text>
              </div>
            ))}
          </SimpleGrid>
        </Stack>
      </Card>

      {loading && resources.length === 0 ? (
        <Text size="sm" c="dimmed">{t("extensions.loading")}</Text>
      ) : filteredResources.length === 0 ? (
        <Card withBorder radius="lg" padding="xl" className="border-border/60 bg-surface-container-low text-center">
          <Text fw={600}>{t("extensions.empty")}</Text>
          <Text size="sm" c="dimmed" className="mt-1">{t("extensions.emptyDescription")}</Text>
        </Card>
      ) : (
        <Stack gap="sm">
          {filteredResources.map((resource) => (
            <Card key={resource.resourceId} withBorder radius="lg" padding="md" className="min-w-0 border-border/70 bg-surface-container-low">
              <Stack gap="sm">
                <Group justify="space-between" align="flex-start" wrap="wrap">
                  <Stack gap={3} miw={0} className="min-w-0">
                    <Group gap="xs" wrap="wrap">
                      <Text fw={650} className="break-words">{resource.name}</Text>
                      <Badge variant="light">{resource.serverKey}</Badge>
                      <Badge color="gray">{t(TRANSPORT_KEYS[resource.transport])}</Badge>
                    </Group>
                    <Text size="xs" c="dimmed" className="break-all">{sourceLabel(resource, t("extensions.mcp.noSource"))}</Text>
                  </Stack>
                  <Group gap={4}>
                    <Button size="compact-sm" variant="subtle" color="gray" aria-label={t("extensions.mcp.edit")} title={t("extensions.mcp.edit")} onClick={() => {
                      setEditorResource(resource);
                      setEditorOpen(true);
                    }}>
                      <Pencil size={15} />
                    </Button>
                    <Button size="compact-sm" variant="subtle" color="red" loading={deleting === resource.resourceId} aria-label={t("extensions.mcp.delete")} title={t("extensions.mcp.delete")} onClick={() => void remove(resource)}>
                      <Trash2 size={15} />
                    </Button>
                  </Group>
                </Group>
                <SimpleGrid cols={{ base: 1, sm: 3 }} spacing="xs">
                  {CLI_ORDER.map((cli) => {
                    const enabled = resource.enabledByCli?.[cli] ?? true;
                    const toggleKey = `${resource.resourceId}:${cli}`;
                    return (
                      <div key={cli} className="rounded-lg border border-border/60 px-3 py-2">
                        <Switch
                          label={t(CLI_LABEL_KEYS[cli])}
                          description={enabled ? t("extensions.mcp.enabled") : t("extensions.mcp.disabled")}
                          checked={enabled}
                          disabled={workingToggle === toggleKey}
                          aria-label={t("extensions.mcp.enabledFor", { cli: t(CLI_LABEL_KEYS[cli]) })}
                          onChange={(event) => void toggle(resource, cli, event.currentTarget.checked)}
                        />
                      </div>
                    );
                  })}
                </SimpleGrid>
              </Stack>
            </Card>
          ))}
        </Stack>
      )}

      <McpEditorDialog
        resource={editorResource}
        open={editorOpen}
        onClose={() => setEditorOpen(false)}
        onSaved={(resource) => onResourceChanged(resource)}
      />
      <ProjectionDialog
        resources={resources}
        capabilities={capabilities}
        open={projectionOpen}
        onClose={() => setProjectionOpen(false)}
      />
      <ExtensionImportDialog
        open={importOpen}
        onClose={() => setImportOpen(false)}
        onApplied={() => {
          void onRefresh();
        }}
      />
    </Stack>
  );
}
