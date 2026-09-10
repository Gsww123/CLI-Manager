import { useCallback, useEffect, useRef, useState } from "react";
import { Alert, SegmentedControl, Stack } from "@mantine/core";
import { AlertTriangle } from "lucide-react";
import { useI18n } from "../../../shared/i18n/index";
import {
  fetchExtensionMcpCapabilities,
  listManagedMcpResources,
  listManagedSkillInstallations,
  listManagedSkillPackages,
} from "../api";
import type {
  McpCliCapability,
  McpResourceRedacted,
  SkillInstallationView,
  SkillPackageView,
} from "../../../shared/types/extensions";
import { extensionHomeIdentity, useExtensionEnvironment } from "../hooks/useExtensionEnvironment";
import { ExtensionEnvironmentCard } from "./ExtensionEnvironmentCard";
import { GlobalMcpPanel } from "./GlobalMcpPanel";
import { GlobalSkillsPanel } from "./GlobalSkillsPanel";

interface GlobalExtensionsPageProps {
  searchValue: string;
}

type ExtensionTab = "mcp" | "skills";

/** 设置页中的扩展总入口，统一环境边界并丢弃切换环境期间的过期读取。 */
export function GlobalExtensionsPage({ searchValue }: GlobalExtensionsPageProps) {
  const { t } = useI18n();
  const environment = useExtensionEnvironment();
  const [activeTab, setActiveTab] = useState<ExtensionTab>("mcp");
  const [resources, setResources] = useState<McpResourceRedacted[]>([]);
  const [capabilities, setCapabilities] = useState<McpCliCapability[]>([]);
  const [packages, setPackages] = useState<SkillPackageView[]>([]);
  const [installations, setInstallations] = useState<SkillInstallationView[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const refreshIdRef = useRef(0);
  const homeIdentity = extensionHomeIdentity(environment.home);
  const homeScope = environment.home ? `${homeIdentity}:${environment.home.homePath}` : homeIdentity;

  const refresh = useCallback(async () => {
    const refreshId = ++refreshIdRef.current;
    setLoading(true);
    setError(false);
    try {
      const [nextResources, nextCapabilities, nextPackages, nextInstallations] = await Promise.all([
        listManagedMcpResources(),
        fetchExtensionMcpCapabilities(),
        listManagedSkillPackages(),
        listManagedSkillInstallations(),
      ]);
      if (refreshId !== refreshIdRef.current) return;
      setResources(nextResources);
      setCapabilities(nextCapabilities);
      setPackages(nextPackages);
      setInstallations(nextInstallations);
    } catch {
      if (refreshId === refreshIdRef.current) setError(true);
    } finally {
      if (refreshId === refreshIdRef.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    setInstallations([]);
    void refresh();
  }, [homeScope, refresh]);

  return (
    <Stack gap="md">
      <ExtensionEnvironmentCard state={environment} />
      {error && (
        <Alert color="red" variant="light" icon={<AlertTriangle size={16} />}>
          {t("extensions.errors.generic")}
          <button type="button" className="ml-2 underline" onClick={() => void refresh()}>{t("extensions.retry")}</button>
        </Alert>
      )}
      <SegmentedControl
        fullWidth
        value={activeTab}
        data={[
          { value: "mcp", label: t("extensions.tabs.mcp") },
          { value: "skills", label: t("extensions.tabs.skills") },
        ]}
        onChange={(value) => setActiveTab(value as ExtensionTab)}
      />
      {activeTab === "mcp" ? (
        <GlobalMcpPanel
          resources={resources}
          capabilities={capabilities}
          loading={loading}
          searchValue={searchValue}
          onRefresh={refresh}
          onResourceChanged={(resource) => setResources((current) => current.map((item) => item.resourceId === resource.resourceId ? resource : item))}
          onResourceDeleted={(resourceId) => setResources((current) => current.filter((item) => item.resourceId !== resourceId))}
        />
      ) : (
        <GlobalSkillsPanel
          packages={packages}
          installations={installations}
          loading={loading}
          searchValue={searchValue}
          environment={environment}
          onRefresh={refresh}
        />
      )}
    </Stack>
  );
}
