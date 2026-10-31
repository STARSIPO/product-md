import type { Config } from 'tailwindcss'

/**
 * Every colour is a CSS variable declared in src/app/globals.css so the whole
 * palette can be re-themed (or dark-moded) without touching component code.
 * See docs/DESIGN_SYSTEM.md for the rationale behind each token.
 */
const config: Config = {
  darkMode: 'class',
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    container: {
      center: true,
      padding: { DEFAULT: '1rem', sm: '1.5rem', lg: '2rem' },
      screens: { '2xl': '1320px' },
    },
    extend: {
      colors: {
        background: 'rgb(var(--color-background) / <alpha-value>)',
        foreground: 'rgb(var(--color-foreground) / <alpha-value>)',
        card: {
          DEFAULT: 'rgb(var(--color-card) / <alpha-value>)',
          foreground: 'rgb(var(--color-card-foreground) / <alpha-value>)',
        },
        muted: {
          DEFAULT: 'rgb(var(--color-muted) / <alpha-value>)',
          foreground: 'rgb(var(--color-muted-foreground) / <alpha-value>)',
        },
        primary: {
          DEFAULT: 'rgb(var(--color-primary) / <alpha-value>)',
          hover: 'rgb(var(--color-primary-hover) / <alpha-value>)',
          soft: 'rgb(var(--color-primary-soft) / <alpha-value>)',
          foreground: 'rgb(var(--color-primary-foreground) / <alpha-value>)',
        },
        secondary: {
          DEFAULT: 'rgb(var(--color-secondary) / <alpha-value>)',
          foreground: 'rgb(var(--color-secondary-foreground) / <alpha-value>)',
        },
        accent: {
          DEFAULT: 'rgb(var(--color-accent) / <alpha-value>)',
          soft: 'rgb(var(--color-accent-soft) / <alpha-value>)',
          foreground: 'rgb(var(--color-accent-foreground) / <alpha-value>)',
        },
        border: 'rgb(var(--color-border) / <alpha-value>)',
        input: 'rgb(var(--color-input) / <alpha-value>)',
        ring: 'rgb(var(--color-ring) / <alpha-value>)',
        success: {
          DEFAULT: 'rgb(var(--color-success) / <alpha-value>)',
          soft: 'rgb(var(--color-success-soft) / <alpha-value>)',
        },
        warning: {
          DEFAULT: 'rgb(var(--color-warning) / <alpha-value>)',
          soft: 'rgb(var(--color-warning-soft) / <alpha-value>)',
        },
        destructive: {
          DEFAULT: 'rgb(var(--color-destructive) / <alpha-value>)',
          soft: 'rgb(var(--color-destructive-soft) / <alpha-value>)',
        },
      },
      fontFamily: {
        sans: ['var(--font-sans)', 'system-ui', 'sans-serif'],
      },
      fontSize: {
        // Body never drops below 14px; captions are the only 13px usage.
        caption: ['0.8125rem', { lineHeight: '1.15rem' }],
        sm: ['0.875rem', { lineHeight: '1.35rem' }],
        base: ['0.9375rem', { lineHeight: '1.55rem' }],
        lg: ['1.0625rem', { lineHeight: '1.65rem' }],
        // Headings carry a notch more presence than before; body stays at 15px so a
        // wholesale buyer still sees a full grid of offers without scrolling.
        h3: ['1.3125rem', { lineHeight: '1.8rem', letterSpacing: '-0.012em' }],
        h2: ['1.75rem', { lineHeight: '2.2rem', letterSpacing: '-0.018em' }],
        h1: ['2.25rem', { lineHeight: '2.7rem', letterSpacing: '-0.022em' }],
        display: ['3rem', { lineHeight: '3.4rem', letterSpacing: '-0.028em' }],
      },
      borderRadius: {
        // Softer than a classifieds board, tighter than a consumer delivery app.
        sm: '0.5rem', // 8
        DEFAULT: '0.625rem', // 10
        md: '0.75rem', // 12
        lg: '1rem', // 16 — the card radius
        xl: '1.25rem', // 20
        '2xl': '1.5rem', // 24
      },
      boxShadow: {
        /**
         * Depth now comes from elevation rather than outlines. The previous scale was
         * so faint that every surface needed a 1px border to be legible at all, which
         * is what made the product read as a wireframe.
         *
         * Each level is two shadows: a tight contact shadow that anchors the edge, and
         * a wide soft one that lifts it off the background.
         */
        card: '0 1px 2px 0 rgb(var(--shadow-color) / 0.05), 0 4px 12px -4px rgb(var(--shadow-color) / 0.08)',
        hover: '0 2px 4px 0 rgb(var(--shadow-color) / 0.06), 0 10px 24px -8px rgb(var(--shadow-color) / 0.14)',
        pop: '0 10px 32px -8px rgb(var(--shadow-color) / 0.16), 0 3px 8px -3px rgb(var(--shadow-color) / 0.07)',
      },
      keyframes: {
        'fade-in': { from: { opacity: '0' }, to: { opacity: '1' } },
        'slide-up': {
          from: { opacity: '0', transform: 'translateY(6px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        'slide-in-bottom': {
          from: { transform: 'translateY(100%)' },
          to: { transform: 'translateY(0)' },
        },
        shimmer: {
          '100%': { transform: 'translateX(100%)' },
        },
      },
      animation: {
        'fade-in': 'fade-in 160ms ease-out',
        'slide-up': 'slide-up 180ms ease-out',
        'slide-in-bottom': 'slide-in-bottom 220ms cubic-bezier(0.22, 1, 0.36, 1)',
        shimmer: 'shimmer 1.6s infinite',
      },
    },
  },
  plugins: [],
}

export default config
