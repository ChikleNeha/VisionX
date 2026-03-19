/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      fontFamily: {
        display: ['"Syne"', 'sans-serif'],
        body: ['"DM Sans"', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'monospace'],
      },
      colors: {
        ink:     '#09090f',
        surface: '#101018',
        card:    '#18182a',
        border:  '#2a2a40',
        accent:  '#a855f7',   // violet
        accent2: '#ec4899',   // pink — used in gradients
        warn:    '#ffb347',
        danger:  '#ff5f5f',
        muted:   '#6b6b85',
        text:    '#ece8f8',
      },
      backgroundImage: {
        'gradient-accent': 'linear-gradient(135deg, #a855f7, #ec4899)',
        'gradient-accent-hover': 'linear-gradient(135deg, #9333ea, #db2777)',
      },
      animation: {
        'pulse-slow': 'pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'glow':       'glow 2s ease-in-out infinite alternate',
        'slide-up':   'slideUp 0.4s ease-out',
        'fade-in':    'fadeIn 0.3s ease-out',
        'ripple':     'ripple 1.5s ease-out infinite',
      },
      keyframes: {
        glow: {
          '0%':   { boxShadow: '0 0 8px #a855f740' },
          '100%': { boxShadow: '0 0 24px #a855f780, 0 0 48px #ec489930' },
        },
        slideUp: {
          '0%':   { transform: 'translateY(12px)', opacity: '0' },
          '100%': { transform: 'translateY(0)',    opacity: '1' },
        },
        fadeIn: {
          '0%':   { opacity: '0' },
          '100%': { opacity: '1' },
        },
        ripple: {
          '0%':   { transform: 'scale(1)',   opacity: '1' },
          '100%': { transform: 'scale(2.5)', opacity: '0' },
        },
      },
    },
  },
  plugins: [],
}