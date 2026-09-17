import { useEffect, useRef, useState } from "react";
import { ArrowLeft, ChevronDown, ChevronRight, File, Folder, RefreshCw, Search, X } from "lucide-react";
import type { Device, ProjectContext } from "./domain";
import type { TranslationKey } from "./i18n";
import { parseFileEntries, parseFilePreview, readProjectFiles, type FileEntry, type FileReadKind } from "./projectFiles";
import "./projectFiles.css";

type Props = { device?: Device; context?: ProjectContext; t: (key: TranslationKey) => string; onClose?: () => void };

export function ProjectFilesPanel({ device, context, t, onClose }: Props) {
  const unavailable = !device || device.status !== "online" ? "filesOffline"
    : !context?.projectId ? "projectContextRequired"
      : !device.capabilities.includes("file.management") ? "capabilityUnavailable" : null;
  return <section className="project-files" aria-label={t("projectFiles")}>
    <header className="project-files-heading">
      <div><strong>{t("projectFiles")}</strong><small>{t("filesReadOnly")}</small></div>
      {onClose && <button className="icon-button" type="button" aria-label={t("close")} onClick={onClose}><X size={18} /></button>}
    </header>
    <div className="project-files-context" title={context?.cwd ?? undefined}>
      <strong>{context?.projectName ?? t("projectContextRequired")}</strong>
      {context?.branch && <span>{context.branch}</span>}
      <small>{context?.cwd}</small>
    </div>
    {unavailable ? <p role="status">{t(unavailable)}</p> :
      <FileBrowser key={`${device!.id}:${context!.key}:${context!.projectId}:${context!.worktreeId}:${context!.cwd}`}
        device={device!} context={context!} t={t} />}
  </section>;
}

function fileError(error: unknown): TranslationKey {
  const code = error instanceof Error ? error.message : "";
  if (/ssh_project_unsupported/.test(code)) return "filesSshUnsupported";
  if (/too_large|binary|unsupported|invalid_file_result/.test(code)) return "filesPreviewUnavailable";
  if (/project_not_found|worktree_missing|worktree_not_found/.test(code)) return "filesContextMissing";
  return "filesReadFailed";
}

function FileBrowser({ device, context, t }: Required<Pick<Props, "device" | "context" | "t">>) {
  const [directories, setDirectories] = useState<Record<string, FileEntry[]>>({});
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<FileEntry[] | null>(null);
  const [preview, setPreview] = useState<{ path: string; image: boolean; content: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<TranslationKey | null>(null);
  const request = useRef<AbortController | null>(null);

  const run = async (kind: FileReadKind, path: string) => {
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    setBusy(true);
    setError(null);
    try {
      const value = await readProjectFiles(device.id, context, kind, path, controller.signal);
      if (controller.signal.aborted) return;
      if (kind === "file.list") {
        const entries = parseFileEntries(value);
        setDirectories((old) => ({ ...old, [path]: entries }));
        setExpanded((old) => new Set([...old, path]));
      } else if (kind === "file.search") setResults(parseFileEntries(value));
      else setPreview({ path, image: kind === "file.read_image", content: parseFilePreview(value, kind === "file.read_image") });
    } catch (reason) {
      if (!controller.signal.aborted) setError(fileError(reason));
    } finally {
      if (!controller.signal.aborted) setBusy(false);
    }
  };

  useEffect(() => {
    void run("file.list", "");
    return () => { request.current?.abort(); };
    // Identity changes remount this component; do not restart reads on workspace snapshots.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const select = (entry: FileEntry) => {
    if (entry.kind === "directory") {
      if (expanded.has(entry.path)) setExpanded((old) => { const next = new Set(old); next.delete(entry.path); return next; });
      else if (directories[entry.path]) setExpanded((old) => new Set([...old, entry.path]));
      else void run("file.list", entry.path);
    } else {
      setPreview(null);
      void run(/\.(png|jpe?g|gif|webp|bmp|ico|svg)$/i.test(entry.path) ? "file.read_image" : "file.read_text", entry.path);
    }
  };
  const renderEntries = (entries: FileEntry[], ancestors = new Set<string>()): React.ReactNode => <ul className="project-files-tree">
    {entries.map((entry) => {
      const folder = entry.kind === "directory";
      const open = expanded.has(entry.path) && !ancestors.has(entry.path);
      return <li key={entry.path}>
        <button type="button" disabled={busy} title={entry.path} aria-expanded={folder ? open : undefined} onClick={() => select(entry)}>
          {folder ? open ? <ChevronDown size={14} /> : <ChevronRight size={14} /> : <span className="file-indent" />}
          {folder ? <Folder size={16} /> : <File size={16} />}<span>{entry.name}</span>
        </button>
        {folder && open && directories[entry.path] && (directories[entry.path].length
          ? renderEntries(directories[entry.path], new Set([...ancestors, entry.path])) : <small className="file-empty">{t("filesEmpty")}</small>)}
      </li>;
    })}
  </ul>;

  return <>
    <form className="project-files-search" onSubmit={(event) => {
      event.preventDefault();
      if (busy) return;
      setPreview(null); setResults(null);
      if (query.trim()) void run("file.search", query.trim());
    }}>
      <input disabled={busy} aria-label={t("filesSearch")} placeholder={t("filesSearch")} maxLength={512} value={query}
        onChange={(event) => { setQuery(event.target.value); if (!event.target.value) setResults(null); }} />
      <button className="icon-button" type="submit" disabled={busy || !query.trim()} aria-label={t("filesSearch")}><Search size={17} /></button>
      <button className="icon-button" type="button" aria-label={t("refresh")} onClick={() => {
        setQuery(""); setResults(null); setPreview(null); setDirectories({}); setExpanded(new Set()); void run("file.list", "");
      }}><RefreshCw size={17} /></button>
    </form>
    {busy && <p role="status">{t("filesLoading")}</p>}
    {error && <p role="alert">{t(error)}</p>}
    <div className="project-files-content" aria-busy={busy}>
      {preview ? <div className="project-files-preview">
        <button className="secondary-button" type="button" onClick={() => setPreview(null)}><ArrowLeft size={16} />{t("filesBack")}</button>
        <small className="file-preview-path">{preview.path}</small>
        {preview.image ? <img src={preview.content} alt={preview.path} /> : <pre tabIndex={0}>{preview.content}</pre>}
      </div> : (results ?? directories[""])?.length ? renderEntries(results ?? directories[""] ?? []) :
        !busy && !error && <p>{t("filesEmpty")}</p>}
    </div>
  </>;
}
