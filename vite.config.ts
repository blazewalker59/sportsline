import { defineConfig } from 'vitest/config'
import tsconfigPaths from 'vite-tsconfig-paths'
import { devtools } from '@tanstack/devtools-vite'
import { tanstackStart } from '@tanstack/react-start/plugin/vite'
import viteReact from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { cloudflare } from '@cloudflare/vite-plugin'

const isTest = process.env.VITEST === 'true'

const config = defineConfig({
  define: {
    // Surfaced by `GET /health` as `version`. CI builds carry the deploying
    // commit; local builds report nothing.
    __SPORTSLINE_VERSION__: JSON.stringify(process.env.GITHUB_SHA ?? ''),
  },
  test: {
    globals: true,
    environment: 'node',
    include: ['src/__tests__/**/*.test.{ts,tsx}'],
    // Bun reports `__esModule` on every ESM namespace, so Vitest's CJS
    // interop mistakes packages like zod for CJS and swaps in their
    // `default` (dropping `z`). Bun does its own CJS interop natively.
    deps: { interopDefault: !process.versions.bun },
  },
  plugins: [
    tsconfigPaths(),
    devtools(),
    // Cloudflare plugin conflicts with Vitest (sets resolve.external for SSR).
    !isTest && cloudflare({ viteEnvironment: { name: 'ssr' } }),
    tailwindcss(),
    tanstackStart(),
    viteReact(),
  ],
})

export default config
