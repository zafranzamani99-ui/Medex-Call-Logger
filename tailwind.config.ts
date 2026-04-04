import type { Config } from "tailwindcss";

// WHY: Extended Tailwind config for dark theme + distinctive typography.
// IBM Plex Sans (display) + JetBrains Mono (data/codes).
// baseline-ui: use Tailwind defaults, extend only what's needed.
const config: Config = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./lib/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        background: "var(--background)",
        foreground: "var(--foreground)",
        surface: {
          DEFAULT: "var(--surface)",
          raised: "var(--surface-raised)",
          overlay: "var(--surface-overlay)",
          inset: "var(--surface-inset)",
        },
        border: "var(--border)",
        accent: {
          DEFAULT: "var(--accent)",
          hover: "var(--accent-hover)",
          muted: "var(--accent-muted)",
        },
        'text-primary': "var(--text-primary)",
        'text-secondary': "var(--text-secondary)",
        'text-tertiary': "var(--text-tertiary)",
        'text-muted': "var(--text-muted)",
      },
      fontFamily: {
        sans: ['var(--font-sans)', '-apple-system', 'BlinkMacSystemFont', 'system-ui', 'sans-serif'],
        mono: ['var(--font-mono)', 'monospace'],
      },
      boxShadow: {
        'theme-sm': 'var(--shadow-sm)',
        'theme-md': 'var(--shadow-md)',
        'theme-lg': 'var(--shadow-lg)',
        'glow': 'var(--glow-sm)',
        'glow-md': 'var(--glow-md)',
      },
    },
  },
  plugins: [],
};
export default config;
