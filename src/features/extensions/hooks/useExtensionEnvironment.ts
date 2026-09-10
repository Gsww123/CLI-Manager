import { useCallback, useEffect, useRef, useState } from "react";
import {
  getActiveExtensionHome,
  getExtensionHome,
  listExtensionWslDistros,
  resetExtensionHome,
  selectExtensionHome,
  type ExtensionEnvironmentKind,
  type ExtensionHomeInput,
  type ExtensionHomeState,
} from "../api/globalManagement";

interface ExtensionEnvironmentState {
  environmentKind: ExtensionEnvironmentKind;
  environmentId: string;
  mode: "auto" | "manual";
  homePath: string;
  home: ExtensionHomeState | null;
  wslDistros: string[];
  loading: boolean;
  saving: boolean;
  errorCode: string | null;
  setEnvironmentKind: (kind: ExtensionEnvironmentKind) => void;
  setEnvironmentId: (id: string) => void;
  setMode: (mode: "auto" | "manual") => void;
  setHomePath: (path: string) => void;
  save: () => Promise<ExtensionHomeState>;
  reset: () => Promise<ExtensionHomeState>;
  refresh: () => Promise<ExtensionHomeState>;
}

function normalizeDistros(values: string[]): string[] {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean))).sort((left, right) =>
    left.localeCompare(right),
  );
}

function identityFor(kind: ExtensionEnvironmentKind, id: string): string {
  return `${kind}:${id.trim() || "host"}`;
}

/** 维护全局页共享的环境/Home状态，并以请求序号防止切换环境后旧响应回填。 */
export function useExtensionEnvironment(): ExtensionEnvironmentState {
  const [environmentKind, setEnvironmentKindState] = useState<ExtensionEnvironmentKind>("local");
  const [environmentId, setEnvironmentIdState] = useState("host");
  const [mode, setModeState] = useState<"auto" | "manual">("auto");
  const [homePath, setHomePathState] = useState("");
  const [home, setHome] = useState<ExtensionHomeState | null>(null);
  const [wslDistros, setWslDistros] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const requestIdRef = useRef(0);
  const initializedRef = useRef(false);

  const applyHome = useCallback((next: ExtensionHomeState) => {
    setHome(next);
    setEnvironmentKindState(next.identity.environmentKind);
    setEnvironmentIdState(next.identity.environmentId);
    setModeState(next.mode);
    setHomePathState(next.homePath);
    setErrorCode(null);
  }, []);

  const refresh = useCallback(async () => {
    const requestId = ++requestIdRef.current;
    setLoading(true);
    setErrorCode(null);
    try {
      const next = await getExtensionHome(environmentKind, environmentId.trim() || null);
      if (requestId === requestIdRef.current) applyHome(next);
      return next;
    } catch (error) {
      if (requestId === requestIdRef.current) {
        setHome(null);
        setErrorCode(String(error));
      }
      throw error;
    } finally {
      if (requestId === requestIdRef.current) setLoading(false);
    }
  }, [applyHome, environmentId, environmentKind]);

  useEffect(() => {
    if (initializedRef.current) return;
    initializedRef.current = true;
    const requestId = ++requestIdRef.current;
    void getActiveExtensionHome()
      .then((next) => {
        if (requestId === requestIdRef.current) applyHome(next);
      })
      .catch((error) => {
        if (requestId === requestIdRef.current) {
          setErrorCode(String(error));
          setHome(null);
        }
      })
      .finally(() => {
        if (requestId === requestIdRef.current) setLoading(false);
      });
  }, [applyHome]);

  const loadEnvironment = useCallback(async (
    kind: ExtensionEnvironmentKind,
    id: string,
  ) => {
    const requestId = ++requestIdRef.current;
    setHome(null);
    setLoading(true);
    setErrorCode(null);
    try {
      const next = await getExtensionHome(kind, id.trim() || null);
      if (requestId === requestIdRef.current) applyHome(next);
    } catch (error) {
      if (requestId === requestIdRef.current) setErrorCode(String(error));
    } finally {
      if (requestId === requestIdRef.current) setLoading(false);
    }
  }, [applyHome]);

  const setEnvironmentKind = useCallback((kind: ExtensionEnvironmentKind) => {
    setEnvironmentKindState(kind);
    setModeState("auto");
    setHomePathState("");
    if (kind === "local") {
      setEnvironmentIdState("host");
      setWslDistros([]);
      void loadEnvironment("local", "host");
      return;
    }
    setEnvironmentIdState("");
    setHome(null);
    setLoading(true);
    setErrorCode(null);
    const requestId = ++requestIdRef.current;
    void listExtensionWslDistros()
      .then((values) => {
        if (requestId !== requestIdRef.current) return;
        const distros = normalizeDistros(values);
        setWslDistros(distros);
        const nextId = distros[0] ?? "";
        setEnvironmentIdState(nextId);
        if (nextId) void loadEnvironment("wsl", nextId);
        else setLoading(false);
      })
      .catch((error) => {
        if (requestId !== requestIdRef.current) return;
        setWslDistros([]);
        setErrorCode(String(error));
        setLoading(false);
      });
  }, [loadEnvironment]);

  const setEnvironmentId = useCallback((id: string) => {
    setEnvironmentIdState(id);
    if (environmentKind === "wsl" && id.trim()) void loadEnvironment("wsl", id);
  }, [environmentKind, loadEnvironment]);

  const save = useCallback(async () => {
    const input: ExtensionHomeInput = {
      environmentKind,
      environmentId: environmentId.trim() || null,
      mode,
      homePath: mode === "manual" ? homePath.trim() : null,
    };
    setSaving(true);
    setErrorCode(null);
    try {
      const next = await selectExtensionHome(input);
      applyHome(next);
      return next;
    } catch (error) {
      setErrorCode(String(error));
      throw error;
    } finally {
      setSaving(false);
    }
  }, [applyHome, environmentId, environmentKind, homePath, mode]);

  const reset = useCallback(async () => {
    setSaving(true);
    setErrorCode(null);
    try {
      const next = await resetExtensionHome(environmentKind, environmentId.trim() || null);
      applyHome(next);
      return next;
    } catch (error) {
      setErrorCode(String(error));
      throw error;
    } finally {
      setSaving(false);
    }
  }, [applyHome, environmentId, environmentKind]);

  return {
    environmentKind,
    environmentId,
    mode,
    homePath,
    home,
    wslDistros,
    loading,
    saving,
    errorCode,
    setEnvironmentKind,
    setEnvironmentId,
    setMode: setModeState,
    setHomePath: setHomePathState,
    save,
    reset,
    refresh,
  };
}

export function extensionHomeIdentity(home: ExtensionHomeState | null): string | null {
  return home ? identityFor(home.identity.environmentKind, home.identity.environmentId) : null;
}
