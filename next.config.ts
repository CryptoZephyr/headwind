import type { NextConfig } from "next";

const config: NextConfig = {
  serverExternalPackages: ["better-sqlite3", "neatlogs"],
  assetPrefix: process.env.HEADWIND_ASSET_PREFIX || undefined,
};

export default config;
