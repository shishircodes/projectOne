import { useSyncExternalStore } from "react";

export type ThemePref = "light" | "dark" | "system";
const KEY = "ns-theme";

/** Runs before first paint (inlined in <head>) so there is no light/dark flash. */
export const themeScript = `(function(){try{var p=localStorage.getItem("${KEY}")||"system";var d=p==="dark"||(p==="system"&&matchMedia("(prefers-color-scheme: dark)").matches);document.documentElement.dataset.theme=d?"dark":"light";}catch(e){}})();`;

const listeners = new Set<() => void>();
function read(): ThemePref {
  try {
    return (localStorage.getItem(KEY) as ThemePref) || "system";
  } catch {
    return "system";
  }
}

function apply(pref: ThemePref) {
  const dark = pref === "dark" || (pref === "system" && matchMedia("(prefers-color-scheme: dark)").matches);
  const root = document.documentElement;
  root.classList.add("theme-transition");
  root.dataset.theme = dark ? "dark" : "light";
  // Ease the swap, then get out of the way so other transitions aren't affected.
  setTimeout(() => root.classList.remove("theme-transition"), 220);
  for (const meta of document.querySelectorAll('meta[name="theme-color"]')) meta.setAttribute("content", dark ? "#0d0e11" : "#f7f9fb");
}

export function setTheme(pref: ThemePref) {
  try {
    localStorage.setItem(KEY, pref);
  } catch {}
  apply(pref);
  listeners.forEach((l) => l());
}

if (typeof window !== "undefined") {
  matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => read() === "system" && apply("system"));
}

export function useTheme() {
  const pref = useSyncExternalStore(
    (cb) => (listeners.add(cb), () => listeners.delete(cb)),
    read,
    () => "system" as ThemePref,
  );
  const resolved: "light" | "dark" = useSyncExternalStore<"light" | "dark">(
    (cb) => (listeners.add(cb), () => listeners.delete(cb)),
    () => (document.documentElement.dataset.theme === "dark" ? "dark" : "light"),
    () => "light",
  );
  return { pref, resolved, setTheme };
}
