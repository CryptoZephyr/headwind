import { loadEnvFile } from "node:process";

for (const file of [".env.local", ".env"]) {
  try {
    loadEnvFile(file);
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
  }
}
