import { useCallback, useEffect, useRef, useState } from "react";
import { canDockFiles } from "./fileSidebarLayout";

export function useFileSidebarLayout(sessionId: string | null | undefined, split: boolean) {
  const stackRef = useRef<HTMLDivElement>(null);
  const [measured, setMeasured] = useState({ sessionId, split, space: false });
  const frame = useRef<number | null>(null);
  const measure = useCallback(() => {
    if (frame.current !== null) cancelAnimationFrame(frame.current);
    frame.current = requestAnimationFrame(() => {
      frame.current = null;
      const stack = stackRef.current;
      const terminal = stack?.querySelector<HTMLElement>(".web-terminal-frame.active .xterm");
      if (!stack || !terminal || !terminal.offsetWidth) { setMeasured({ sessionId, split, space: false }); return; }
      // offset width is independent of horizontal scrolling: never cover scrolled-off cells.
      const viewport = terminal.closest<HTMLElement>(".web-terminal");
      const right = (viewport?.getBoundingClientRect().left ?? terminal.getBoundingClientRect().left) + terminal.offsetWidth + 12;
      setMeasured((old) => ({ sessionId, split,
        space: canDockFiles(window.innerWidth, stack.getBoundingClientRect().right, right, split,
          old.sessionId === sessionId && old.space,
          Boolean(viewport && viewport.scrollHeight > viewport.clientHeight + 1)) }));
    });
  }, [sessionId, split]);
  useEffect(() => {
    measure();
    const observer = new ResizeObserver(measure);
    if (stackRef.current) observer.observe(stackRef.current);
    window.addEventListener("resize", measure);
    return () => {
      observer.disconnect(); window.removeEventListener("resize", measure);
      if (frame.current !== null) cancelAnimationFrame(frame.current);
    };
  }, [sessionId, measure]);
  return { stackRef, space: measured.sessionId === sessionId && measured.split === split && measured.space, measure };
}
