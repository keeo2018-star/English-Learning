import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  outputFileTracingIncludes: {
    '/api/bilingual': ['./src/data/cedict/cedict.gz'],
    '/api/collection-lookup': ['./src/data/cedict/cedict.gz'],
  },
  async headers() {
    return [{ source: "/sw.js", headers: [
      { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
      { key: "Service-Worker-Allowed", value: "/" },
    ] }];
  },
  cacheComponents: true,
  partialPrefetching: true,
};

export default nextConfig;
