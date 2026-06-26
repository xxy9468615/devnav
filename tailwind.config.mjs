import typography from '@tailwindcss/typography';

/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./src/**/*.{astro,html,js,jsx,ts,tsx}'],
  theme: {
    extend: {
      colors: {
        'bg-primary': '#F8F6F2',
        'bg-secondary': '#EDE8DF',
        'bg-tertiary': '#D9D6D0',
        'text-primary': '#2B2B2B',
        'text-secondary': '#5A5A5A',
        'accent-green': '#234032',
        'accent-blue': '#355C7D',
        'dark-bg-primary': '#1A1A1A',
        'dark-bg-secondary': '#2A2A2A',
        'dark-bg-tertiary': '#3A3A3A',
        'dark-text-primary': '#F8F6F2',
        'dark-text-secondary': '#B0B0B0',
      },
      fontFamily: {
        sans: ['Inter', 'Noto Sans SC', 'PingFang SC', 'Microsoft YaHei', 'system-ui', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'sans-serif'],
        heading: ['Manrope', 'Inter', 'Noto Sans SC', 'PingFang SC', 'Microsoft YaHei', 'system-ui', 'sans-serif'],
      },
      animation: {
        'fade-in': 'fadeIn 0.7s ease-out',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
      },
      typography: {
        DEFAULT: {
          css: {
            maxWidth: 'none',
            color: '#2B2B2B',
            h1: { fontFamily: 'Manrope, Inter, sans-serif', fontWeight: '700' },
            h2: { fontFamily: 'Manrope, Inter, sans-serif', fontWeight: '700' },
            h3: { fontFamily: 'Manrope, Inter, sans-serif', fontWeight: '700' },
            a: { color: '#2B2B2B', textDecoration: 'underline', textUnderlineOffset: '4px' },
            'a:hover': { color: '#355C7D' },
            code: { backgroundColor: '#EDE8DF', padding: '2px 6px', borderRadius: '4px', fontSize: '0.875em' },
            'code::before': { content: '""' },
            'code::after': { content: '""' },
          },
        },
        invert: {
          css: {
            color: '#F8F6F2',
            a: { color: '#F8F6F2' },
            'a:hover': { color: '#B0B0B0' },
            code: { backgroundColor: '#2A2A2A', color: '#F8F6F2' },
          },
        },
      },
    },
  },
  plugins: [typography],
};
