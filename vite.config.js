import { defineConfig } from 'vite'
import { createVuePlugin as vue } from "vite-plugin-vue2"
import { viteCommonjs } from '@originjs/vite-plugin-commonjs'
import * as path from 'path'

export default defineConfig({
  plugins: [
    vue(),
    viteCommonjs(),
  ],
  resolve: {
    extensions: ['.mjs', '.js', '.ts', '.jsx', '.tsx', '.json', '.vue'],
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    port: 1024,
  }
})
