import { useState } from "react";
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
  TextInput,
} from "@mantine/core";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import { AlertTriangle, FolderOpen, RefreshCw, RotateCcw, Save } from "lucide-react";
import { toast } from "sonner";
import { useI18n, type TranslationKey } from "../../../shared/i18n/index";
import type { useExtensionEnvironment } from "../hooks/useExtensionEnvironment";

type EnvironmentState = ReturnType<typeof useExtensionEnvironment>;

const HOME_ERROR_KEYS: Partial<Record<string, TranslationKey>> = {
  provider_environment_invalid: "extensions.errors.environmentInvalid",
  provider_environment_id_required: "extensions.errors.environmentIdRequired",
  provider_home_mode_invalid: "extensions.errors.homeModeInvalid",
  provider_home_path_required: "extensions.errors.homePathRequired",
  provider_home_invalid: "extensions.errors.homeInvalid",
  provider_home_not_readable: "extensions.errors.homeNotReadable",
  provider_home_not_writable: "extensions.errors.homeNotWritable",
  provider_home_must_be_parent_directory: "extensions.errors.homeMustBeParent",
  provider_home_environment_mismatch: "extensions.errors.homeEnvironmentMismatch",
  provider_home_preference_read_failed: "extensions.errors.homePreferenceFailed",
  provider_home_preference_write_failed: "extensions.errors.homePreferenceFailed",
  provider_home_active_unavailable: "extensions.errors.homePreferenceFailed",
  provider_wsl_unavailable: "extensions.errors.wslUnavailable",
  provider_wsl_probe_failed: "extensions.errors.wslProbeFailed",
  provider_wsl_list_failed: "extensions.errors.wslListFailed",
};

function errorCode(value: string | null): string | null {
  if (!value) return null;
  const normalized = value.replace(/^Error:\s*/i, "").trim();
  return normalized.split(":", 1)[0] || normalized;
}

function homeError(value: string | null, t: (key: TranslationKey) => string): string | null {
  const code = errorCode(value);
  return code ? t(HOME_ERROR_KEYS[code] ?? "extensions.errors.generic") : null;
}

interface ExtensionEnvironmentCardProps {
  state: EnvironmentState;
}

function targetRows(state: EnvironmentState, t: (key: TranslationKey) => string) {
  const home = state.home;
  if (!home) return [];
  return [
    { label: t("extensions.environment.claudeHome"), path: home.targets.claudeConfigDir },
    { label: t("extensions.environment.codexHome"), path: home.targets.codexConfigDir },
    { label: t("extensions.environment.grokHome"), path: home.targets.grokConfigDir },
  ];
}

/** 全局页共享环境/Home选择，所有后续读取和部署都以此身份为边界。 */
export function ExtensionEnvironmentCard({ state }: ExtensionEnvironmentCardProps) {
  const { t } = useI18n();
  const [openingPath, setOpeningPath] = useState(false);
  const error = homeError(state.errorCode, t);
  const busy = state.loading || state.saving;

  const chooseHome = async () => {
    setOpeningPath(true);
    try {
      const selected = await openDialog({
        directory: true,
        multiple: false,
        title: t("extensions.environment.choosePath"),
        defaultPath: state.homePath.trim() || undefined,
      });
      if (typeof selected === "string" && selected.trim()) {
        state.setMode("manual");
        state.setHomePath(selected);
      }
    } catch {
      toast.error(t("extensions.environment.choosePathFailed"));
    } finally {
      setOpeningPath(false);
    }
  };

  const saveHome = async () => {
    try {
      await state.save();
      toast.success(t("extensions.environment.saved"));
    } catch {
      toast.error(t("extensions.environment.saveFailed"));
    }
  };

  const resetHome = async () => {
    try {
      await state.reset();
      toast.success(t("extensions.environment.reset"));
    } catch {
      toast.error(t("extensions.environment.resetFailed"));
    }
  };

  return (
    <Card withBorder radius="lg" padding="md" className="ui-extension-environment border-border/70 bg-surface-container-low">
      <Stack gap="sm">
        <Group justify="space-between" align="flex-start" wrap="wrap">
          <Stack gap={2}>
            <Text fw={650}>{t("extensions.environment.title")}</Text>
            <Text size="xs" c="dimmed">{t("extensions.environment.description")}</Text>
          </Stack>
          <Button
            size="compact-sm"
            variant="subtle"
            color="gray"
            loading={state.loading}
            aria-label={t("extensions.environment.refresh")}
            onClick={() => void state.refresh().catch(() => undefined)}
          >
            <RefreshCw size={15} />
          </Button>
        </Group>

        {error && (
          <Alert color="red" variant="light" icon={<AlertTriangle size={16} />}>
            {error}
          </Alert>
        )}

        <SimpleGrid cols={{ base: 1, sm: 3 }} spacing="sm">
          <Select
            label={t("extensions.environment.kind")}
            value={state.environmentKind}
            disabled={state.saving}
            data={[
              { value: "local", label: t("extensions.environment.local") },
              { value: "wsl", label: t("extensions.environment.wsl") },
            ]}
            onChange={(value) => state.setEnvironmentKind(value === "wsl" ? "wsl" : "local")}
          />
          {state.environmentKind === "wsl" ? (
            <Select
              label={t("extensions.environment.id")}
              value={state.environmentId || null}
              disabled={state.saving || state.loading}
              placeholder={t("extensions.environment.idPlaceholder")}
              nothingFoundMessage={t("extensions.environment.noDistros")}
              data={state.wslDistros.map((distro) => ({ value: distro, label: distro }))}
              onChange={(value) => state.setEnvironmentId(value ?? "")}
            />
          ) : (
            <TextInput
              label={t("extensions.environment.id")}
              value={state.environmentId}
              disabled
            />
          )}
          <Select
            label={t("extensions.environment.mode")}
            value={state.mode}
            disabled={state.saving}
            data={[
              { value: "auto", label: t("extensions.environment.auto") },
              { value: "manual", label: t("extensions.environment.manual") },
            ]}
            onChange={(value) => state.setMode(value === "manual" ? "manual" : "auto")}
          />
        </SimpleGrid>

        <Group align="flex-end" gap="xs" wrap="nowrap">
          <TextInput
            className="min-w-0 flex-1"
            label={t("extensions.environment.homePath")}
            description={t("extensions.environment.homePathDescription")}
            value={state.homePath}
            disabled={state.saving || (state.mode === "auto" && state.environmentKind !== "wsl")}
            placeholder={t("extensions.environment.homePathPlaceholder")}
            onChange={(event) => {
              if (state.mode === "auto") state.setMode("manual");
              state.setHomePath(event.currentTarget.value);
            }}
          />
          <Button
            variant="light"
            color="gray"
            leftSection={<FolderOpen size={15} />}
            loading={openingPath}
            disabled={busy}
            onClick={() => void chooseHome()}
          >
            {t("extensions.environment.choosePath")}
          </Button>
        </Group>

        <Group gap="xs" wrap="wrap">
          <Button
            size="sm"
            color="cliPrimary"
            leftSection={<Save size={15} />}
            loading={state.saving}
            disabled={busy || (state.environmentKind === "wsl" && !state.environmentId.trim()) || (state.mode === "manual" && !state.homePath.trim())}
            onClick={() => void saveHome()}
          >
            {t("extensions.environment.save")}
          </Button>
          <Button
            size="sm"
            variant="light"
            color="gray"
            leftSection={<RotateCcw size={15} />}
            loading={state.saving}
            disabled={busy || (state.environmentKind === "wsl" && !state.environmentId.trim())}
            onClick={() => void resetHome()}
          >
            {t("extensions.environment.resetButton")}
          </Button>
          {state.home && (
            <Badge color={state.home.source === "manual" ? "yellow" : "gray"}>
              {state.home.source === "manual" ? t("extensions.environment.sourceManual") : t("extensions.environment.sourceAuto")}
            </Badge>
          )}
        </Group>

        {state.home && (
          <SimpleGrid cols={{ base: 1, sm: 3 }} spacing="xs" className="ui-extension-target-grid">
            {targetRows(state, t).map((target) => (
              <div key={target.label} className="min-w-0 rounded-lg border border-border/60 px-3 py-2">
                <Text size="xs" c="dimmed">{target.label}</Text>
                <Text size="xs" className="mt-1 break-all font-mono">{target.path}</Text>
              </div>
            ))}
          </SimpleGrid>
        )}
      </Stack>
    </Card>
  );
}
