/**
 * Post-processes the `expo export` output into an installable PWA.
 *
 * Expo emits the bundle and index.html but no manifest, service worker, or the
 * Apple-specific meta tags iOS needs for a home-screen install. This copies the
 * static files from public/ and injects those tags into dist/index.html.
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const DIST = path.join(ROOT, 'dist');
const PUBLIC = path.join(ROOT, 'public');

function copyRecursive(from, to) {
  const stat = fs.statSync(from);
  if (stat.isDirectory()) {
    fs.mkdirSync(to, { recursive: true });
    for (const entry of fs.readdirSync(from)) {
      copyRecursive(path.join(from, entry), path.join(to, entry));
    }
    return;
  }
  fs.mkdirSync(path.dirname(to), { recursive: true });
  fs.copyFileSync(from, to);
}

const HEAD_TAGS = `
    <link rel="manifest" href="/manifest.json" />
    <meta name="apple-mobile-web-app-capable" content="yes" />
    <meta name="apple-mobile-web-app-status-bar-style" content="default" />
    <meta name="apple-mobile-web-app-title" content="day2day" />
    <meta name="mobile-web-app-capable" content="yes" />
    <link rel="apple-touch-icon" href="/icons/icon-180.png" />
    <meta name="color-scheme" content="light dark" />
    <meta
      name="viewport"
      content="width=device-width, initial-scale=1, viewport-fit=cover, user-scalable=yes"
    />`;

const SW_SCRIPT = `
    <script>
      if ('serviceWorker' in navigator) {
        window.addEventListener('load', function () {
          navigator.serviceWorker.register('/sw.js').catch(function () {
            // Offline support is an enhancement; the app still runs without it.
          });
        });
      }
    </script>`;

function main() {
  if (!fs.existsSync(DIST)) {
    console.error('dist/ not found. Run "expo export --platform web" first.');
    process.exit(1);
  }

  if (fs.existsSync(PUBLIC)) {
    copyRecursive(PUBLIC, DIST);
    console.log('Copied public/ into dist/');
  }

  const indexPath = path.join(DIST, 'index.html');
  let html = fs.readFileSync(indexPath, 'utf8');

  // Expo ships a viewport tag with shrink-to-fit; replace it so ours is the only one.
  html = html.replace(/\s*<meta name="viewport"[^>]*>/i, '');

  if (!html.includes('rel="manifest"')) {
    html = html.replace('</head>', `${HEAD_TAGS}\n  </head>`);
  }

  if (!html.includes("serviceWorker")) {
    html = html.replace('</body>', `${SW_SCRIPT}\n  </body>`);
  }

  fs.writeFileSync(indexPath, html);
  console.log('Injected PWA tags into dist/index.html');
}

main();
