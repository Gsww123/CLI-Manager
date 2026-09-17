export function canDockFiles(viewportWidth: number, stackRight: number, terminalRight: number,
  split: boolean, alreadyDocked: boolean, horizontalOverflow = false): boolean {
  return viewportWidth >= 768 && !split && !horizontalOverflow && terminalRight > 0 &&
    stackRight - terminalRight >= (alreadyDocked ? 224 : 240);
}

export function fileDockWidth(spareWidth: number): number {
  // Reserve the 20px scrollbar inset and a 4px gap outside the measured canvas.
  return Math.max(200, Math.min(300, Math.floor(spareWidth - 24)));
}
