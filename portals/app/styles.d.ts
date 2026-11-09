// Next.js handles both side-effect stylesheets and CSS Module class maps.
// The value export also supports clean type checks before next-env generation.
declare module "*.css" {
  const classes: { readonly [key: string]: string };
  export default classes;
}

// DS static assets must also type-check before Next generates next-env.d.ts.
declare module "@vxture/design-system/assets/icons/tenant-default.png" {
  const image: import("next/image").StaticImageData;
  export default image;
}
