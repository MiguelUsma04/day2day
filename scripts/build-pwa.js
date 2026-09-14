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
    <link rel="apple-touch-icon" sizes="180x180" href="/icons/icon-180.png" />
    <link rel="apple-touch-icon" sizes="167x167" href="/icons/icon-167.png" />
    <link rel="apple-touch-icon" sizes="152x152" href="/icons/icon-152.png" />
    <link rel="apple-touch-icon" sizes="120x120" href="/icons/icon-120.png" />
    <meta name="color-scheme" content="light dark" />
    <meta
      name="viewport"
      content="width=device-width, initial-scale=1, viewport-fit=cover, user-scalable=yes"
    />`;

const SW_SCRIPT = `
    <script>
      if ('serviceWorker' in navigator) {
        window.addEventListener('load', function () {
          navigator.serviceWorker.register('/sw.js').then(function (reg) {
            // An installed PWA is usually resumed, not reloaded, so poll for a
            // new build on launch and whenever it returns to the foreground.
            var check = function () { reg.update().catch(function () {}); };
            document.addEventListener('visibilitychange', function () {
              if (document.visibilityState === 'visible') check();
            });
            setInterval(check, 60 * 60 * 1000);

            reg.addEventListener('updatefound', function () {
              var next = reg.installing;
              if (!next) return;
              next.addEventListener('statechange', function () {
                // Only reload for a genuine replacement, never the first install.
                if (next.state === 'installed' && navigator.serviceWorker.controller) {
                  next.postMessage('SKIP_WAITING');
                }
              });
            });
          }).catch(function () {
            // Offline support is an enhancement; the app still runs without it.
          });

          var refreshed = false;
          navigator.serviceWorker.addEventListener('controllerchange', function () {
            if (refreshed) return;
            refreshed = true;
            window.location.reload();
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
