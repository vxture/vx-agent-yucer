// Tailwind v4 runs as a PostCSS plugin. The design system's globals.css does
// `@import "tailwindcss"` and `@plugin "tailwindcss-animate"` itself (DS owns
// the L0 foundation layer), so this app configures the pipeline and nothing
// else - there is no tailwind.config here, and there must not be one: theme and
// tokens come from the DS.
const config = {
  plugins: {
    "@tailwindcss/postcss": {},
  },
};

export default config;
