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
      const screen = stack?.querySelector<HTMLElement>(".web-terminal-frame.active .xterm-screen");
      const viewport = screen?.closest<HTMLElement>(".web-terminal");
      if (!stack || !screen || !viewport || !screen.offsetWidth) {
        setMeasured({ sessionId, split, space: false });
        return;
      }
      // The xterm wrapper fills the viewport; the screen reflects actual text width.
      // Horizontally scrollable output must remain accessible rather than be covered.
      const right = screen.getBoundingClientRect().right + 12;
      setMeasured((old) => ({ sessionId, split,
        space: canDockFiles(window.innerWidth, stack.getBoundingClientRect().right, right, split,
          old.sessionId === sessionId && old.space,
          viewport.scrollWidth > viewport.clientWidth + 1) &&
          stack.clientWidth >= 640 && right - stack.getBoundingClientRect().left >= 240 }));
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
