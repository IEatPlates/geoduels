import bundleAnalyzer from '@next/bundle-analyzer';
import { fileURLToPath } from 'node:url';

const appRoot = fileURLToPath(new URL('./', import.meta.url));

const withBundleAnalyzer = bundleAnalyzer({
  enabled: process.env.ANALYZE === 'true'
});

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    webpackBuildWorker: false
  },
  output: "standalone",
  outputFileTracingRoot: appRoot,
  async headers() {
    return [
      {
        source: "/runtime-config.js",
        headers: [
          {
            key: "Cache-Control",
            value: "no-store"
          }
        ]
      },
      {
        // Avoid storing HTML-like responses so clients always fetch the latest
        // document after a deploy, while keeping Next's fingerprinted static
        // assets on their default long cache.
        source: "/((?!_next/static|_next/image|favicon.ico).*)",
        headers: [
          {
            key: "Cache-Control",
            value: "no-store"
          }
        ]
      }
    ];
  },
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "lh3.googleusercontent.com",
        pathname: "/**"
      }
    ]
  }
};

export default withBundleAnalyzer(nextConfig);
