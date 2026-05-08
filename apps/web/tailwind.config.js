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
        },
        feedback: {
          error: '#C8102E',
          success: '#2D7A2D',
          warn: '#E36C0A',
        },
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
