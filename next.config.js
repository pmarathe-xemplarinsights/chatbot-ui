const withBundleAnalyzer = require("@next/bundle-analyzer")({
  enabled: process.env.ANALYZE === "true"
})

const withPWA = require("next-pwa")({
  dest: "public",
  // Dev: avoid running Workbox/GenerateSW on every webpack rebuild — it runs multiple
  // times in watch mode and can leave server chunks (e.g. ./72.js) out of sync with
  // webpack-runtime.js (missing module errors on /api/* and RSC).
  disable: process.env.NODE_ENV === "development"
})

module.exports = withBundleAnalyzer(
  withPWA({
    reactStrictMode: true,
    images: {
      remotePatterns: [
        {
          protocol: "http",
          hostname: "localhost"
        },
        {
          protocol: "http",
          hostname: "127.0.0.1"
        },
        {
          protocol: "https",
          hostname: "**"
        }
      ]
    },
    experimental: {
      serverComponentsExternalPackages: ["sharp", "onnxruntime-node"]
    },
    // next-pwa triggers multiple server compilations; async chunks can end up under
    // `.next/server/chunks/` while webpack-runtime still does `require("./72.js")`
    // from `.next/server/`, causing MODULE_NOT_FOUND during `next build` / collect.
    webpack: (config, { isServer }) => {
      if (isServer && config.optimization) {
        config.optimization.splitChunks = false
      }
      return config
    }
  })
)
