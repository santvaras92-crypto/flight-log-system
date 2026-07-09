"use client";

/**
 * ThemeToggle — professional light/dark switch (Apple/Google style).
 *
 * Single elegant button: shows a moon in light mode (click → dark) and a sun
 * in dark mode (click → light). Uses next-themes; renders a neutral placeholder
 * until mounted to avoid the hydration flash.
 *
 * `variant="nav"` styles it for the blue top nav; `variant="plain"` for light
 * surfaces (themes itself in dark mode too).
 */
import { useTheme } from "next-themes";
import { useEffect, useState } from "react";
import { Icon } from "./Icon";

export default function ThemeToggle({ variant = "nav" }: { variant?: "nav" | "plain" }) {
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const isDark = resolvedTheme === "dark";

  const styles =
    variant === "nav"
      ? "text-blue-100 hover:text-white hover:bg-white/15"
      : "text-slate-500 hover:text-slate-700 hover:bg-slate-100 dark:text-slate-400 dark:hover:text-slate-100 dark:hover:bg-white/10";

  return (
    <button
      type="button"
      onClick={() => setTheme(isDark ? "light" : "dark")}
      aria-label={isDark ? "Cambiar a modo claro" : "Cambiar a modo oscuro"}
      title={mounted ? (isDark ? "Modo claro" : "Modo oscuro") : "Tema"}
      className={`p-2 rounded-lg transition-all ${styles}`}
    >
      {mounted ? (
        <Icon name={isDark ? "sun" : "moon"} className="w-5 h-5" />
      ) : (
        <span className="block w-5 h-5" aria-hidden />
      )}
    </button>
  );
}
