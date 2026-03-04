import { fileURLToPath } from 'node:url'
import vue from '@vitejs/plugin-vue'
import AutoImport from 'unplugin-auto-import/vite'
import { defineConfig } from 'vitest/config'

const projectRoot = fileURLToPath(new URL('./', import.meta.url))
const appRoot = fileURLToPath(new URL('./app', import.meta.url))
const importsFallback = fileURLToPath(new URL('./tests/mocks/nuxt-imports.ts', import.meta.url))

export default defineConfig({
  plugins: [
    vue(),
    AutoImport({
      dts: false,
      imports: [
        'vue',
        'pinia',
        { 'vue-router': ['onBeforeRouteLeave'] },
      ],
    }),
  ],
  resolve: {
    alias: {
      '~': appRoot,
      '@': appRoot,
      '~~': projectRoot,
      '@@': projectRoot,
      '#imports': importsFallback,
    },
  },
  test: {
    globals: true,
    environment: 'happy-dom',
    setupFiles: ['./tests/setup.ts'],
    include: ['./tests/**/*.spec.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'lcov'],
      reportsDirectory: './coverage',
      include: [
        'app/stores/**',
        'app/utils/**',
        'app/composables/**',
      ],
      exclude: [
        'app/pages/**',
        'app/components/**',
        '**/*.d.ts',
      ],
    },
  },
})
