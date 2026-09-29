import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import ts from "typescript";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
const moduleUrl = (source) => `data:text/javascript,${encodeURIComponent(ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText)}`;
const source = read("../src/features/terminal/lib/webGitRead.ts");
const factory = moduleUrl(source
  .replace('import { invoke } from "@tauri-apps/api/core";', 'const invoke = (...args) => globalThis.webGitTest.invoke(...args);')
  .replace('import { webDeviceApi } from "../../../shared/lib/webDevice";', 'const webDeviceApi = { validateContext: (...args) => globalThis.webGitTest.validate(...args) };'));
const { executeWebGitRead, validateWebGitRead } = await import(factory);
const git = await import(moduleUrl(read("../apps/web/src/projectGit.ts")));
const oid = "a".repeat(40);

test("read validation rejects path traversal, invalid OIDs, search injection and writes", () => {
  for (const repository of ["../x", "/x", "C:/x", "a\\b", "a//b", "a/./b", "a:stream", "a\0b"]) {
    assert.throws(() => validateWebGitRead("git.history", { repository }), { code: "invalid_operation_payload" });
  }
  for (const commitId of ["HEAD", "-x", "abc", "z".repeat(40), null]) {
    assert.throws(() => validateWebGitRead("git.commit_detail", { commitId }), { code: "invalid_operation_payload" });
  }
  assert.throws(() => validateWebGitRead("git.history", { cursor: "HEAD" }));
  assert.throws(() => validateWebGitRead("git.history", { search: "x\ny" }));
  assert.throws(() => validateWebGitRead("git.commit_diff", { commitId: oid, path: "new", oldPath: "../old" }));
  assert.throws(() => validateWebGitRead("git.diff", { path: "x", status: "M", contextLines: 9 }));
  assert.throws(() => validateWebGitRead("git.push", {}));
  validateWebGitRead("git.history", { repository: "", search: "作者", cursor: oid });
  validateWebGitRead("git.commit_diff", { commitId: oid, path: "src/新文件.ts", oldPath: "src/旧文件.ts" });
});

test("nested repositories use host-discovered paths, canonical validation, and redacted DTOs", async () => {
  const calls = [], validations = [];
  globalThis.webGitTest = {
    async invoke(command, args) {
      calls.push({ command, args });
      if (command === "git_list_repositories") return [
        { relativePath: "", absolutePath: "C:/registered", branch: "master" },
        { relativePath: "nested", absolutePath: "C:/registered/nested", branch: "feature" },
      ];
      return { commits: [], nextCursor: null };
    },
    async validate(root, cwd) { validations.push([root, cwd]); },
  };
  assert.deepEqual(await executeWebGitRead("git.repositories", {}, "C:/registered"), [
    { relativePath: "", branch: "master" }, { relativePath: "nested", branch: "feature" },
  ]);
  await executeWebGitRead("git.history", { repository: "nested", cursor: oid, search: "author" }, "C:/registered");
  assert.deepEqual(validations, [["C:/registered", "C:/registered/nested"]]);
  assert.deepEqual(calls.at(-1), { command: "git_list_commits", args: {
    projectPath: "C:/registered/nested", cursor: oid, search: "author", reference: null, filters: null,
  } });
  assert.equal(calls.filter((item) => item.command === "git_list_repositories").length, 1);
  await assert.rejects(executeWebGitRead("git.history", { repository: "invented" }, "C:/registered"), { code: "git_repository_missing" });
  globalThis.webGitTest.validate = async () => { throw "canonical path escapes root C:/secret"; };
  const before = calls.length;
  await assert.rejects(executeWebGitRead("git.history", { repository: "nested" }, "C:/registered"), { code: "git_read_failed", message: "git_read_failed" });
  assert.equal(calls.length, before, "a changed symlink must fail before querying Git");
});

test("root status and historical rename diff preserve existing command arguments", async () => {
  const calls = [];
  globalThis.webGitTest = { validate: async () => {}, invoke: async (command, args) => {
    calls.push({ command, args }); return command === "git_get_changes" ? [] : { branch: "main" };
  } };
  assert.deepEqual(await executeWebGitRead("git.status", {}, "C:/root"), { changes: [], branch: { branch: "main" } });
  await executeWebGitRead("git.commit_diff", { commitId: oid, path: "new.txt", oldPath: "old.txt" }, "C:/root");
  assert.equal(calls.at(-1).command, "git_get_commit_file_diff");
  assert.equal(calls.at(-1).args.oldFilePath, "old.txt");
  assert.equal(calls.at(-1).args.commitId, oid);
  assert.ok(calls.every((item) => !/stage|push|fetch|discard/.test(item.command)));
});

test("errors map to safe nonrepository, binary and size codes", async () => {
  for (const [error, code] of [["not_git_repository", "not_git_repository"], ["git_diff_too_large", "git_result_too_large"],
    ["binary file", "git_binary_file"], ["permission denied C:/private", "git_read_failed"]]) {
    globalThis.webGitTest = { validate: async () => {}, invoke: async () => { throw error; } };
    await assert.rejects(executeWebGitRead("git.history", {}, "C:/root"), { code, message: code });
  }
});

test("Web parsers preserve empty pages, rename paths and binary metadata; malformed data is not clean status", () => {
  const commit = { id: oid, shortId: "aaaaaaa", title: "hello", authorName: "author", authoredAt: 123 };
  assert.deepEqual(git.parseGitPage({ commits: [], nextCursor: null }), { commits: [], nextCursor: null });
  assert.deepEqual(git.parseGitPage({ commits: [commit], nextCursor: oid }).commits, [commit]);
  const detail = git.parseGitDetail({ commit, files: [{ path: "new", oldPath: "old", status: "R", added: 2, deleted: 1, binary: true }] });
  assert.equal(detail.files[0].binary, true);
  assert.equal(detail.files[0].oldPath, "old");
  assert.equal(git.parseGitDiff({ content: "<script>literal</script>" }), "<script>literal</script>");
  assert.throws(() => git.parseGitStatus({ changes: [] }), /invalid_git_result/);
  assert.throws(() => git.parseGitPage({ commits: "bad" }), /invalid_git_result/);
});

test("real desktop and mobile entries mount read-only panel; translations and cancellation remain connected", async () => {
  const views = read("../apps/web/src/views.tsx");
  assert.equal((views.match(/<ProjectInspector /g) ?? []).length, 2);
  const inspector = read("../apps/web/src/ProjectInspector.tsx");
  assert.match(inspector, /tab === "files" \? <ProjectFilesPanel/);
  assert.match(inspector, /<ProjectGitPanel/);
  const panel = read("../apps/web/src/ProjectGitPanel.tsx");
  assert.match(panel, /return \(\) => controller.abort\(\)/);
  assert.match(panel, /!controller.signal.aborted/);
  assert.match(panel, /key=\{repository\}/);
  assert.match(panel, /key=\{search\}/);
  assert.match(panel, /hour12: false/);
  assert.doesNotMatch(panel, /git\.(push|commit"|fetch|discard|stage)|dangerouslySetInnerHTML/);
  const { translate } = await import(moduleUrl(read("../apps/web/src/i18n.ts")));
  for (const key of [...panel.matchAll(/t\("([^"]+)"\)/g)].map((match) => match[1])) {
    assert.equal(typeof translate("zh-CN", key), "string", key);
    assert.equal(typeof translate("en-US", key), "string", key);
  }
});

test("read handler is registered in both validation and execution; server allows the same new kinds", () => {
  const bridge = read("../src/features/terminal/lib/webManagement.ts");
  assert.match(bridge, /\.\.\.WEB_GIT_READ_KINDS/);
  assert.match(bridge, /validateWebGitRead\(operation.kind, payload\)/);
  assert.match(bridge, /boundedResult\(await executeWebGitRead\(operation.kind, payload, rootPath\)/);
  const server = read("../apps/server/src/api.rs").split("const CONFIRMED_OPERATION_KINDS")[0];
  for (const kind of ["git.repositories", "git.history", "git.commit_detail", "git.commit_diff"]) {
    assert.ok(server.includes(`"${kind}"`), kind);
  }
});
