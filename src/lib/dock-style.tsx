import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

// Purely visual, device-local preference for the bottom dock's look — mirrors
// theme.tsx's Context + localStorage pattern exactly (no DB round-trip: the
// dock renders globally, once, in the authenticated layout, so a Context here
// is the simplest way to make the choice available wherever it's read, and
// staying local-only matches how the light/dark toggle already works).
export type DockStyle = "default" | "liquid";
type Ctx = { dockStyle: DockStyle; toggle: () => void; setDockStyle: (s: DockStyle) => void };
const DockStyleCtx = createContext<Ctx | null>(null);

const STORAGE_KEY = "voyager.dockStyle";

function getInitial(): DockStyle {
  if (typeof window === "undefined") return "default";
  const saved = window.localStorage.getItem(STORAGE_KEY);
  return saved === "liquid" ? "liquid" : "default";
}

export function DockStyleProvider({ children }: { children: ReactNode }) {
  const [dockStyle, setDockStyle] = useState<DockStyle>("default");

  useEffect(() => {
    setDockStyle(getInitial());
  }, []);

  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, dockStyle);
    } catch {
      /* ignore quota/unavailable storage */
    }
  }, [dockStyle]);

  return (
    <DockStyleCtx.Provider
      value={{
        dockStyle,
        toggle: () => setDockStyle(dockStyle === "liquid" ? "default" : "liquid"),
        setDockStyle,
      }}
    >
      {children}
    </DockStyleCtx.Provider>
  );
}

export function useDockStyle() {
  const v = useContext(DockStyleCtx);
  if (!v) throw new Error("useDockStyle must be used within DockStyleProvider");
  return v;
}
