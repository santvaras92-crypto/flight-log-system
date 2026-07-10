/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: 'class',
  // Only apply `hover:` styles on devices that actually support hover (mouse).
  // Prevents "sticky hover" on touchscreens where a tapped button keeps its
  // hover background until you tap elsewhere (made two tabs look selected).
  future: {
    hoverOnlyWhenSupported: true,
  },
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      // Semantic design tokens — mapped to CSS variables that flip in .dark.
      // Use these (bg-surface, bg-card, text-foreground, border-edge…) instead
      // of hardcoded slate/white so light & dark themes stay in sync.
      colors: {
        surface: 'var(--bg-primary)',      // page background
        elevated: 'var(--bg-secondary)',   // modals / raised panels
        card: 'var(--bg-elevated)',        // cards (was bg-white)
        muted: 'var(--bg-tertiary)',       // subtle fills (was slate-50/100)
        edge: 'var(--border-primary)',     // borders (was slate-200)
        'edge-strong': 'var(--border-secondary)',
        foreground: 'var(--text-primary)',        // primary text (was slate-900)
        'foreground-soft': 'var(--text-secondary)', // secondary text (slate-700/600)
        'muted-foreground': 'var(--text-tertiary)', // muted text (slate-500)
        faint: 'var(--text-muted)',               // faint text (slate-400)
        brand: {
          DEFAULT: 'var(--aviation-blue-600)',
          soft: 'var(--aviation-blue-500)',
        },
      },
    },
  },
  plugins: [],
}
