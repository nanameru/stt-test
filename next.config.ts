import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  turbopack: {
    // Ensure Turbopack uses this project as the workspace root
    root: __dirname,
  },
};

export default nextConfig;
