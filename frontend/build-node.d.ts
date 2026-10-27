// The build uses these two Node APIs; the project intentionally has no @types/node dependency.
declare module "node:fs" {
  export function readFileSync(path: string, encoding: "utf8"): string;
}
declare module "node:path" {
  export function resolve(...paths: string[]): string;
}
