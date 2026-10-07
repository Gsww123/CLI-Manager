import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import vm from "node:vm";
import ts from "typescript";

const source = readFileSync(new URL("../src/features/terminal/hooks/useXTermController.ts", import.meta.url), "utf8");
const ast = ts.createSourceFile("useXTermController.ts", source, ts.ScriptTarget.Latest, true);
let callback;
function visit(node) {
  if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)
    && node.expression.name.text === "attachCustomKeyEventHandler") callback = node.arguments[0];
  ts.forEachChild(node, visit);
}
visit(ast);
assert.ok(callback, "exercise the actual xterm callback, not a duplicate policy");
const compiled = ts.transpileModule(`module.exports = ${callback.getText(ast)};`, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
}).outputText;

function harness(codex, hasDraft) {
  const calls = [];
  const sessionContext = { sessionTool: codex ? "codex" : "powershell" };
  const terminal = { buffer: { active: { type: "normal" } } };
  const module = { exports: null };
  vm.runInNewContext(compiled, {
    module, terminal, osPlatformRef: { current: "windows" },
    getSessionToolContext: () => sessionContext,
    isCodexSession: (context, target) => {
      assert.equal(context, sessionContext);
      assert.equal(target, terminal, "live viewport detection must be available for manual Codex launches");
      return codex;
    },
    inputSelection: {
      clearInputSelectionState: () => calls.push("clear"),
      extendKeyboardInputSelection: (direction) => calls.push(hasDraft ? `select:${direction}` : "empty-selection"),
      collapseKeyboardInputSelection: () => false,
    },
    useSettingsStore: { getState: () => ({ keyboardShortcuts: { copyTerminalSelection: "", scrollToBottom: "", pageUp: "", pageDown: "" } }) },
    eventToCombo: () => "",
    acceptSuggestion: () => false,
  });
  return { handle: module.exports, calls };
}

function key(name, overrides = {}) {
  return { type: "keydown", key: name, shiftKey: true, ctrlKey: false, altKey: false, metaKey: false,
    prevented: false, preventDefault() { this.prevented = true; }, ...overrides };
}

for (const arrow of ["ArrowLeft", "ArrowRight"]) {
  for (const hasDraft of [false, true]) {
    test(`Codex ${arrow} with ${hasDraft ? "draft" : "empty input"} reaches xterm with Shift intact`, () => {
      const { handle, calls } = harness(true, hasDraft);
      const event = key(arrow);
      assert.equal(handle(event), true);
      assert.equal(event.prevented, false);
      assert.equal(event.shiftKey, true);
      assert.deepEqual(calls, ["clear"], "must not send plain arrows or create a synthetic input selection");
    });
  }
  test(`ordinary shell ${arrow} retains selection behavior`, () => {
    const { handle, calls } = harness(false, true);
    const event = key(arrow);
    assert.equal(handle(event), false);
    assert.equal(event.prevented, true);
    assert.deepEqual(calls, [`select:${arrow === "ArrowLeft" ? -1 : 1}`]);
  });
}

test("release and other modifier combinations pass through without touching input selection", () => {
  for (const overrides of [{ type: "keyup" }, { ctrlKey: true }, { altKey: true }, { metaKey: true }, { shiftKey: false }]) {
    const { handle, calls } = harness(true, false);
    const event = key("ArrowLeft", overrides);
    assert.equal(handle(event), true);
    assert.equal(event.prevented, false);
    assert.deepEqual(calls, []);
  }
});
