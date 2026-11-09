// Global stylesheet imports are processed by Next.js.
declare module "*.css" {}

// CSS Modules also need a value export before Next generates next-env.d.ts.
declare module "*.module.css" {
  const classes: { readonly [key: string]: string };
  export default classes;
}
