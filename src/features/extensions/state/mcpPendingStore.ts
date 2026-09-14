import { create } from "zustand";
import type { ExtensionCli } from "../../../shared/types/extensions";
import type { McpRevisions } from "../lib/mcpPending";

interface McpPendingState {
  revisions: McpRevisions;
  applied: Record<string, Partial<McpRevisions>>;
  operation: "edit" | "save" | null;
  epoch: number;
}

// Session UI state survives settings-page unmounts. Canonical resources remain in SQLite.
export const useMcpPendingStore = create<McpPendingState>(() => ({
  revisions: { claude: 0, codex: 0, grok: 0 }, applied: {}, operation: null, epoch: 0,
}));

/** Reserve the entire async operation before IPC so navigation cannot race an edit. */
export function beginMcpOperation(operation: "edit" | "save") {
  if (useMcpPendingStore.getState().operation) throw new Error("extensions_mcp_operation_busy");
  useMcpPendingStore.setState(state => ({ operation, epoch: state.epoch + 1 }));
}

export function finishMcpOperation() { useMcpPendingStore.setState({ operation: null }); }

export function acknowledgeMcpSave(home: string, cli: ExtensionCli, revision: number) {
  useMcpPendingStore.setState(state => ({ applied: {
    ...state.applied, [home]: { ...state.applied[home], [cli]: revision },
  } }));
}

/** Track desired changes centrally, including imports that bypass the resource list. */
export async function trackMcpMutation<T>(
  clis: ExtensionCli[], operation: () => Promise<T>, changed: (result: T) => boolean = () => true,
): Promise<T> {
  beginMcpOperation("edit");
  try {
    const result = await operation();
    if (changed(result)) useMcpPendingStore.setState(state => {
      const revisions = { ...state.revisions };
      for (const cli of clis) revisions[cli]++;
      return { revisions };
    });
    return result;
  } finally { finishMcpOperation(); }
}
