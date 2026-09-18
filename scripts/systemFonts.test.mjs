import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  mergeFontFamilyOptions,
  normalizeFontFamilyStack,
  withFontFallback,
} from "../src/shared/platform/systemFonts.ts";

const terminalNormalizer = (value) =>
  normalizeFontFamilyStack(value, '"Symbols Nerd Font Mono", monospace');

const themeSettingsSource = readFileSync(
  new URL("../src/features/settings/components/pages/ThemeSettingsPage.tsx", import.meta.url),
  "utf8"
);

test("terminal font options use the terminal-specific normalizer", () => {
  assert.match(
    themeSettingsSource,
    /TERMINAL_FONT_FALLBACK,\s*normalizeTerminalFontFamily,?\s*\)/
  );
});

for (const family of ["Maple Mono", "霞鹜文楷等宽", "ACME, Mono", "Mono.Name (Pro)"]) {
  test(`matches installed terminal font option: ${family}`, () => {
    const selectedValue = terminalNormalizer(withFontFallback(family, "monospace"));
    const options = mergeFontFamilyOptions(
      selectedValue,
      [],
      [{ family }],
      "monospace",
      terminalNormalizer
    );

    assert.equal(options[0]?.label, family);
    assert.equal(options.some((option) => option.label === "当前自定义（保留）"), false);
  });
}

test("serializes a comma-containing system font as one CSS family", () => {
  assert.equal(withFontFallback("ACME, Mono", "monospace"), '"ACME, Mono", monospace');
});

test("keeps a genuinely unavailable terminal font as current custom", () => {
  const selectedValue = terminalNormalizer(withFontFallback("Unavailable Mono", "monospace"));
  const options = mergeFontFamilyOptions(
    selectedValue,
    [],
    [{ family: "Maple Mono" }],
    "monospace",
    terminalNormalizer
  );

  assert.equal(options[0]?.label, "当前自定义（保留）");
});

// 回归：终端与 UI 字体栈必须带中日韩字体兜底。
// 缺了它，Windows 上 WebView 会把中文回退到宋体——字细且带衬线，和等宽的英文正文观感割裂。
// 该模块内部使用无扩展名相对导入，node 无法直接加载其运行时，因此按本文件的既有做法做源码断言。
const terminalFontSource = readFileSync(
  new URL("../src/features/terminal/api/terminalFontFamily.ts", import.meta.url),
  "utf8"
);

const CJK_STACK_PATTERN = /const CJK_FALLBACK_STACK = \[([\s\S]*?)\] as const;/;
const DEFAULT_STACK_PATTERN = /const DEFAULT_MONOSPACE_STACK = \[([\s\S]*?)\] as const;/;

test("terminal font stack declares a CJK fallback", () => {
  const cjkStack = terminalFontSource.match(CJK_STACK_PATTERN);
  assert.ok(cjkStack, "CJK_FALLBACK_STACK not found");
  assert.match(cjkStack[1], /PingFang SC/, "PingFang SC missing");
  assert.match(cjkStack[1], /Microsoft YaHei/, "YaHei fallback for machines without PingFang missing");
});

test("PingFang SC leads the CJK fallback stack", () => {
  const cjkStack = terminalFontSource.match(CJK_STACK_PATTERN);
  assert.ok(cjkStack, "CJK_FALLBACK_STACK not found");
  assert.ok(
    cjkStack[1].indexOf("PingFang SC") < cjkStack[1].indexOf("Microsoft YaHei"),
    "PingFang SC must precede Microsoft YaHei"
  );
});

test("default terminal stack places CJK fallback before generic monospace", () => {
  const defaultStack = terminalFontSource.match(DEFAULT_STACK_PATTERN);
  assert.ok(defaultStack, "DEFAULT_MONOSPACE_STACK not found");
  const body = defaultStack[1];
  assert.match(body, /\.\.\.CJK_FALLBACK_STACK/, "default stack must include the CJK fallback");
  assert.ok(
    body.indexOf("...CJK_FALLBACK_STACK") < body.indexOf('"monospace"'),
    "CJK fallback must precede generic monospace"
  );
});

test("both normalizeTerminalFontFamily branches splice in the CJK fallback", () => {
  const branchPattern = /\? \[\.\.\.concreteTokens[\s\S]*?\n\s*: \[\.\.\.POWERLINE_FALLBACK_STACK[^\n]*/;
  const branches = terminalFontSource.match(branchPattern);
  assert.ok(branches, "orderedTokens branches not found");
  const [withConcrete, withoutConcrete] = branches[0].split("\n");
  assert.match(withConcrete, /CJK_FALLBACK_STACK/, "custom-font branch missing CJK fallback");
  assert.match(withoutConcrete, /CJK_FALLBACK_STACK/, "empty-input branch missing CJK fallback");
});
