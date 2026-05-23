/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Cores institucionais CBMES (PRD §10.2)
        cbmes: {
          red: '#8B0000', // Vermelho bombeiro (primária)
          blue: '#1F3864', // Azul institucional militar (secundária)
          'blue-dark': '#142847', // S2.10.12 — sidebar do WebShell (mais escuro)
          'blue-light': '#2C4A82', // S2.10.12 — hover/accent web
        },
        feedback: {
          error: '#C8102E',
          success: '#2D7A2D',
          warn: '#E36C0A',
        },
      },
      screens: {
        // S2.10.12 — breakpoint semântico para webshell (alinhado com
        // VIEWPORT_BREAKPOINT_WEB em lib/ui-mode.ts).
        desktop: '1024px',
      },
      fontFamily: {
        sans: [
          'Inter',
          'system-ui',
          '-apple-system',
          'BlinkMacSystemFont',
          'Segoe UI',
          'Roboto',
          'sans-serif',
        ],
      },
      borderRadius: {
        DEFAULT: '0.5rem', // 8px (cards)
        button: '0.375rem', // 6px (botões)
      },
    },
  },
  plugins: [],
};
