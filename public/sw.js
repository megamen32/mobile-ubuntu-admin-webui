/**
 * Service Worker for Ubuntu Admin.
 *
 * Responsibilities:
 *  - Display Web Push notifications (failed services alerts)
 *  - Cache app shell for offline use (stale-while-revalidate for navigation)
 *  - Handle notification clicks (focus existing tab or open new)
 *
 * This is intentionally lightweight — we don't try to cache API responses
 * because they're often live data (services, logs, terminal output).
 */

const SW_VERSION = "v1";
const APP_SHELL_CACHE = `ub-admin-shell-${SW_VERSION}`;

// App shell — only the bare minimum for offline loading
const APP_SHELL_URLS = [
  "/",
  "/manifest.json",
  "/logo.svg",
];

// Install: pre-cache app shell
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(APP_SHELL_CACHE).then((cache) => cache.addAll(APP_SHELL_URLS))
  );
  self.skipWaiting();
});

// Activate: clean old caches
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((k) => k !== APP_SHELL_CACHE)
          .map((k) => caches.delete(k))
      )
    )
  );
  self.clients.claim();
});

// Fetch: stale-while-revalidate for navigation, network-first for everything else
self.addEventListener("fetch", (event) => {
  const { request } = event;

  // Skip non-GET and chrome-extension requests
  if (request.method !== "GET" || !request.url.startsWith("http")) return;

  // Skip API requests — they need fresh data
  if (request.url.includes("/api/")) return;

  // Skip xterm CDN
  if (request.url.includes("cdn.jsdelivr.net")) return;

  // Navigation requests — try cache first, fall back to network
  if (request.mode === "navigate") {
    event.respondWith(
      (async () => {
        try {
          const networkResp = await fetch(request);
          // Cache successful navigation responses
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
          return new Response("Offline", { status: 503, statusText: "Offline" });
        }
      })()
    );
    return;
  }

  // Static assets — stale-while-revalidate
  event.respondWith(
    (async () => {
      const cached = await caches.match(request);
      const networkRespPromise = fetch(request)
        .then((resp) => {
          if (resp && resp.ok) {
            const respClone = resp.clone();
            caches.open(APP_SHELL_CACHE).then((cache) => cache.put(request, respClone));
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

      // Focus existing tab if found
      for (const client of allClients) {
        if (client.url.includes(self.location.origin)) {
          if ("focus" in client) {
            await client.focus();
            // Navigate to target URL via postMessage
            client.postMessage({ type: "navigate", url: targetUrl });
            return;
          }
        }
      }

      // Open new tab
      if (self.clients.openWindow) {
        await self.clients.openWindow(targetUrl);
      }
    })()
  );
});

// Message from page — used to trigger navigation in focused tab
self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});
