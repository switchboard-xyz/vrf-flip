import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react-swc';
import viteTsconfigPaths from 'vite-tsconfig-paths';
import svgrPlugin from 'vite-plugin-svgr';
import { nodePolyfills } from 'vite-plugin-node-polyfills';
import path from 'path';

export default defineConfig((config) => ({
  define: { 'process.env.NODE_ENV': loadEnv(config.mode, process.cwd(), '').APP_ENV },
  plugins: [react(), viteTsconfigPaths(), svgrPlugin(), nodePolyfills({ protocolImports: true })],
  // Open the project in a browser tab when Vite server starts.
  server: { host: true, open: true },
  esbuild: { define: { global: 'globalThis' } },
  optimizeDeps: {
    esbuildOptions: { define: { global: 'globalThis' } },
  },
  build: { outDir: 'build' },
}));
