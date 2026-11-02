import { fileURLToPath } from 'node:url';

import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

/**
 * The UI is written against the React Native component API and rendered on
 * the web by react-native-web, so `react-native` is aliased to it and the
 * `.web.*` variants that libraries ship are preferred over their native ones.
 */
const extensions = [
  '.web.tsx',
  '.web.ts',
  '.web.jsx',
  '.web.js',
  '.tsx',
  '.ts',
  '.jsx',
  '.js',
  '.mjs',
  '.json',
];

export default defineConfig(({ mode }) => ({
  plugins: [react()],
  resolve: {
    alias: [
      // Native-only internals a few libraries import; see the shim for why.
      {
        find: /^react-native\/Libraries\/.*/,
        replacement: fileURLToPath(
          new URL('./src/shims/react-native-internals.ts', import.meta.url),
        ),
      },
      {
        find: /^react-native$/,
        replacement: fileURLToPath(new URL('./src/shims/react-native.ts', import.meta.url)),
      },
    ],
    extensions,
  },
  define: {
    // React Native libraries read these globals; the web has no equivalent.
    __DEV__: JSON.stringify(mode !== 'production'),
    'process.env.NODE_ENV': JSON.stringify(mode),
    global: 'globalThis',
  },
  optimizeDeps: {
    // The pre-bundler does not honour `.web.js` variants, so it would pull the
    // native entry points of these libraries. Served as source instead, they
    // resolve through Vite's resolver (which does); their CommonJS
    // dependencies still get pre-bundled.
    exclude: [
      'react-native-gesture-handler',
      'react-native-safe-area-context',
      '@react-native-async-storage/async-storage',
    ],
    include: [
      'react-native-web',
      'react-native-gesture-handler > @egjs/hammerjs',
      'react-native-gesture-handler > hoist-non-react-statics',
      'react-native-gesture-handler > invariant',
      '@react-native-async-storage/async-storage > merge-options',
    ],
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
  server: {
    // `vercel dev` serves the push API on 3000; plain `vite` proxies to it.
    proxy: { '/api': 'http://localhost:3000' },
  },
}));
