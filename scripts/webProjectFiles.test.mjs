import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import ts from "typescript";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
const moduleUrl = (source) => `data:text/javascript,${encodeURIComponent(ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText)}`;
const requestIdUrl = moduleUrl(read("../apps/web/src/requestId.ts"));
const clientUrl = moduleUrl(read("../apps/web/src/webClient.ts"));
const { readProjectFiles, parseFileEntries, parseFilePreview } = await import(moduleUrl(
  read("../apps/web/src/projectFiles.ts").replace('"./requestId"', JSON.stringify(requestIdUrl))
    .replace('"./webClient"', JSON.stringify(clientUrl)),
));
const { canDockFiles } = await import(moduleUrl(read("../apps/web/src/fileSidebarLayout.ts")));
const context = { key: "p:w", projectId: "p", worktreeId: "w", cwd: "C:/work" };

test("submit once, poll same operation, freeze project and Worktree identity", async () => {
  const selected = { ...context };
  const calls = [];
  const client = {
    async createOperation(input, signal) {
      calls.push(input); assert.ok(signal instanceof AbortSignal);
      selected.projectId = "other"; selected.worktreeId = "other";
      return { operation: { id: "one", status: "running" } };
    },
    async operation(id, signal) {
      calls.push(id); assert.ok(signal instanceof AbortSignal);
      return { operation: { id, status: "succeeded", result: [{ name: "a" }] } };
    },
  };
  assert.deepEqual(await readProjectFiles("device", selected, "file.list", "src", new AbortController().signal, client), [{ name: "a" }]);
  assert.equal(calls.length, 2);
  assert.equal(calls[1], "one");
  assert.deepEqual(calls[0].payload, { projectId: "p", worktreeId: "w", path: "src" });
  assert.equal(calls[0].deviceId, "device");
});

test("only allow read kinds and require a registered project", async () => {
  const client = { createOperation() { assert.fail("must not submit"); } };
  await assert.rejects(readProjectFiles("d", context, "file.write_text", "x", new AbortController().signal, client), /unsupported/);
  await assert.rejects(readProjectFiles("d", {}, "file.list", "", new AbortController().signal, client), /project_not_found/);
  const controller = new AbortController(); controller.abort();
  await assert.rejects(readProjectFiles("d", context, "file.list", "", controller.signal, client), { name: "AbortError" });
});

test("search payload uses query; terminal failures never resubmit", async () => {
  for (const status of ["failed", "rejected", "timed_out", "canceled"]) {
    let submits = 0;
    const client = { async createOperation(input) {
      submits++; assert.equal(input.payload.query, "readme"); assert.equal(input.payload.path, undefined);
      return { operation: { status, error: { code: "denied" } } };
    } };
    await assert.rejects(readProjectFiles("d", context, "file.search", "readme", new AbortController().signal, client), /denied/);
    assert.equal(submits, 1);
  }
});

test("abort or timeout cancels pending polling without another submission", async () => {
  for (const abort of [true, false]) {
    const controller = new AbortController();
    const client = {
      async createOperation() { return { operation: { id: "one", status: "running" } }; },
      operation() { assert.fail("must not poll after abort"); },
    };
    const timer = setTimeout(() => { if (abort) controller.abort(); }, 10);
    // Keep Node alive while the browser's timeout signal is pending.
    const keepAlive = setTimeout(() => {}, 1000);
    try {
      await assert.rejects(readProjectFiles("d", context, "file.list", "", controller.signal, client, 30),
        { name: abort ? "AbortError" : "TimeoutError" });
    } finally { clearTimeout(timer); clearTimeout(keepAlive); }
  }
});

test("file entries sort folders first and hide .git for directories AND Worktree files", () => {
  assert.deepEqual(parseFileEntries([
    { name: "z", path: "z", kind: "file" }, { name: "src", path: "src", kind: "directory" },
    { name: ".git", path: ".git", kind: "file" }, { name: ".git", path: "nested/.git", kind: "directory" },
  ]).map((item) => item.name), ["src", "z"]);
  assert.throws(() => parseFileEntries({}), /invalid/);
  assert.throws(() => parseFileEntries([{ name: "x" }]), /invalid/);
});

test("preview preserves literal text and rejects non-image or malformed payloads", () => {
  assert.equal(parseFilePreview({ content: "<script>unsafe</script>" }, false), "<script>unsafe</script>");
  assert.equal(parseFilePreview({ mimeType: "image/png", dataBase64: "YQ==" }, true), "data:image/png;base64,YQ==");
  assert.throws(() => parseFilePreview({ mimeType: "text/html", dataBase64: "YQ==" }, true), /invalid/);
  assert.throws(() => parseFilePreview({ mimeType: "image/png", dataBase64: "bad:url" }, true), /invalid/);
});

test("dock only in real spare desktop width; hysteresis avoids threshold flicker", () => {
  assert.equal(canDockFiles(1400, 1200, 800, false, false), true);
  assert.equal(canDockFiles(1400, 1200, 1000, false, false), false);
  assert.equal(canDockFiles(1400, 1200, 1300, false, false), false);
  assert.equal(canDockFiles(390, 390, 30, false, false), false);
  assert.equal(canDockFiles(1400, 1200, 800, true, false), false);
  assert.equal(canDockFiles(1400, 1200, 800, false, false, true), false);
  assert.equal(canDockFiles(800, 800, 400, false, false), true);
  assert.equal(canDockFiles(767, 767, 300, false, false), false);
  assert.equal(canDockFiles(1400, 1200, 0, false, false), false);
  assert.equal(canDockFiles(1400, 1200, 870, false, false), false);
  assert.equal(canDockFiles(1400, 1200, 870, false, true), true);
});

test("Web entry replaces legacy modal and does not change terminal sizing", () => {
  const views = read("../apps/web/src/views.tsx");
  assert.ok(!views.includes("ManagementPanel"));
  assert.match(views, /ProjectFilesPanel/);
  assert.match(views, /setFilesOpen\(!fileLayout\.space/);
  assert.match(views, /setFilesOpen\(false\); setFileContext\(undefined\); \}, \[selectedDevice\?\.id\]\)/);
  assert.match(views, /onSubmitManagement/); // context menus still use the transport
  const css = read("../apps/web/src/projectFiles.css");
  assert.match(css, /project-files-dock \{ position: absolute/);
  assert.ok(!css.includes(".web-terminal-stack {"));
  const panel = read("../apps/web/src/ProjectFilesPanel.tsx");
  assert.match(panel, /request.current\?\.abort/);
  assert.ok(!panel.includes("dangerouslySetInnerHTML"));
  assert.match(panel, /entries\.slice\(0, visibleCount\[path\] \?\? 200\)/);
  const layout = read("../apps/web/src/useFileSidebarLayout.ts");
  assert.match(layout, /\.xterm-screen/);
  assert.doesNotMatch(layout, /scrollHeight > viewport\.clientHeight/);
  assert.match(layout, /viewport\.scrollWidth > viewport\.clientWidth/);
});
