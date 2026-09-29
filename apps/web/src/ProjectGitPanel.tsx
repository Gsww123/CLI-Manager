import { useEffect, useRef, useState } from "react";
import { ArrowLeft, RefreshCw, Search, X } from "lucide-react";
import type { Device, JsonObject, JsonValue, ProjectContext } from "./domain";
import type { TranslationKey } from "./i18n";
import { readProjectOperation } from "./projectFiles";
import { gitReadError, parseRepositories, parseGitStatus, parseGitPage, parseGitDetail, parseGitDiff,
  type GitChange, type GitCommit, type GitDetail } from "./projectGit";

type T = (key: TranslationKey) => string;
type Context = { device: Device; context: ProjectContext; t: T };
type Props = { device?: Device; context?: ProjectContext; t: T; onClose: () => void };
type Reader = (kind: string, parameters: JsonObject, signal: AbortSignal) => Promise<JsonValue>;

// 参数改变时取消旧请求；设备/项目改变由上层 key 重建组件，避免旧内容闪入新上下文。
function useGitRead<T>(read: Reader, kind: string, parameters: JsonObject, parse: (value: JsonValue) => T) {
  const [value, setValue] = useState<T | null>(null);
  const [error, setError] = useState<TranslationKey | null>(null);
  const [busy, setBusy] = useState(true);
  const [revision, setRevision] = useState(0);
  const identity = JSON.stringify(parameters);
  const [loadedIdentity, setLoadedIdentity] = useState<string | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    setBusy(true); setError(null);
    void read(kind, JSON.parse(identity), controller.signal).then((data) => {
      if (!controller.signal.aborted) {
        const parsed = parse(data);
        setValue(parsed); setLoadedIdentity(identity);
      }
    }).catch((reason) => { if (!controller.signal.aborted) setError(gitReadError(reason)); })
      .finally(() => { if (!controller.signal.aborted) setBusy(false); });
    return () => controller.abort();
  }, [read, kind, identity, parse, revision]);
  return { value: loadedIdentity === identity ? value : null, error, busy, refresh: () => setRevision((old) => old + 1) };
}

export function ProjectGitPanel({ device, context, t, onClose }: Props) {
  const unavailable = !device || device.status !== "online" ? "gitOffline"
    : !context?.projectId ? "projectContextRequired"
      : !device.capabilities.includes("git.management") ? "capabilityUnavailable" : null;
  return <section className="project-files project-git" aria-label={t("gitChanges")}>
    <header className="project-files-heading">
      <div className="project-files-title"><strong>{context?.projectName ?? "Git"}</strong><small>{t("gitReadOnly")}</small></div>
      <button type="button" className="icon-button" onClick={onClose} aria-label={t("close")}><X size={16} /></button>
    </header>
    {unavailable ? <p role="status">{t(unavailable)}</p> : <GitBrowser device={device!} context={context!} t={t} />}
  </section>;
}

function GitBrowser({ device, context, t }: Context) {
  // 捕获身份，只在上层设备/项目 key 改变时替换，工作区快照不触发重读。
  const [read] = useState<Reader>(() => (kind: string, parameters: JsonObject, signal: AbortSignal) =>
    readProjectOperation(device.id, context, kind, parameters, signal));
  const repos = useGitRead(read, "git.repositories", {}, parseRepositories);
  const [selected, setSelected] = useState<string | null>(null);
  const repository = repos.value?.find((item) => item.relativePath === selected)?.relativePath ?? repos.value?.[0]?.relativePath;
  return <>
    <div className="git-repository-selector">
      <select aria-label={t("gitRepository")} value={repository ?? ""} disabled={!repos.value?.length}
        onChange={(event) => setSelected(event.target.value)}>
        {!repos.value?.length && <option value="">{t("gitRepository")}</option>}
        {repos.value?.map((item) => <option key={item.relativePath} value={item.relativePath}>
          {item.relativePath || context.projectName}{item.branch ? ` · ${item.branch}` : ""}
        </option>)}
      </select>
      <button type="button" className="icon-button" title={t("refresh")} aria-label={t("refresh")} disabled={repos.busy}
        onClick={repos.refresh}><RefreshCw size={15} /></button>
    </div>
    <ReadFeedback {...repos} t={t} />
    {repos.value?.length === 0 && <p>{t("gitNotRepository")}</p>}
    {repository !== undefined && <RepositoryView key={repository} read={read} repository={repository} t={t} />}
  </>;
}

function ReadFeedback({ busy, error, t }: { busy: boolean; error: TranslationKey | null; t: T }) {
  return <>{busy && <p role="status">{t("filesLoading")}</p>}{error && <p role="alert">{t(error)}</p>}</>;
}

function RepositoryView({ read, repository, t }: { read: Reader; repository: string; t: T }) {
  const [tab, setTab] = useState<"changes" | "history">("changes");
  return <>
    <nav className="project-inspector-tabs" aria-label={t("gitReadOnly")}>
      <button type="button" aria-pressed={tab === "changes"} onClick={() => setTab("changes")}>{t("gitChanges")}</button>
      <button type="button" aria-pressed={tab === "history"} onClick={() => setTab("history")}>{t("gitHistory")}</button>
    </nav>
    {tab === "changes" ? <Changes read={read} repository={repository} t={t} /> : <History read={read} repository={repository} t={t} />}
  </>;
}

type RepoProps = { read: Reader; repository: string; t: T };
function Changes({ read, repository, t }: RepoProps) {
  const result = useGitRead(read, "git.status", { repository }, parseGitStatus);
  const [selected, setSelected] = useState<GitChange | null>(null);
  const [limit, setLimit] = useState(200);
  const refresh = useRef(result.refresh);
  refresh.current = result.refresh;
  // 只有当前可见变更页低频刷新；隐藏浏览器页签不产生 Git 查询。
  useEffect(() => {
    if (result.busy || selected) return;
    const timer = setInterval(() => { if (!document.hidden) refresh.current(); }, 15_000);
    return () => clearInterval(timer);
  }, [result.busy, selected]);
  if (selected) return <Diff read={read} repository={repository} t={t} file={selected} onBack={() => setSelected(null)} />;
  const groups = [
    { label: "gitStaged" as const, files: result.value?.changes.filter((item) => item.staged) ?? [] },
    { label: "gitUnstaged" as const, files: result.value?.changes.filter((item) => !item.staged && !["U", "??"].includes(item.status)) ?? [] },
    { label: "gitUntracked" as const, files: result.value?.changes.filter((item) => !item.staged && ["U", "??"].includes(item.status)) ?? [] },
  ];
  return <div className="project-files-content">
    <div className="git-summary"><span>{result.value?.branch.branch ?? (result.value?.branch.detached ? "HEAD" : "—")}</span>
      <button type="button" className="icon-button" aria-label={t("refresh")} disabled={result.busy} onClick={result.refresh}><RefreshCw size={15} /></button>
    </div>
    <ReadFeedback busy={result.busy && !result.value} error={result.error} t={t} />
    {result.value && !result.value.changes.length && <p>{t("gitClean")}</p>}
    {groups.map(({ label, files }) => files.length > 0 && <section key={label} className="git-file-group">
      <h3>{t(label)} <small>{files.length}</small></h3>
      <ul className="git-file-list">{files.slice(0, limit).map((file) => <li key={file.path}>
        <FileButton file={file} onClick={() => setSelected(file)} />
      </li>)}</ul>
      {files.length > limit && <button type="button" className="secondary-button" onClick={() => setLimit((old) => old + 200)}>{t("filesShowMore")}</button>}
    </section>)}
  </div>;
}

function FileButton({ file, onClick }: { file: GitChange; onClick: () => void }) {
  return <button type="button" onClick={onClick} title={file.path}>
    <span className="git-file-status">{file.status}</span><span className="git-file-path">{file.path}</span>
    <small>+{file.added} −{file.deleted}</small>
  </button>;
}

function History({ read, repository, t }: RepoProps) {
  const [input, setInput] = useState("");
  const [search, setSearch] = useState("");
  return <div className="git-history">
    <form className="project-files-search" onSubmit={(event) => { event.preventDefault(); setSearch(input.trim()); }}>
      <input value={input} onChange={(event) => setInput(event.target.value)} maxLength={256}
        aria-label={t("gitSearch")} placeholder={t("gitSearch")} />
      <button type="submit" className="icon-button" aria-label={t("gitSearch")}><Search size={16} /></button>
    </form>
    <CommitList key={search} read={read} repository={repository} t={t} search={search} />
  </div>;
}

function CommitList({ read, repository, t, search }: RepoProps & { search: string }) {
  const [cursor, setCursor] = useState<string | null>(null);
  const [previous, setPrevious] = useState<Array<string | null>>([]);
  const [selected, setSelected] = useState<GitCommit | null>(null);
  const result = useGitRead(read, "git.history", { repository, search, cursor }, parseGitPage);
  if (selected) return <CommitDetail read={read} repository={repository} t={t} commit={selected} onBack={() => setSelected(null)} />;
  return <div className="project-files-content">
    <div className="git-summary"><small>{t("gitLocalHistory")}</small>
      <button type="button" className="icon-button" aria-label={t("refresh")} disabled={result.busy}
        onClick={() => { setPrevious([]); setCursor(null); result.refresh(); }}><RefreshCw size={15} /></button>
    </div>
    <ReadFeedback busy={result.busy} error={result.error} t={t} />
    {!result.busy && result.value && <>
      {!result.value.commits.length && <p>{t("gitNoCommits")}</p>}
      <ul className="git-commit-list">{result.value.commits.map((commit) => <li key={commit.id}>
        <button type="button" onClick={() => setSelected(commit)}>
          <strong>{commit.title}</strong><small>{commit.shortId} · {commit.authorName}</small>
          <time>{new Date(commit.authoredAt * 1000).toLocaleString(undefined, { hour12: false })}</time>
        </button>
      </li>)}</ul>
      <div className="git-pagination">
        <button type="button" className="secondary-button" disabled={!previous.length} onClick={() => {
          setCursor(previous[previous.length - 1]); setPrevious((old) => old.slice(0, -1));
        }}>{t("gitPreviousPage")}</button>
        <span>{previous.length + 1}</span>
        <button type="button" className="secondary-button" disabled={!result.value.nextCursor} onClick={() => {
          setPrevious((old) => [...old, cursor]); setCursor(result.value!.nextCursor);
        }}>{t("gitNextPage")}</button>
      </div>
    </>}
  </div>;
}

function CommitDetail({ read, repository, t, commit, onBack }: RepoProps & { commit: GitCommit; onBack: () => void }) {
  const result = useGitRead(read, "git.commit_detail", { repository, commitId: commit.id }, parseGitDetail);
  const [file, setFile] = useState<GitDetail["files"][number] | null>(null);
  const [limit, setLimit] = useState(200);
  if (file) return <Diff read={read} repository={repository} t={t} file={file} commitId={commit.id} onBack={() => setFile(null)} />;
  return <div className="project-files-content">
    <Back t={t} onClick={onBack} /><h3 className="git-commit-title">{commit.title}</h3>
    <small className="git-commit-id">{commit.id}</small>
    <ReadFeedback {...result} t={t} />
    <ul className="git-file-list">{result.value?.files.slice(0, limit).map((entry) => <li key={entry.path}>
      <FileButton file={entry} onClick={() => setFile(entry)} />
    </li>)}</ul>
    {result.value && result.value.files.length > limit && <button type="button" className="secondary-button"
      onClick={() => setLimit((old) => old + 200)}>{t("filesShowMore")}</button>}
    {result.error && <button type="button" className="secondary-button" onClick={result.refresh}>{t("refresh")}</button>}
  </div>;
}

function Back({ t, onClick }: { t: T; onClick: () => void }) {
  return <button type="button" className="secondary-button" onClick={onClick}><ArrowLeft size={15} />{t("gitBack")}</button>;
}

function Diff({ read, repository, t, file, commitId, onBack }: RepoProps & {
  file: GitChange & { oldPath?: string | null; binary?: boolean }; commitId?: string; onBack: () => void;
}) {
  return <div className="project-files-content">
    <Back t={t} onClick={onBack} /><small className="file-preview-path">{file.path}</small>
    {file.oldPath && file.oldPath !== file.path && <small className="file-preview-path">{file.oldPath} → {file.path}</small>}
    {file.binary ? <p>{t("gitDiffUnavailable")}</p> : <DiffText read={read} t={t}
      kind={commitId ? "git.commit_diff" : "git.diff"}
      parameters={{ repository, path: file.path, status: file.status, ...(commitId ? { commitId, oldPath: file.oldPath ?? null } : {}) }} />}
  </div>;
}

// Web 只呈现后端返回的完整快照文本，无解析/写操作，不加载依赖桌面 Store 的编辑器。
function DiffText({ read, t, kind, parameters }: { read: Reader; t: T; kind: string; parameters: JsonObject }) {
  const result = useGitRead(read, kind, parameters, parseGitDiff);
  return <><ReadFeedback {...result} t={t} />
    {result.error && <button type="button" className="secondary-button" onClick={result.refresh}>{t("refresh")}</button>}
    {result.value !== null && <pre className="git-diff-text" tabIndex={0}>{result.value || t("gitNoDiff")}</pre>}
  </>;
}
