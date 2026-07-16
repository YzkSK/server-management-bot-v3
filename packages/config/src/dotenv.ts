import { config } from "dotenv";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const currentDir = dirname(fileURLToPath(import.meta.url));

export const defaultRootEnvPath = resolve(currentDir, "../../../../.env");

export function loadRootEnv(path: string = defaultRootEnvPath): void {
  config({ path });
}
