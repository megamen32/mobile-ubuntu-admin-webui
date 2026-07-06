/**
 * Service Worker for Ubuntu Admin.
 *
 * Responsibilities:
 *  - Display Web Push notifications (failed services alerts)
 *  - Cache app shell for offline use (stale-while-revalidate for navigation)
 *  - Handle notification clicks (focus existing tab or open new)
 *  - Network-first for API calls, cache-first for static assets
 *  - Offline fallback page when navigation fails and no cache
 */

const SW_VERSION = "v2";
const APP_SHELL_CACHE = `ub-admin-shell-${SW_VERSION}`;
const RUNTIME_CACHE = `ub-admin-runtime-${SW_VERSION}`;

// App shell — only the bare minimum for offline loading.
// Next.js standalone build serves these from /, /manifest.json, /logo.svg
const APP_SHELL_URLS = [
  "/",
  "/manifest.json",
  "/logo.svg",
  "/sw.js",
];

// Install: pre-cache app shell
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(APP_SHELL_CACHE).then((cache) =>
      // addAll fails if any URL fails — use individual puts instead
      Promise.allSettled(APP_SHELL_URLS.map(url => cache.add(url)))
    )
  );
  self.skipWaiting();
});

// Activate: clean old caches
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((k) => k !== APP_SHELL_CACHE && k !== RUNTIME_CACHE)
          .map((k) => caches.delete(k))
      )
    )
  );
  self.clients.claim();
});

// Fetch: route-aware strategy
self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET and chrome-extension requests
  if (request.method !== "GET" || !url.protocol.startsWith("http")) return;

  // Skip cross-origin requests (CDN, etc. — let browser handle them)
  if (url.origin !== self.location.origin) return;

  // === API requests ===
  // Network-first — always try to get fresh data. On failure, return cached
  // if available, otherwise let the request fail (app handles it).
  if (url.pathname.startsWith("/api/")) {
    // Skip PTY output long-polling — it would hold the SW busy
    if (url.pathname.startsWith("/api/pty/output")) return;
    // Skip notifications polling
    if (url.pathname.startsWith("/api/notifications/failed-services")) return;

    event.respondWith(
      (async () => {
        try {
          const networkResp = await fetch(request);
          // Cache successful GET responses (for offline read)
          if (networkResp.ok && request.method === "GET") {
            const respClone = networkResp.clone();
            caches.open(RUNTIME_CACHE).then((cache) => cache.put(request, respClone));
          }
          return networkResp;
        } catch {
          // Network failed — try cache
          const cached = await caches.match(request);
          if (cached) return cached;
          // Return a 503 with offline marker — app can detect this
          return new Response(
            JSON.stringify({ error: "offline", message: "Network unavailable" }),
            {
              status: 503,
              headers: { "Content-Type": "application/json", "X-Offline": "true" },
            }
          );
        }
      })()
    );
    return;
  }

  // === Navigation requests ===
  if (request.mode === "navigate") {
    event.respondWith(
      (async () => {
        try {
          const networkResp = await fetch(request);
          if (networkResp.ok) {
            const cache = await caches.open(APP_SHELL_CACHE);
            cache.put(request, networkResp.clone());
          }
          return networkResp;
        } catch {
          // Network failed — try cache, then offline fallback
          const cached = await caches.match(request);
          if (cached) return cached;
          const rootCached = await caches.match("/");
          if (rootCached) return rootCached;
          // Last resort: synthetic offline page
          return new Response(
            `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>Offline</title>
<style>body{background:#1a0e1a;color:#e0d8d8;font-family:system-ui;padding:2rem;text-align:center}
h1{color:#e95420}a{color:#3b73d4}</style></head>
<body><h1>You're offline</h1>
<p>The Ubuntu Admin panel can't reach the server.</p>
<p>Once your connection is back, this page will reload automatically.</p>
<p><a href="/">Try again</a></p>
<script>setTimeout(() => location.reload(), 5000);</script>
</body></html>`,
            { status: 503, headers: { "Content-Type": "text/html" } }
          );
        }
      })()
    );
    return;
  }

  // === Static assets (JS, CSS, images) ===
  // Stale-while-revalidate — return cache immediately, refresh in background
  event.respondWith(
    (async () => {
      const cached = await caches.match(request);
      const networkRespPromise = fetch(request)
        .then((resp) => {
          if (resp && resp.ok) {
            const respClone = resp.clone();
            caches.open(RUNTIME_CACHE).then((cache) => cache.put(request, respClone));
          }
          return resp;
        })
        .catch(() => null);
      return cached || (await networkRespPromise) || new Response("", { status: 504 });
    })()
  );
});

// Push event — display notification
self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = JSON.parse(event.data?.text() || "{}");
  } catch { /* ignore parse errors */ }

  const title = data.title || "Ubuntu Admin";
  const options = {
    body: data.body || "",
    icon: "/logo.svg",
    badge: "/logo.svg",
    tag: data.tag || "default",
    renotify: data.renotify || false,
    requireInteraction: data.requireInteraction || false,
    data: data.data || {},
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

// Notification click — focus or open tab
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const targetUrl = event.notification.data?.url || "/";

  event.waitUntil(
    (async () => {
      const allClients = await self.clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      });

      for (const client of allClients) {
        if (client.url.includes(self.location.origin)) {
          if ("focus" in client) {
            await client.focus();
            client.postMessage({ type: "navigate", url: targetUrl });
            return;
          }
        }
      }

      if (self.clients.openWindow) {
        await self.clients.openWindow(targetUrl);
      }
    })()
  );
});

// Message from page
self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
  if (event.data?.type === "PROCESS_QUEUE") {
    // Tell all clients to process their offline queues
    self.clients.matchAll({ includeUncontrolled: true }).then((clients) => {
      clients.forEach((c) => c.postMessage({ type: "PROCESS_QUEUE" }));
    });
  }
});
