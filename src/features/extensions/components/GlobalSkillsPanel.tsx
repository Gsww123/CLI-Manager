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
  Text,
} from "@mantine/core";
import { ArchiveRestore, Download, FolderInput, Github, RefreshCw, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useI18n, type TranslationKey } from "../../../shared/i18n/index";
import { useAppConfirm } from "../../../shared/ui/useAppConfirm";
import {
  deployManagedSkill,
  restoreManagedSkill,
  uninstallManagedSkill,
} from "../api";
import type {
  ExtensionCli,
  SkillPackageView,
  SkillSyncMode,
  SkillInstallationView,
} from "../../../shared/types/extensions";
import type { NativeProviderHomeState } from "../../settings/api/nativeProviderTypes";
import { ExtensionImportDialog } from "./ExtensionImportDialog";
import { GithubSkillDialog } from "./GithubSkillDialog";

const CLI_ORDER: ExtensionCli[] = ["claude", "codex", "grok"];

const CLI_LABEL_KEYS: Record<ExtensionCli, TranslationKey> = {
  claude: "extensions.mcp.cliClaude",
  codex: "extensions.mcp.cliCodex",
  grok: "extensions.mcp.cliGrok",
};

const MODE_LABEL_KEYS: Record<SkillSyncMode, TranslationKey> = {
  auto: "extensions.skills.modeAuto",
  symlink: "extensions.skills.modeSymlink",
  copy: "extensions.skills.modeCopy",
};

const STATUS_LABEL_KEYS: Partial<Record<string, TranslationKey>> = {
  active: "extensions.skills.active",
  externalModified: "extensions.skills.externalModified",
  missing: "extensions.skills.missing",
  unreadable: "extensions.skills.unreadable",
};

function normalizePath(value: string): string {
  return value.trim().replace(/\//g, "\\").replace(/\\+$/, "").toLocaleLowerCase();
}

function isCurrentInstallation(installation: SkillInstallationView, home: NativeProviderHomeState | null): boolean {
  return Boolean(
    home
      && installation.environmentKind === home.identity.environmentKind
      && installation.environmentId === home.identity.environmentId
      && normalizePath(installation.homePath) === normalizePath(home.homePath),
  );
}

function modeLabel(mode: string, t: (key: TranslationKey) => string): string {
  const key = MODE_LABEL_KEYS[mode as SkillSyncMode];
  return key ? t(key) : mode;
}

function statusLabel(installation: SkillInstallationView, t: (key: TranslationKey) => string): string {
  const status = installation.externalModified ? "externalModified" : installation.status;
  const key = STATUS_LABEL_KEYS[status];
  return key ? t(key) : status;
}

function statusColor(installation: SkillInstallationView): string {
  if (installation.externalModified || installation.status === "externalModified") return "yellow";
  if (installation.status === "missing" || installation.status === "unreadable") return "red";
  return "green";
}

interface SkillDeployDialogProps {
  packageView: SkillPackageView | null;
  open: boolean;
  home: NativeProviderHomeState | null;
  onClose: () => void;
  onDeployed: () => Promise<void>;
}

function SkillDeployDialog({ packageView, open, home, onClose, onDeployed }: SkillDeployDialogProps) {
  const { t } = useI18n();
  const [cli, setCli] = useState<ExtensionCli>("claude");
  const [mode, setMode] = useState<SkillSyncMode>("auto");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!open) return;
    setCli("claude");
    setMode("auto");
    setSaving(false);
    setError(false);
  }, [open, packageView?.packageId]);

  const deploy = async () => {
    if (!packageView || !home) return;
    setSaving(true);
    setError(false);
    try {
      await deployManagedSkill({
        packageId: packageView.packageId,
        environmentKind: home.identity.environmentKind,
        environmentId: home.identity.environmentId,
        cli,
        homePath: home.homePath,
        mode,
      });
      toast.success(t("extensions.skills.deploySuccess"));
      await onDeployed();
      onClose();
    } catch {
      setError(true);
      toast.error(t("extensions.skills.deployFailed"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className={`fixed inset-0 z-[60] ${open ? "flex" : "hidden"} items-center justify-center bg-black/50 p-4`}
      role="dialog"
      aria-modal="true"
      aria-label={t("extensions.skills.deployTitle")}
      onClick={() => {
        if (!saving) onClose();
      }}
    >
      <div className="ui-surface-card w-full max-w-xl rounded-2xl p-5" onClick={(event) => event.stopPropagation()}>
        <Stack gap="sm">
          <Stack gap={2}>
            <Text fw={650}>{t("extensions.skills.deployTitle")}</Text>
            <Text size="xs" c="dimmed">{t("extensions.skills.deployDescription")}</Text>
          </Stack>
          {packageView && (
            <Card withBorder padding="sm" radius="md" className="border-border/60 bg-surface-container-low">
              <Text size="sm" fw={600}>{packageView.name}</Text>
              <Text size="xs" c="dimmed" className="break-all">{packageView.packagePath}</Text>
            </Card>
          )}
          {error && <Alert color="red">{t("extensions.skills.deployFailed")}</Alert>}
          <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="sm">
            <Select
              label={t("extensions.skills.cli")}
              value={cli}
              disabled={saving}
              data={CLI_ORDER.map((item) => ({ value: item, label: t(CLI_LABEL_KEYS[item]) }))}
              onChange={(value) => setCli((value as ExtensionCli) || "claude")}
            />
            <Select
              label={t("extensions.skills.mode")}
              value={mode}
              disabled={saving}
              data={(["auto", "symlink", "copy"] as SkillSyncMode[]).map((item) => ({ value: item, label: modeLabel(item, t) }))}
              onChange={(value) => setMode((value as SkillSyncMode) || "auto")}
            />
          </SimpleGrid>
          <Text size="xs" c="dimmed" className="break-all">
            {home?.targets[`${cli}ConfigDir` as keyof typeof home.targets] as string ?? ""}
          </Text>
          <Group justify="flex-end" gap="xs">
            <Button variant="light" color="gray" disabled={saving} onClick={onClose}>{t("extensions.import.close")}</Button>
            <Button color="cliPrimary" leftSection={<Download size={15} />} loading={saving} disabled={!packageView || !home} onClick={() => void deploy()}>
              {t("extensions.skills.deployNow")}
            </Button>
          </Group>
        </Stack>
      </div>
    </div>
  );
}

interface GlobalSkillsPanelProps {
  packages: SkillPackageView[];
  installations: SkillInstallationView[];
  loading: boolean;
  searchValue: string;
  home: NativeProviderHomeState | null;
  onRefresh: () => Promise<void>;
}

/** 全局 Skills 管理：源包、当前目标安装实例和实际同步状态分层展示。 */
export function GlobalSkillsPanel({
  packages,
  installations,
  loading,
  searchValue,
  home,
  onRefresh,
}: GlobalSkillsPanelProps) {
  const { t } = useI18n();
  const { confirm, confirmDialog } = useAppConfirm();
  const [importOpen, setImportOpen] = useState(false);
  const [githubOpen, setGithubOpen] = useState(false);
  const [deployPackage, setDeployPackage] = useState<SkillPackageView | null>(null);

  const currentInstallations = useMemo(
    () => installations.filter((installation) => isCurrentInstallation(installation, home)),
    [home, installations],
  );
  const filteredPackages = useMemo(() => {
    const query = searchValue.trim().toLocaleLowerCase();
    if (!query) return packages;
    return packages.filter((packageView) => [
      packageView.name,
      packageView.description,
      packageView.sourceIdentity,
      packageView.sourceKind,
      packageView.sourceRef,
    ].some((value) => value.toLocaleLowerCase().includes(query)));
  }, [packages, searchValue]);

  const uninstall = async (installation: SkillInstallationView, packageView: SkillPackageView) => {
    if (!(await confirm({
      title: t("extensions.skills.uninstall"),
      message: t("extensions.skills.uninstallConfirm", { name: packageView.name }),
      confirmText: t("extensions.skills.uninstall"),
      danger: true,
    }))) return;
    try {
      await uninstallManagedSkill(installation.installationId);
      toast.success(t("extensions.skills.uninstallSuccess"));
      await onRefresh();
    } catch {
      toast.error(t("extensions.skills.uninstallFailed"));
    }
  };

  const restore = async (installation: SkillInstallationView) => {
    try {
      await restoreManagedSkill(installation.installationId);
      toast.success(t("extensions.skills.restoreSuccess"));
      await onRefresh();
    } catch {
      toast.error(t("extensions.skills.restoreFailed"));
    }
  };

  const installationsFor = (packageId: string) => currentInstallations.filter((item) => item.packageId === packageId);

  return (
    <Stack gap="md">
      {confirmDialog}
      <Group justify="space-between" align="flex-start" wrap="wrap">
        <Stack gap={2}>
          <Text fw={650}>{t("extensions.skills.title")}</Text>
          <Text size="xs" c="dimmed">{t("extensions.skills.description")}</Text>
        </Stack>
        <Group gap="xs" wrap="wrap">
          <Button size="compact-sm" variant="subtle" color="gray" loading={loading} leftSection={<RefreshCw size={15} />} onClick={() => void onRefresh()}>
            {t("extensions.refresh")}
          </Button>
          <Button size="compact-sm" variant="light" leftSection={<FolderInput size={15} />} onClick={() => setImportOpen(true)}>
            {t("extensions.skills.import")}
          </Button>
          <Button size="compact-sm" color="cliPrimary" leftSection={<Github size={15} />} onClick={() => setGithubOpen(true)}>
            {t("extensions.skills.github")}
          </Button>
        </Group>
      </Group>

      <Group gap="xs" wrap="wrap">
        <Badge variant="light">{t("extensions.skills.packageCount", { count: packages.length })}</Badge>
        <Badge variant="light">{t("extensions.skills.installationCount", { count: currentInstallations.length })}</Badge>
        {!home && <Badge color="yellow">{t("extensions.skills.noHome")}</Badge>}
      </Group>

      {loading && packages.length === 0 ? (
        <Text size="sm" c="dimmed">{t("extensions.loading")}</Text>
      ) : filteredPackages.length === 0 ? (
        <Card withBorder radius="lg" padding="xl" className="border-border/60 bg-surface-container-low text-center">
          <Text fw={600}>{t("extensions.skills.noPackages")}</Text>
          <Text size="sm" c="dimmed" className="mt-1">{t("extensions.skills.noPackagesDescription")}</Text>
        </Card>
      ) : (
        <Stack gap="sm">
          {filteredPackages.map((packageView) => {
            const packageInstallations = installationsFor(packageView.packageId);
            return (
              <Card key={packageView.packageId} withBorder radius="lg" padding="md" className="min-w-0 border-border/70 bg-surface-container-low">
                <Stack gap="sm">
                  <Group justify="space-between" align="flex-start" wrap="wrap">
                    <Stack gap={3} miw={0} className="min-w-0">
                      <Group gap="xs" wrap="wrap">
                        <Text fw={650} className="break-words">{packageView.name}</Text>
                        {packageView.version && <Badge variant="light">{packageView.version}</Badge>}
                        <Badge color="gray">{packageView.sourceKind}</Badge>
                      </Group>
                      <Text size="xs" c="dimmed" className="break-words">{packageView.description || t("extensions.skills.descriptionLabel")}</Text>
                    </Stack>
                    <Button size="compact-sm" color="cliPrimary" leftSection={<Download size={15} />} disabled={!home} onClick={() => setDeployPackage(packageView)}>
                      {t("extensions.skills.deploy")}
                    </Button>
                  </Group>
                  <Group gap="xs" wrap="wrap">
                    <Text size="xs" c="dimmed">{t("extensions.skills.source")}: {packageView.sourceIdentity}</Text>
                    {packageView.resolvedCommit && <Text size="xs" c="dimmed">{packageView.resolvedCommit.slice(0, 12)}</Text>}
                  </Group>
                  <Stack gap="xs">
                    <Text size="sm" fw={600}>{t("extensions.skills.installations")}</Text>
                    {packageInstallations.length === 0 ? (
                      <Text size="xs" c="dimmed">{t("extensions.skills.noInstallations")}</Text>
                    ) : packageInstallations.map((installation) => (
                      <Card key={installation.installationId} withBorder padding="sm" radius="md" className="border-border/60">
                        <Group justify="space-between" align="flex-start" wrap="wrap">
                          <Stack gap={3} miw={0} className="min-w-0">
                            <Group gap="xs" wrap="wrap">
                              <Text size="sm" fw={600}>{t(CLI_LABEL_KEYS[installation.cli])}</Text>
                              <Badge color={statusColor(installation)}>{statusLabel(installation, t)}</Badge>
                              <Badge variant="light">{modeLabel(installation.actualMode, t)}</Badge>
                            </Group>
                            <Text size="xs" c="dimmed" className="break-all">{installation.targetPath}</Text>
                            <Text size="xs" c="dimmed">
                              {t("extensions.skills.requestedMode")}: {modeLabel(installation.requestedMode, t)} · {t("extensions.skills.actualMode")}: {modeLabel(installation.actualMode, t)}
                            </Text>
                          </Stack>
                          <Group gap={4}>
                            {installation.backupPath && (
                              <Button size="compact-sm" variant="subtle" color="gray" title={t("extensions.skills.restore")} aria-label={t("extensions.skills.restore")} onClick={() => void restore(installation)}>
                                <ArchiveRestore size={15} />
                              </Button>
                            )}
                            <Button
                              size="compact-sm"
                              variant="subtle"
                              color="red"
                              title={t("extensions.skills.uninstall")}
                              aria-label={t("extensions.skills.uninstall")}
                              disabled={!installation.owned || installation.externalModified}
                              onClick={() => void uninstall(installation, packageView)}
                            >
                              <Trash2 size={15} />
                            </Button>
                          </Group>
                        </Group>
                      </Card>
                    ))}
                  </Stack>
                </Stack>
              </Card>
            );
          })}
        </Stack>
      )}

      <SkillDeployDialog
        packageView={deployPackage}
        open={Boolean(deployPackage)}
        home={home}
        onClose={() => setDeployPackage(null)}
        onDeployed={onRefresh}
      />
      <ExtensionImportDialog
        open={importOpen}
        onClose={() => setImportOpen(false)}
        onApplied={() => void onRefresh()}
      />
      <GithubSkillDialog
        open={githubOpen}
        home={home}
        onClose={() => setGithubOpen(false)}
        onInstalled={() => void onRefresh()}
      />
    </Stack>
  );
}
