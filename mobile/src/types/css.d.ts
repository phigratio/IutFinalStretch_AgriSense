/**
 * CSS side-effect + module declarations so bare `tsc --noEmit` accepts the
 * template's web-only css imports (Metro handles them at bundle time).
 */
declare module "*.css";
declare module "*.module.css" {
  const classes: Record<string, string>;
  export default classes;
}
