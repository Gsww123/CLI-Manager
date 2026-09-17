import { toCssFontFamilyName } from "../../../shared/platform/systemFonts";

const POWERLINE_FALLBACK_STACK = [
  "\"Symbols Nerd Font Mono\"",
  "\"DejaVu Sans Mono for Powerline\"",
  "\"Droid Sans Mono for Powerline\"",
  "\"Source Code Pro for Powerline\"",
  "\"Roboto Mono for Powerline\"",
  "\"Cascadia Code PL\"",
  "\"CaskaydiaCove Nerd Font\"",
  "\"CaskaydiaCove Nerd Font Mono\"",
  "\"MesloLGS NF\"",
  "\"Meslo LG S for Powerline\"",
  "\"FiraCode Nerd Font\"",
  "\"Fira Code Nerd Font\"",
] as const;
// 上面两个栈都只含拉丁字形，没有任何中日韩字体。缺了 CJK 兜底时 WebView 会自行回退到
// 系统默认字体（Windows 上为宋体），中文既细又是衬线，和英文的观感完全割裂。
// 首选苹方，它的汉字严格等宽，终端对齐不会错位；未安装苹方的机器依次落到微软雅黑等字体。
const CJK_FALLBACK_STACK = [
  "\"PingFang SC\"",
  "\"Microsoft YaHei UI\"",
  "\"Microsoft YaHei\"",
  "\"Hiragino Sans GB\"",
  "\"Noto Sans CJK SC\"",
  "\"Source Han Sans SC\"",
  "\"Noto Sans SC\"",
] as const;
const DEFAULT_MONOSPACE_STACK = [
  "\"Cascadia Code\"",
  "Consolas",
  ...POWERLINE_FALLBACK_STACK,
  ...CJK_FALLBACK_STACK,
  "monospace",
] as const;
const GENERIC_MONOSPACE_TOKENS = new Set(["monospace", "ui-monospace"]);

const normalizeFamilyToken = (token: string) => token.trim().replace(/^['"]|['"]$/g, "");

const isGenericMonospaceToken = (token: string) =>
  GENERIC_MONOSPACE_TOKENS.has(normalizeFamilyToken(token).toLowerCase());

const dedupeTokens = (tokens: string[]) => {
  const seen = new Set<string>();
  return tokens.filter((token) => {
    const normalized = normalizeFamilyToken(token).toLowerCase();
    if (!normalized || seen.has(normalized)) return false;
    seen.add(normalized);
    return true;
  });
};

export function normalizeTerminalFontFamily(fontFamily: string) {
  const tokens = fontFamily
    .split(",")
    .map(toCssFontFamilyName)
    .filter(Boolean);

  if (tokens.length === 0) {
    return DEFAULT_MONOSPACE_STACK.join(", ");
  }

  const dedupedTokens = dedupeTokens(tokens);
  const genericMonospaceTokens = dedupedTokens.filter(isGenericMonospaceToken);
  const concreteTokens = dedupedTokens.filter((token) => !isGenericMonospaceToken(token));
  // CJK 兜底始终排在用户字体与 Powerline 字体之后、monospace 之前：
  // 只有前面所有字体都没有该字形时才会用到，不会抢走拉丁字形。
  const orderedTokens = concreteTokens.length > 0
    ? [...concreteTokens, ...POWERLINE_FALLBACK_STACK, ...CJK_FALLBACK_STACK, ...genericMonospaceTokens]
    : [...POWERLINE_FALLBACK_STACK, ...CJK_FALLBACK_STACK, ...dedupedTokens];

  return dedupeTokens([...orderedTokens, "monospace"]).join(", ");
}
