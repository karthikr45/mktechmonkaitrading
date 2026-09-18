import { existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { loadEnvFile } from "node:process";
export function repositoryRoot() {
  let current = process.cwd();
  while (!existsSync(resolve(current, "pnpm-workspace.yaml"))) {
    const parent = dirname(current);
    if (parent === current)
      throw new Error("Run inside the MKTechMonk repository");
    current = parent;
  }
  return current;
}
export function loadLocalEnvironment() {
  const file = resolve(repositoryRoot(), ".env");
  if (existsSync(file)) loadEnvFile(file);
}
