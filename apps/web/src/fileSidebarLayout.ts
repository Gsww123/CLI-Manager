export function canDockFiles(viewportWidth: number, stackRight: number, terminalRight: number,
  split: boolean, alreadyDocked: boolean, horizontalOverflow = false): boolean {
  return viewportWidth >= 768 && !split && !horizontalOverflow && terminalRight > 0 &&
    stackRight - terminalRight >= (alreadyDocked ? 324 : 340);
}
