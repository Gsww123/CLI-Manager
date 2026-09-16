import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import ts from "typescript";

const source = readFileSync(new URL("../apps/web/src/terminalDisplay.ts", import.meta.url), "utf8");
const javascript = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText;
const { DEFAULT_DISPLAY, normalizeDisplay, readDisplay, stepDisplaySize, zoomDisplayFont } =
  await import(`data:text/javascript,${encodeURIComponent(javascript)}`);

test("legacy settings retain mode and manual font with 100% automatic zoom", () => {
  for (const mode of ["manual", "width", "contain"]) {
    const result = normalizeDisplay({ mode, fontSize: 22, width: 75, height: 90 });
    assert.deepEqual(result, { mode, fontSize: 22, zoom: 100, width: 75, height: 90 });
  }
  assert.deepEqual(normalizeDisplay(null), DEFAULT_DISPLAY);
});

test("size steps keep the selected mode and preserve the other mode's size", () => {
  for (const mode of ["manual", "width", "contain"]) {
    const initial = { ...DEFAULT_DISPLAY, mode, fontSize: 22, zoom: 150 };
    const increased = normalizeDisplay({ ...initial, ...stepDisplaySize(initial, 1) });
    assert.equal(increased.mode, mode);
    assert.equal(increased.fontSize, mode === "manual" ? 23 : 22);
    assert.equal(increased.zoom, mode === "manual" ? 150 : 160);
    assert.deepEqual(normalizeDisplay({ ...increased, ...stepDisplaySize(increased, -1) }), initial);
  }
});

test("size limits and invalid saved values are normalized", () => {
  assert.equal(normalizeDisplay({ zoom: 999 }).zoom, 300);
  assert.equal(normalizeDisplay({ zoom: -1 }).zoom, 25);
  assert.equal(normalizeDisplay({ zoom: NaN }).zoom, 100);
  assert.equal(normalizeDisplay({ zoom: "150" }).zoom, 100);
  assert.equal(normalizeDisplay({ fontSize: 999 }).fontSize, 36);
  assert.equal(normalizeDisplay({ fontSize: -1 }).fontSize, 8);
});

test("zoom applies after fit, permits overflow, and clamps renderer limits", () => {
  assert.equal(zoomDisplayFont(12, 100), 12);
  assert.equal(zoomDisplayFont(12, 150), 18);
  assert.equal(zoomDisplayFont(12, 50), 6);
  assert.equal(zoomDisplayFont(20, 150), 30); // resized viewport gets a new baseline
  assert.equal(zoomDisplayFont(1, 25), 1);
  assert.equal(zoomDisplayFont(96, 300), 96);
});

test("browser settings round-trip and recover from invalid storage", () => {
  const previous = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
  let saved = JSON.stringify({ ...DEFAULT_DISPLAY, mode: "width", zoom: 150 });
  Object.defineProperty(globalThis, "localStorage", { configurable: true, value: { getItem: () => saved } });
  try {
    assert.equal(readDisplay().zoom, 150);
    assert.equal(readDisplay().mode, "width");
    saved = "broken JSON";
    assert.deepEqual(readDisplay(), DEFAULT_DISPLAY);
  } finally {
    if (previous) Object.defineProperty(globalThis, "localStorage", previous);
    else delete globalThis.localStorage;
  }
});
