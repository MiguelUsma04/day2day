import React from 'react';
import { createRoot } from 'react-dom/client';

import jakarta400 from '@fontsource/plus-jakarta-sans/files/plus-jakarta-sans-latin-400-normal.woff2';
import jakarta500 from '@fontsource/plus-jakarta-sans/files/plus-jakarta-sans-latin-500-normal.woff2';
import jakarta600 from '@fontsource/plus-jakarta-sans/files/plus-jakarta-sans-latin-600-normal.woff2';
import jakarta700 from '@fontsource/plus-jakarta-sans/files/plus-jakarta-sans-latin-700-normal.woff2';
import ioniconsFont from 'react-native-vector-icons/Fonts/Ionicons.ttf';

import App from '../App';

/**
 * Fonts are registered under the exact family names the design tokens use
 * (one family per weight, React Native style), so no component had to change
 * when the app stopped being built by a native toolchain.
 */
const fontFaces = [
  ['PlusJakartaSans_400Regular', jakarta400, 400],
  ['PlusJakartaSans_500Medium', jakarta500, 500],
  ['PlusJakartaSans_600SemiBold', jakarta600, 600],
  ['PlusJakartaSans_700Bold', jakarta700, 700],
] as const;

const css = [
  ...fontFaces.map(
    ([family, url, weight]) =>
      `@font-face{font-family:'${family}';src:url(${url}) format('woff2');font-weight:${weight};font-style:normal;font-display:swap;}`,
  ),
  `@font-face{font-family:'Ionicons';src:url(${ioniconsFont}) format('truetype');font-display:block;}`,
].join('\n');

const style = document.createElement('style');
style.textContent = css;
document.head.appendChild(style);

const container = document.getElementById('root');
if (!container) throw new Error('#root no existe en index.html');

createRoot(container).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
