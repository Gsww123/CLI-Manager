import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";
import { build } from "esbuild";

const dir = mkdtempSync(join(tmpdir(), "cli-manager-deepseek-"));
process.on("exit", () => rmSync(dir, { recursive: true, force: true }));

/** Bundle the real command and endpoint modules, without starting a Tauri application. */
async function load(path, name) {
  const out = join(dir, name + ".mjs");
  await build({ entryPoints: [fileURLToPath(new URL(path, import.meta.url))],
    bundle: true, platform: "node", format: "esm", outfile: out });
  return import(pathToFileURL(out).href);
}
const dsh = await load("../src/shared/lib/deepseekHarness.ts", "commands");
const runtime = await load("../src/features/terminal/api/deepseekWebRuntime.ts", "runtime");
const startup = await load("../src/features/projects/api/projectStartupCommand.ts", "startup");
const icons = await load("../src/shared/lib/cliTools.ts", "icons");
const encoder = new TextEncoder();

test("official launcher is distinct from a DeepSeek provider or unrelated executable", () => {
  for (const tool of ["dsh", "dsh.cmd", "dsh web", "deepseek-harness"]) assert.equal(dsh.isDeepSeekHarnessTool(tool), true);
  for (const tool of ["deepseek", "codex", "echo dsh", "my-dsh", "dsh headless"]) assert.equal(dsh.isDeepSeekHarnessTool(tool), false);
  assert.equal(icons.resolveCliToolIconKey("dsh"), "deepseek-harness");
  assert.equal(icons.resolveCliToolIconKey("dsh.cmd"), "deepseek-harness");
  assert.equal(icons.resolveCliToolHistorySourceId("dsh"), null);
  assert.equal(icons.resolveCliToolImagePasteMode("dsh"), "unsupported");
});

test("new Web launches get independent free ports; user options and inspection commands win", () => {
  assert.equal(dsh.buildDeepSeekWebCommand("dsh", "", "", "pwsh"), "dsh --profile web --port 0");
  assert.equal(dsh.buildDeepSeekWebCommand("dsh web", "web --no-open", "", "cmd"),
    "dsh --profile web --no-open --port 0");
  assert.equal(dsh.buildDeepSeekWebCommand("dsh", "--port=4100 --no-open", ""),
    "dsh --profile web --port=4100 --no-open");
  assert.equal(dsh.buildDeepSeekWebCommand("dsh", "--profile web --port 4100", ""),
    "dsh --profile web --port 4100");
  assert.equal(dsh.buildDeepSeekWebCommand("dsh", "--help", ""), "dsh --profile web --help");
  assert.equal(dsh.buildDeepSeekWebCommand("dsh", "--dump-config", ""), "dsh --profile web --dump-config");
  assert.throws(() => dsh.buildDeepSeekWebCommand("dsh", "--profile headless", ""), /web_profile/);
});

test("source selection preserves credentials and rejects malformed environment editor data", () => {
  const original = { HTTP_PROXY: "http://proxy:80", DEEPSEEK_API_KEY: "fixture-only" };
  const selected = dsh.setDeepSeekSourceRoot(JSON.stringify(original), "C:/source tree");
  assert.deepEqual(JSON.parse(selected), { ...original, CLI_MANAGER_DSH_SOURCE_ROOT: "C:/source tree" });
  assert.equal(dsh.getDeepSeekSourceRoot(selected), "C:/source tree");
  assert.deepEqual(JSON.parse(dsh.setDeepSeekSourceRoot(selected, "")), original);
  for (const invalid of ["not JSON", "[]", "null", "1"]) assert.throws(() => dsh.setDeepSeekSourceRoot(invalid, "x"));
});

test("source argv retains the project's cwd and quotes native shells without shell injection", () => {
  assert.equal(dsh.buildDeepSeekWebCommand("dsh", "--no-open", "C:/source tree", "pwsh"),
    "node 'C:/source tree/apps/cli/lib/bin.js' --profile web --no-open --port 0");
  assert.equal(dsh.quoteDeepSeekPath("C:/O'Neil", "pwsh"), "'C:/O''Neil'");
  assert.equal(dsh.quoteDeepSeekPath("C:/source tree", "cmd"), '"C:/source tree"');
  assert.equal(dsh.quoteDeepSeekPath("C:/O'Neil", "C:/Program Files/PowerShell/7/pwsh.exe"), "'C:/O''Neil'");
  assert.equal(dsh.quoteDeepSeekPath("C:/source tree", "C:/Windows/System32/cmd.exe"), '"C:/source tree"');
  assert.throws(() => dsh.quoteDeepSeekPath("C:/a&echo injected", "C:/Windows/System32/cmd.exe"));
  assert.throws(() => dsh.quoteDeepSeekPath("C:/source", "custom-shell"), /shell_unsupported/);
  assert.throws(() => dsh.buildDeepSeekWebCommand("dsh", "", "C:/source", "C:/Windows/System32/wsl.exe"), /native_only/);
  assert.equal(dsh.quoteDeepSeekPath("/tmp/O'Neil", "bash"), "'/tmp/O'\"'\"'Neil'");
  for (const path of ["relative", "C:/bad\nroot"]) {
    assert.throws(() => dsh.buildDeepSeekWebCommand("dsh", "", path, "cmd"));
  }
  assert.throws(() => dsh.buildDeepSeekWebCommand("dsh", "", "C:/%USERPROFILE%", "cmd"));
  for (const env of ["wsl", "ssh"]) {
    assert.throws(() => dsh.buildDeepSeekWebCommand("dsh", "", "C:/source", "pwsh", env), /native_only/);
  }
});

test("project startup uses DSH defaults but keeps explicit scripts and other CLIs unchanged", () => {
  const project = { cli_tool: "dsh", cli_args: "--no-open", startup_cmd: "", env_vars: "{}",
    shell: "pwsh", provider_overrides: "{}" };
  assert.equal(startup.resolveProjectStartupCommand(project), "dsh --profile web --no-open --port 0");
  assert.equal(startup.resolveProjectStartupCommand({ ...project, startup_cmd: "custom --port 9000" }), "custom --port 9000");
  assert.equal(startup.resolveProjectStartupCommand({ ...project, cli_tool: "claude", cli_args: "--verbose" }), "claude --verbose");
  const sourceProject = { ...project, env_vars: JSON.stringify({ CLI_MANAGER_DSH_SOURCE_ROOT: "C:/source tree" }) };
  assert.match(startup.resolveProjectStartupCommand(sourceProject), /^node 'C:\/source tree\/apps\/cli\/lib\/bin.js'/);
});

test("readiness survives every chunk boundary, ANSI and Unicode; other URLs are ignored", () => {
  const line = encoder.encode("日志\n\x1b[32mdsh web: http://127.0.0.1:45123/?hostToken=fixture\x1b[0m\r\n");
  for (let split = 0; split <= line.length; split++) {
    const reader = new dsh.DeepSeekReadinessReader();
    const first = reader.push(line.slice(0, split));
    const second = reader.push(line.slice(split));
    assert.equal(second ?? first, "http://127.0.0.1:45123/?hostToken=fixture");
  }
  const reader = new dsh.DeepSeekReadinessReader();
  assert.equal(reader.push(encoder.encode("opening http://127.0.0.1:9999/\n")), null);
  assert.equal(reader.push(encoder.encode("dsh web: http://example.com:9000/\n")), null);
  for (const url of ["javascript:alert(1)", "http://127.0.0.1:0", "http://user:pass@127.0.0.1:80",
    "http://127.0.0.1:9000.evil.test", "https://localhost:9000", "http://localhost"]) {
    assert.equal(dsh.validateDeepSeekWebUrl(url), null);
  }
  assert.equal(dsh.validateDeepSeekWebUrl("http://[::1]:4100"), "http://[::1]:4100/");
  assert.equal(dsh.validateDeepSeekWebUrl("http://localhost:80"), "http://localhost/");
});

test("endpoints belong to exact Tabs, clear on stop/reset/close and ignore untracked sessions", () => {
  let notifications = 0;
  const unsubscribe = runtime.subscribeDeepSeekWebSession("a", () => notifications++);
  runtime.trackDeepSeekWebSession("b");
  runtime.observeDeepSeekWebOutput("unknown", encoder.encode("dsh web: http://localhost:4999\n"));
  assert.equal(runtime.getDeepSeekWebUrl("unknown"), null);
  runtime.observeDeepSeekWebOutput("a", encoder.encode("dsh web: http://127.0.0.1:4001\n"));
  runtime.observeDeepSeekWebOutput("b", encoder.encode("dsh web: http://127.0.0.1:4002\n"));
  assert.equal(runtime.getDeepSeekWebUrl("a"), "http://127.0.0.1:4001/");
  assert.equal(runtime.getDeepSeekWebUrl("b"), "http://127.0.0.1:4002/");
  assert.equal(notifications, 1);
  runtime.observeDeepSeekWebOutput("a", new Uint8Array(), true);
  assert.equal(runtime.getDeepSeekWebUrl("a"), null);
  runtime.observeDeepSeekWebOutput("a", encoder.encode("dsh web: http://127.0.0.1:4003\n"));
  runtime.clearDeepSeekWebEndpoint("a");
  assert.equal(runtime.getDeepSeekWebUrl("a"), null);
  runtime.forgetDeepSeekWebSession("b");
  assert.equal(runtime.getDeepSeekWebUrl("b"), null);
  unsubscribe();
  runtime.forgetDeepSeekWebSession();
});

test("Web service exit markers are shell-aware, single-line and idempotent", () => {
  const command = "dsh --profile web --port 0 --no-open";
  for (const shell of ["pwsh", "powershell.exe", "C:/Windows/System32/cmd.exe", "bash", "wsl", "fish"]) {
    const wrapped = dsh.withDeepSeekStopMarker(command, shell);
    assert.equal(/[\r\n]/.test(wrapped), false);
    assert.equal(wrapped.includes(dsh.DEEPSEEK_STOP_MARKER), true);
    assert.equal(dsh.withDeepSeekStopMarker(wrapped, shell), wrapped);
    assert.equal(dsh.isDeepSeekWebCommand(wrapped), true);
  }
  assert.equal(dsh.withDeepSeekStopMarker("npm run dev", "pwsh"), "npm run dev");
  assert.equal(dsh.isDeepSeekWebCommand("echo dsh --profile web"), false);
  assert.equal(dsh.isDeepSeekWebCommand("echo apps/cli/lib/bin.js --profile web"), false);
});
