import { defineConfig } from 'vite';
import dts from 'vite-plugin-dts';

export default defineConfig({
  plugins: [
    dts({ rollupTypes: true }),
  ],
  build: {
    lib: {
      entry: 'src/index.ts',
      name: 'Wema',
      formats: ['es', 'umd'],
      fileName: (format) => format === 'es' ? 'wema.js' : 'wema.umd.js',
    },
    sourcemap: true,
  },
  test: {
    environment: 'jsdom',
    exclude: ['**/node_modules/**', '**/dist/**'],
  },
});
