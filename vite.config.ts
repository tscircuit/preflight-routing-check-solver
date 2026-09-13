import { defineConfig } from "vite"
import { fileURLToPath } from "node:url"

export default defineConfig({
  resolve: {
    alias: {
      lib: fileURLToPath(new URL("./lib", import.meta.url)),
      tests: fileURLToPath(new URL("./tests", import.meta.url)),
    },
  },
})
