/** @type {import('tailwindcss').Config} */
export default {
  content: ['./client/index.html', './client/src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: '#f5f5f7',
        surface: '#ffffff',
        border: 'rgba(0,0,0,0.08)',
        snfi: {
          accent: '#0071e3',
          accentLight: '#0077ed',
          accentDark: '#0058b8',
        },
        agent: {
          orchestrator: '#c9a84c',
          ophs: '#1e3a5c',
          resilience: '#8b1a1a',
          iia: '#2d6a4f',
          finance: '#1a4b8c',
          pactum: '#52b788',
          herzog: '#6b0f1a',
          u2: '#5b2d8e',
          captador: '#d4a017',
        },
      },
      fontFamily: {
        sans: ['Inter', '-apple-system', 'BlinkMacSystemFont', '"SF Pro Text"', 'system-ui', 'sans-serif'],
        mono: ['"SF Mono"', '"JetBrains Mono"', 'ui-monospace', 'monospace'],
      },
      letterSpacing: {
        tight: '-0.02em',
        snug: '-0.011em',
      },
    },
  },
  plugins: [],
};
