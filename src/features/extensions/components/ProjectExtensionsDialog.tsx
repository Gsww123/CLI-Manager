import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { AlertTriangle, Check, FolderCog } from "lucide-react";
import { useI18n, type TranslationKey } from "../../../shared/i18n/index";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogTitle } from "../../../shared/ui/dialog";
import { Button } from "../../../shared/ui/button";
import { Input } from "../../../shared/ui/input";
import type { Project, WorktreeRecord } from "../../../shared/types/index";
import type {
  CapabilityStatus,
  ExtensionCli,
  ExtensionPolicyKind,
  ExtensionPolicyMode,
  ExtensionScopeKind,
  ProjectExtensionPolicyResponse,
  ProjectExtensionPolicySaveRequest,
  ProjectExtensionPolicyView,
} from "../../../shared/types/extensions";
import {
  getProjectExtensionPolicy,
  saveProjectExtensionPolicy,
} from "../api/projectPolicy";

type ExtensionKind = ExtensionPolicyKind;
type DraftPolicy = { mode: ExtensionPolicyMode; selectedIds: string[] };
type DraftPolicies = Record<`${ExtensionCli}:${ExtensionKind}`, DraftPolicy>;

const CLI_ORDER: ExtensionCli[] = ["claude", "codex", "grok"];
const KIND_ORDER: ExtensionKind[] = ["mcp", "skill"];

const CLI_LABEL_KEYS: Record<ExtensionCli, TranslationKey> = {
  claude: "extensions.mcp.cliClaude",
  codex: "extensions.mcp.cliCodex",
  grok: "extensions.mcp.cliGrok",
};

const STATUS_LABEL_KEYS: Record<CapabilityStatus, TranslationKey> = {
  supported: "extensions.status.supported",
  globalOnly: "extensions.status.globalOnly",
  unknown: "extensions.status.unknown",
  error: "extensions.status.error",
};

function policyKey(cli: ExtensionCli, kind: ExtensionKind): `${ExtensionCli}:${ExtensionKind}` {
  return `${cli}:${kind}`;
}

function emptyDraftPolicies(): DraftPolicies {
  const next = {} as DraftPolicies;
  for (const cli of CLI_ORDER) {
    for (const kind of KIND_ORDER) {
      next[policyKey(cli, kind)] = { mode: "inherit", selectedIds: [] };
    }
  }
  return next;
}

function draftFromResponse(response: ProjectExtensionPolicyResponse): DraftPolicies {
  const next = emptyDraftPolicies();
  for (const policy of response.policies) {
    next[policyKey(policy.cli, policy.kind)] = {
      mode: policy.mode,
      selectedIds: [...policy.selectedIds],
    };
  }
  return next;
}

function inferWslDistro(path: string): string | null {
  const match = /^\\\\(?:wsl\.localhost|wsl\$)\\([^\\/]+)(?:[\\/]|$)/i.exec(path.trim());
  return match?.[1]?.trim() || null;
}

function targetPath(project: Project, worktree?: WorktreeRecord): string {
  return worktree?.path?.trim() || project.path.trim();
}

function targetEnvironment(project: Project, path: string): { kind: string; id: string } {
  if (project.environment_type === "ssh") return { kind: "ssh", id: "" };
  if (project.environment_type === "wsl") return { kind: "wsl", id: inferWslDistro(path) ?? "" };
  return { kind: "local", id: "host" };
}

function statusColor(status: string): string {
  if (status === "supported" || status === "applied") return "text-success";
  if (status === "globalOnly") return "text-warning";
  if (status === "error") return "text-danger";
  return "text-text-muted";
}

function effectiveForDraft(
  response: ProjectExtensionPolicyResponse,
  parentResponse: ProjectExtensionPolicyResponse | null,
  draft: DraftPolicy,
  cli: ExtensionCli,
  kind: ExtensionKind,
): string[] {
  if (draft.mode === "custom") return draft.selectedIds;
  const inherited = parentResponse?.policies.find((policy) => policy.cli === cli && policy.kind === kind);
  if (response.scopeKind === "worktree" && inherited) return inherited.effectiveIds;
  const globalIds = kind === "mcp" ? response.globalMcpIds[cli] : response.globalSkillIds[cli];
  return globalIds ?? [];
}

function policyFor(
  response: ProjectExtensionPolicyResponse | null,
  cli: ExtensionCli,
  kind: ExtensionKind,
): ProjectExtensionPolicyView | null {
  return response?.policies.find((policy) => policy.cli === cli && policy.kind === kind) ?? null;
}

function itemMatches(value: string, query: string): boolean {
  return value.toLocaleLowerCase().includes(query);
}

interface ProjectExtensionsDialogProps {
  project: Project | null;
  worktree?: WorktreeRecord;
  open: boolean;
  onClose: () => void;
}

/** 项目/Worktree扩展策略编辑器；只保存策略，不改写 CLI 原生项目配置。 */
export function ProjectExtensionsDialog({ project, worktree, open, onClose }: ProjectExtensionsDialogProps) {
  const { t } = useI18n();
  const [activeCli, setActiveCli] = useState<ExtensionCli>("claude");
  const [activeKind, setActiveKind] = useState<ExtensionKind>("mcp");
  const [searchValue, setSearchValue] = useState("");
  const [response, setResponse] = useState<ProjectExtensionPolicyResponse | null>(null);
  const [parentResponse, setParentResponse] = useState<ProjectExtensionPolicyResponse | null>(null);
  const [draftPolicies, setDraftPolicies] = useState<DraftPolicies>(emptyDraftPolicies);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const requestIdRef = useRef(0);

  const path = project ? targetPath(project, worktree) : "";
  const environment = project ? targetEnvironment(project, path) : { kind: "local", id: "host" };
  const scopeKind: ExtensionScopeKind = worktree ? "worktree" : "project";
  const scopeId = worktree?.id ?? project?.id ?? "";
  const targetKey = `${project?.id ?? ""}:${worktree?.id ?? ""}:${environment.kind}:${environment.id}`;
  const isSshTarget = project?.environment_type === "ssh";
  const hasWslIdentity = environment.kind !== "wsl" || Boolean(environment.id);

  useEffect(() => {
    if (!open || !project) return;
    const requestId = ++requestIdRef.current;
    setLoading(true);
    setLoadError(false);
    setResponse(null);
    setParentResponse(null);
    setSearchValue("");
    const request = {
      projectId: project.id,
      worktreeId: worktree?.id ?? null,
      // SSH 目前不执行远端策略应用；读取本机受管全局状态用于 global-only 预览。
      environmentKind: environment.kind === "ssh" ? "local" : environment.kind,
      environmentId: environment.kind === "ssh" ? "host" : environment.id || null,
    };
    const parentRequest = {
      projectId: project.id,
      worktreeId: null,
      environmentKind: environment.kind === "ssh" ? "local" : environment.kind,
      environmentId: environment.kind === "ssh" ? "host" : environment.id || null,
    };
    void Promise.all([
      getProjectExtensionPolicy(request),
      worktree ? getProjectExtensionPolicy(parentRequest) : Promise.resolve(null),
    ])
      .then(([nextResponse, nextParentResponse]) => {
        if (requestId !== requestIdRef.current) return;
        setResponse(nextResponse);
        setParentResponse(nextParentResponse);
        setDraftPolicies(draftFromResponse(nextResponse));
      })
      .catch(() => {
        if (requestId === requestIdRef.current) setLoadError(true);
      })
      .finally(() => {
        if (requestId === requestIdRef.current) setLoading(false);
      });
  }, [environment.id, environment.kind, open, project, targetKey, worktree]);

  const currentDraft = draftPolicies[policyKey(activeCli, activeKind)];
  const currentPolicy = policyFor(response, activeCli, activeKind);
  const parentPolicy = policyFor(parentResponse, activeCli, activeKind);
  const forcedGlobalOnly = isSshTarget || !hasWslIdentity;
  const capabilityStatus: CapabilityStatus = forcedGlobalOnly
    ? "globalOnly"
    : currentPolicy?.capabilityStatus ?? "unknown";
  const applicationStatus = forcedGlobalOnly
    ? "globalOnly"
    : currentPolicy?.applicationStatus ?? "error";
  const globalIds = activeKind === "mcp"
    ? response?.globalMcpIds[activeCli] ?? []
    : response?.globalSkillIds[activeCli] ?? [];
  const availableIds = activeKind === "mcp"
    ? response?.resources.map((resource) => resource.resourceId) ?? []
    : response?.packages.map((packageView) => packageView.packageId) ?? [];
  const effectiveIds = response && currentDraft
    ? effectiveForDraft(response, parentResponse, currentDraft, activeCli, activeKind)
    : [];
  const invalidIds = effectiveIds.filter((id) => !availableIds.includes(id));
  const canCustomize = capabilityStatus === "supported" && !forcedGlobalOnly;
  const editableSelection = canCustomize && currentDraft?.mode === "custom";
  const query = searchValue.trim().toLocaleLowerCase();

  const resources = useMemo(() => {
    if (!response) return [];
    if (activeKind === "mcp") {
      return response.resources
        .filter((resource) => !query || [resource.name, resource.serverKey, resource.resourceId, resource.source?.label ?? ""].some((value) => itemMatches(value, query)))
        .map((resource) => ({
          id: resource.resourceId,
          name: resource.name,
          detail: resource.serverKey,
          source: resource.source?.label || resource.source?.kind || t("extensions.mcp.noSource"),
        }));
    }
    return response.packages
      .filter((packageView) => !query || [packageView.name, packageView.description, packageView.packageId, packageView.sourceIdentity].some((value) => itemMatches(value, query)))
      .map((packageView) => ({
        id: packageView.packageId,
        name: packageView.name,
        detail: packageView.version || packageView.description,
        source: packageView.sourceIdentity,
      }));
  }, [activeKind, query, response, t]);

  const updateDraft = (update: Partial<DraftPolicy>) => {
    setDraftPolicies((current) => ({
      ...current,
      [policyKey(activeCli, activeKind)]: {
        ...current[policyKey(activeCli, activeKind)],
        ...update,
      },
    }));
  };

  const toggleSelection = (id: string) => {
    if (!editableSelection) return;
    const selected = new Set(currentDraft.selectedIds);
    if (selected.has(id)) selected.delete(id);
    else selected.add(id);
    updateDraft({ selectedIds: Array.from(selected) });
  };

  const save = async () => {
    if (!project || !response || !currentDraft || saving || forcedGlobalOnly) return;
    setSaving(true);
    const policies = CLI_ORDER.flatMap((cli) => KIND_ORDER.map((kind) => {
      const draft = draftPolicies[policyKey(cli, kind)];
      return {
        cli,
        kind,
        mode: draft.mode,
        selectedIds: draft.selectedIds,
      };
    }));
    const request: ProjectExtensionPolicySaveRequest = {
      scopeKind,
      scopeId,
      projectId: project.id,
      policies,
    };
    try {
      await saveProjectExtensionPolicy(request);
      toast.success(t("extensions.project.saved"));
      onClose();
    } catch {
      toast.error(t("extensions.project.saveFailed"));
    } finally {
      setSaving(false);
    }
  };

  const close = () => {
    if (!saving) onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => { if (!nextOpen) close(); }}>
      <DialogContent className="flex max-h-[92vh] w-[calc(100vw-2rem)] max-w-5xl flex-col overflow-hidden p-0" showCloseButton={!saving}>
        <div className="border-b border-border/70 px-5 py-4">
          <div className="flex flex-wrap items-start justify-between gap-3 pr-5">
            <div className="min-w-0">
              <DialogTitle className="flex items-center gap-2 text-base">
                <FolderCog size={17} />
                {t("extensions.project.title")}
              </DialogTitle>
              <DialogDescription className="mt-1 max-w-3xl">
                {t("extensions.project.description")}
              </DialogDescription>
            </div>
            <div className="rounded-lg border border-border/60 bg-surface-container-low px-3 py-2 text-right text-xs">
              <div className="font-medium text-text-primary">{project?.name || "—"}{worktree ? ` · ${worktree.name}` : ""}</div>
              <div className="mt-0.5 max-w-[min(60vw,30rem)] truncate text-text-muted" title={path}>{path || "—"}</div>
            </div>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          <div className="mb-3 rounded-lg border border-border/60 bg-surface-container-low/60 px-3 py-2 text-xs text-text-muted">
            <span className="font-medium text-text-secondary">{t("extensions.project.environment")}</span>
            <span className="mx-1">·</span>
            <span>{environment.kind === "wsl" ? t("extensions.environment.wsl") : environment.kind === "ssh" ? t("extensions.project.ssh") : t("extensions.environment.local")}</span>
            {environment.id && <><span className="mx-1">·</span><span>{environment.id}</span></>}
            <span className="mx-1">·</span>
            <span>{scopeKind === "worktree" ? t("extensions.project.scopeWorktree") : t("extensions.project.scopeProject")}</span>
          </div>

          {(isSshTarget || !hasWslIdentity) && (
            <div role="alert" className="mb-3 flex gap-2 rounded-lg border border-warning/40 bg-warning/10 px-3 py-2 text-xs leading-relaxed text-warning">
              <AlertTriangle size={16} className="mt-0.5 shrink-0" />
              <span>{isSshTarget ? t("extensions.project.sshGlobalOnly") : t("extensions.project.wslIdentityMissing")}</span>
            </div>
          )}

          {loadError && (
            <div role="alert" className="mb-3 rounded-lg border border-danger/35 bg-danger/10 px-3 py-2 text-xs text-danger">
              {t("extensions.project.loadFailed")}
            </div>
          )}

          <div className="mb-3 grid gap-2 sm:grid-cols-3" role="tablist" aria-label={t("extensions.project.cli")}>
            {CLI_ORDER.map((cli) => (
              <button
                key={cli}
                type="button"
                role="tab"
                aria-selected={activeCli === cli}
                className={`rounded-lg border px-3 py-2 text-left text-sm transition ${activeCli === cli ? "border-primary bg-primary/10 text-text-primary" : "border-border/60 text-text-secondary hover:bg-surface-container-low"}`}
                onClick={() => setActiveCli(cli)}
              >
                {t(CLI_LABEL_KEYS[cli])}
              </button>
            ))}
          </div>

          <div className="mb-3 grid gap-2 sm:grid-cols-2" role="tablist" aria-label={t("extensions.project.kind")}>
            {KIND_ORDER.map((kind) => (
              <button
                key={kind}
                type="button"
                role="tab"
                aria-selected={activeKind === kind}
                className={`rounded-lg border px-3 py-2 text-left text-sm transition ${activeKind === kind ? "border-primary bg-primary/10 text-text-primary" : "border-border/60 text-text-secondary hover:bg-surface-container-low"}`}
                onClick={() => setActiveKind(kind)}
              >
                {kind === "mcp" ? t("extensions.project.mcp") : t("extensions.project.skills")}
              </button>
            ))}
          </div>

          <div className="mb-3 flex flex-wrap items-center gap-2 rounded-lg border border-border/60 bg-surface-container-low/50 px-3 py-2 text-xs">
            <span className="font-medium text-text-secondary">{t("extensions.project.capability")}</span>
            <span className={statusColor(capabilityStatus)}>{t(STATUS_LABEL_KEYS[capabilityStatus])}</span>
            <span className="mx-1 text-text-muted">·</span>
            <span className="font-medium text-text-secondary">{t("extensions.project.application")}</span>
            <span className={statusColor(applicationStatus)}>{t(STATUS_LABEL_KEYS[applicationStatus as CapabilityStatus] ?? "extensions.status.error")}</span>
            {applicationStatus === "error" && <span className="text-text-muted">{t("extensions.project.applicationError")}</span>}
          </div>

          <div className="grid min-h-[22rem] gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(15rem,0.7fr)]">
            <section className="min-w-0 rounded-xl border border-border/70 bg-surface-container-low/35 p-3">
              <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
                <div>
                  <h3 className="text-sm font-semibold text-text-primary">{t("extensions.project.policy")}</h3>
                  <p className="mt-1 text-xs text-text-muted">{t("extensions.project.policyDescription")}</p>
                </div>
                <Input
                  value={searchValue}
                  onChange={(event) => setSearchValue(event.target.value)}
                  placeholder={t("extensions.project.search")}
                  aria-label={t("extensions.project.search")}
                  className="h-8 w-full text-xs sm:w-56"
                />
              </div>

              <div className="mb-3 grid gap-2 sm:grid-cols-2">
                {(["inherit", "custom"] as ExtensionPolicyMode[]).map((mode) => (
                  <button
                    key={mode}
                    type="button"
                    disabled={mode === "custom" && !canCustomize}
                    className={`rounded-lg border px-3 py-2 text-left text-xs transition disabled:cursor-not-allowed disabled:opacity-50 ${currentDraft?.mode === mode ? "border-primary bg-primary/10 text-text-primary" : "border-border/60 text-text-secondary hover:bg-surface-container-low"}`}
                    onClick={() => updateDraft({
                      mode,
                      ...(mode === "custom" && currentDraft?.mode !== "custom"
                        ? { selectedIds: [...effectiveIds] }
                        : {}),
                    })}
                  >
                    <span className="block font-medium">{mode === "inherit" ? t("extensions.project.inherit") : t("extensions.project.custom")}</span>
                    <span className="mt-1 block text-[11px] text-text-muted">{mode === "inherit" ? t("extensions.project.inheritDescription") : t("extensions.project.customDescription")}</span>
                  </button>
                ))}
              </div>

              {loading ? (
                <div className="py-10 text-center text-xs text-text-muted">{t("extensions.loading")}</div>
              ) : resources.length === 0 ? (
                <div className="rounded-lg border border-dashed border-border/70 px-3 py-10 text-center text-xs text-text-muted">
                  {activeKind === "mcp" ? t("extensions.project.noMcp") : t("extensions.project.noSkills")}
                </div>
              ) : (
                <div className="max-h-[23rem] space-y-2 overflow-y-auto pr-1">
                  {resources.map((resource) => {
                    const selected = forcedGlobalOnly || currentDraft?.mode === "inherit"
                      ? effectiveIds.includes(resource.id)
                      : currentDraft?.selectedIds.includes(resource.id) ?? false;
                    return (
                      <label key={resource.id} className={`flex min-w-0 gap-3 rounded-lg border px-3 py-2 ${editableSelection ? "cursor-pointer hover:bg-surface-container-low" : "cursor-default"} border-border/60`}>
                        <input
                          type="checkbox"
                          checked={selected}
                          disabled={!editableSelection}
                          onChange={() => toggleSelection(resource.id)}
                          className="mt-1 h-4 w-4 shrink-0 accent-primary"
                          aria-label={resource.name}
                        />
                        <span className="min-w-0">
                          <span className="block truncate text-sm font-medium text-text-primary">{resource.name}</span>
                          <span className="mt-0.5 block truncate text-[11px] text-text-muted">{resource.detail}</span>
                          <span className="mt-0.5 block truncate text-[11px] text-text-muted">{resource.source}</span>
                        </span>
                      </label>
                    );
                  })}
                </div>
              )}
            </section>

            <aside className="rounded-xl border border-border/70 bg-surface-container-low/35 p-3">
              <h3 className="text-sm font-semibold text-text-primary">{t("extensions.project.preview")}</h3>
              <div className="mt-3 space-y-2 text-xs">
                <div className="flex items-center justify-between gap-3"><span className="text-text-muted">{t("extensions.project.globalState")}</span><span className="font-medium text-text-primary">{globalIds.length}</span></div>
                <div className="flex items-center justify-between gap-3"><span className="text-text-muted">{t("extensions.project.effective")}</span><span className="font-medium text-text-primary">{effectiveIds.length}</span></div>
                <div className="flex items-center justify-between gap-3"><span className="text-text-muted">{t("extensions.project.applied")}</span><span className="font-medium text-text-primary">{currentPolicy?.appliedIds.length ?? 0}</span></div>
              </div>
              <div className="mt-4 rounded-lg border border-border/60 bg-surface-container-low px-3 py-2 text-xs leading-relaxed text-text-muted">
                {currentDraft?.mode === "custom" ? t("extensions.project.customPreview") : t("extensions.project.inheritPreview", { source: response?.scopeKind === "worktree" && parentPolicy?.mode === "custom" ? t("extensions.project.projectSource") : t("extensions.project.globalSource") })}
              </div>
              {invalidIds.length > 0 && (
                <div role="alert" className="mt-3 rounded-lg border border-danger/35 bg-danger/10 px-3 py-2 text-xs leading-relaxed text-danger">
                  {t("extensions.project.invalidSelection", { count: invalidIds.length })}
                </div>
              )}
              {capabilityStatus === "globalOnly" && (
                <div className="mt-3 rounded-lg border border-warning/35 bg-warning/10 px-3 py-2 text-xs leading-relaxed text-warning">
                  {t("extensions.project.globalOnlyDescription")}
                </div>
              )}
              <div className="mt-4 flex items-start gap-2 text-[11px] leading-relaxed text-text-muted">
                <Check size={14} className="mt-0.5 shrink-0 text-success" />
                <span>{t("extensions.project.startupOnly")}</span>
              </div>
            </aside>
          </div>
        </div>

        <DialogFooter className="shrink-0 border-t border-border/60 bg-surface-container-low/35 px-5 py-3">
          <Button variant="outline" disabled={saving} onClick={close}>{t("extensions.project.cancel")}</Button>
          <Button disabled={saving || loading || !response || forcedGlobalOnly} onClick={() => void save()}>
            {saving ? t("common.saving") : t("extensions.project.save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
