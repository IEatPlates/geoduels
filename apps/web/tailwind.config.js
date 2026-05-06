/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./pages/**/*.{js,ts,jsx,tsx}', './components/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        surface: '#0f171f',
        surfaceElevated: '#162130',
        ink: '#f4f9ff',
        inkMuted: '#a9bfd4',
        accentPrimary: '#2ad18f',
        accentPrimaryDeep: '#0ea568',
        accentDanger: '#ff6d42',
        accentDangerDeep: '#dc4a23',
        hudBg: 'rgba(7, 12, 18, 0.74)',
        hudBorder: 'rgba(147, 197, 253, 0.24)'
      },
      backgroundImage: {
        'hero-gradient': 'radial-gradient(circle at 14% 20%, #5de7b2 0%, #1aa571 34%, #0c5f7f 68%, #1e2b4b 100%)',
        'cta-gradient': 'linear-gradient(135deg, #2ad18f 0%, #12a86f 48%, #0c8c90 100%)',
        'hp-self': 'linear-gradient(90deg, #2ce39a 0%, #18bf83 45%, #129f71 100%)',
        'hp-opp': 'linear-gradient(90deg, #ff945f 0%, #f06538 45%, #d64a24 100%)',
        'result-glow': 'radial-gradient(circle at center, rgba(42,209,143,0.35) 0%, rgba(42,209,143,0) 66%)',
        'scene-vignette': 'radial-gradient(circle at 50% 12%, rgba(18, 104, 88, 0.2) 0%, rgba(4, 10, 16, 0.9) 72%)'
      },
      boxShadow: {
        'elev-1': '0 8px 24px rgba(4, 8, 13, 0.2)',
        'elev-2': '0 16px 42px rgba(3, 8, 14, 0.34)',
        'elev-3': '0 24px 56px rgba(3, 7, 11, 0.46)',
        'elev-4': '0 36px 84px rgba(2, 6, 11, 0.58)'
      },
      borderRadius: {
        panel: '1rem',
        pill: '9999px'
      },
      backdropBlur: {
        hud: '10px'
      },
      keyframes: {
        countdownPulse: {
          '0%, 100%': { transform: 'scale(1)', opacity: '0.95' },
          '50%': { transform: 'scale(1.08)', opacity: '1' }
        },
        scorePop: {
          '0%': { transform: 'translateY(12px) scale(0.9)', opacity: '0' },
          '60%': { transform: 'translateY(0) scale(1.06)', opacity: '1' },
          '100%': { transform: 'translateY(0) scale(1)', opacity: '1' }
        },
        damageTravel: {
          '0%': { transform: 'translateY(14px) scale(0.9)', opacity: '0' },
          '35%': { transform: 'translateY(0) scale(1.08)', opacity: '1' },
          '100%': { transform: 'translateY(-4px) scale(1)', opacity: '1' }
        },
        overlayFade: {
          '0%': { opacity: '0', transform: 'translateY(8px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' }
        },
        hudSlideIn: {
          '0%': { opacity: '0', transform: 'translateY(-10px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' }
        },
        timerCritical: {
          '0%': {
            transform: 'scale(1)',
            boxShadow: '0 0 0 0 rgba(255,109,66,0.18), 0 0 8px rgba(255,109,66,0.28)'
          },
          '85%': {
            transform: 'scale(1.055)',
            boxShadow: '0 0 0 12px rgba(255,109,66,0.22), 0 0 32px rgba(255,109,66,0.48)'
          },
          '100%': {
            transform: 'scale(1)',
            boxShadow: '0 0 0 0 rgba(255,109,66,0), 0 0 0 rgba(255,109,66,0)'
          }
        },
        lobbyAurora: {
          '0%': { transform: 'translate3d(-3%, 0, 0) scale(1)', opacity: '0.55' },
          '50%': { transform: 'translate3d(3%, 2%, 0) scale(1.06)', opacity: '0.85' },
          '100%': { transform: 'translate3d(-3%, 0, 0) scale(1)', opacity: '0.55' }
        },
        lobbyFloat: {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-10px)' }
        }
      },
      animation: {
        countdownPulse: 'countdownPulse 1s cubic-bezier(0.4, 0, 0.2, 1) infinite',
        scorePop: 'scorePop 360ms cubic-bezier(0.16, 1, 0.3, 1) both',
        damageTravel: 'damageTravel 620ms cubic-bezier(0.22, 1, 0.36, 1) both',
        overlayFade: 'overlayFade 250ms ease-out both',
        hudSlideIn: 'hudSlideIn 220ms ease-out both',
        timerCritical: 'timerCritical 1s cubic-bezier(0.32, 0, 0.68, 1) infinite',
        lobbyAurora: 'lobbyAurora 15s ease-in-out infinite',
        lobbyFloat: 'lobbyFloat 8s ease-in-out infinite'
      }
    }
  },
  plugins: []
};
