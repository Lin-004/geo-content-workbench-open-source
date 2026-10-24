import { withPayload } from "@payloadcms/next/withPayload";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  allowedDevOrigins: ["127.0.0.1"],
  ...(process.env.GEO_BUILD_WORKERS ? { experimental: {
    cpus: Math.max(1, Number(process.env.GEO_BUILD_WORKERS) || 1),
    webpackMemoryOptimizations: true,
  } } : {}),
};

export default withPayload(nextConfig);
