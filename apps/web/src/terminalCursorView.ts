// Reveal just the cursor cell, preserving the user's viewport when it is visible.
export function revealTerminalCell(scroll: number, viewport: number, start: number, size: number): number {
  if (start < scroll) return Math.max(0, start);
  if (start + size > scroll + viewport) return Math.max(0, start + size - viewport);
  return scroll;
}
