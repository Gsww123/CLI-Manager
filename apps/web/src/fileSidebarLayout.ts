export function canDockFiles(viewportWidth: number, stackRight: number, terminalRight: number,
  split: boolean, alreadyDocked: boolean, verticalOverflow = false): boolean {
  return viewportWidth >= 1000 && !split && !verticalOverflow && terminalRight > 0 &&
    stackRight - terminalRight >= (alreadyDocked ? 324 : 340);
}
