"use client";

import { ThemeProvider as NextThemeProvider } from "next-themes";
import type { ReactNode } from "react";

/** Toggles the .dark class next-themes needs, persists the choice
 * (localStorage) and respects the OS preference by default. A blocking
 * inline script (added by next-themes itself, before hydration) sets the
 * class from that stored value immediately — without it the page would
 * flash the wrong theme on every load. */
export function ThemeProvider({ children }: { children: ReactNode }) {
  return (
    <NextThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
      {children}
    </NextThemeProvider>
  );
}
