// Next.js handles both side-effect stylesheets and CSS Module class maps.
// The value export also supports clean type checks before next-env generation.
declare module "*.css" {
  const classes: { readonly [key: string]: string };
  export default classes;
}
