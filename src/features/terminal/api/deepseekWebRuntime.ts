import { DeepSeekReadinessReader } from "../../../shared/lib/deepseekHarness";

interface Entry {
  reader: DeepSeekReadinessReader;
  url: string | null;
}
const entries = new Map<string, Entry>();
const listeners = new Map<string, Set<() => void>>();

/** Track a Web service's actual endpoint independently of xterm rendering and ACK ownership. */
export function trackDeepSeekWebSession(sessionId: string): void {
  if (!entries.has(sessionId)) entries.set(sessionId, { reader: new DeepSeekReadinessReader(sessionId), url: null });
}

/** Publish only changes for the owning Tab. */
function publish(sessionId: string, url: string | null): void {
  const entry = entries.get(sessionId);
  if (!entry || entry.url === url) return;
  entry.url = url;
  listeners.get(sessionId)?.forEach((notify) => notify());
}

/** Observe already-deduplicated PTY frames; never acknowledge or delay the output. */
export function observeDeepSeekWebOutput(sessionId: string, data: Uint8Array, reset = false): void {
  const entry = entries.get(sessionId);
  if (!entry) return;
  if (reset) {
    entry.reader.reset();
    publish(sessionId, null);
  }
  entry.reader.push(data, (url) => publish(sessionId, url));
}

/** Subscribe without transferring the terminal's single display-consumer ownership. */
export function subscribeDeepSeekWebSession(sessionId: string, notify: () => void): () => void {
  trackDeepSeekWebSession(sessionId);
  let set = listeners.get(sessionId);
  if (!set) listeners.set(sessionId, set = new Set());
  set.add(notify);
  return () => {
    set.delete(notify);
    if (set.size === 0) listeners.delete(sessionId);
  };
}

/** Return the immutable URL snapshot used by React's external-store subscription. */
export function getDeepSeekWebUrl(sessionId: string): string | null {
  return entries.get(sessionId)?.url ?? null;
}

/** A shell prompt or completed command invalidates its previously published listening address. */
export function clearDeepSeekWebEndpoint(sessionId: string): void {
  entries.get(sessionId)?.reader.reset();
  publish(sessionId, null);
}

/** Closed PTYs cannot keep a cached port or credential-bearing URL alive. */
export function forgetDeepSeekWebSession(sessionId?: string): void {
  if (sessionId) {
    publish(sessionId, null);
    entries.delete(sessionId);
  } else {
    for (const id of entries.keys()) publish(id, null);
    entries.clear();
  }
}
