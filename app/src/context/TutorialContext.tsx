import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";

// Whether the guided tour is currently running, plus controls to start/stop it.
// Lifted to context so Settings (a child page) can replay it and the auto-start
// effect in App can launch it, while the overlay itself lives in the Pages tree
// (where it has access to navigation).
interface TutorialCtx {
  active: boolean;
  start: () => void;
  stop: () => void;
}

const Ctx = createContext<TutorialCtx | null>(null);

export function TutorialProvider({ children }: { children: ReactNode }) {
  const [active, setActive] = useState(false);
  const start = useCallback(() => setActive(true), []);
  const stop = useCallback(() => setActive(false), []);
  const value = useMemo(() => ({ active, start, stop }), [active, start, stop]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useTutorial(): TutorialCtx {
  const v = useContext(Ctx);
  if (!v) throw new Error("useTutorial must be used within TutorialProvider");
  return v;
}
