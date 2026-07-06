"use client";

import { useEffect, useState, useCallback } from "react";
import { useHashRoute } from "@/lib/use-hash-route";

interface FailedServicesResponse {
  failed: string[];
  newlyFailed: string[];
  recovered: string[];
  totalFailed: number;
}

/**
 * useFailedServicesNotifications
 *
 * Sets up:
 *  1. Service Worker registration (for push notifications + offline cache)
 *  2. Web Push subscription (asks user for notification permission)
 *  3. Polling /api/notifications/failed-services every 60s
 *  4. Browser notification when new failed services appear (in addition to push)
 *
 * Returns:
 *  - permission: current Notification.permission state
 *  - failedCount: number of currently-failed services
 *  - enabled: whether push is active
 *  - enable(): ask for permission and subscribe
 *  - disable(): unsubscribe
 */
export function useFailedServicesNotifications() {
  const [, navigate] = useHashRoute();
  const [permission, setPermission] = useState<NotificationPermission>("default");
  const [failedCount, setFailedCount] = useState(0);
  const [enabled, setEnabled] = useState(false);
  const [swReg, setSwReg] = useState<ServiceWorkerRegistration | null>(null);

  // Register service worker on mount
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!("serviceWorker" in navigator)) return;

    (async () => {
      try {
        const reg = await navigator.serviceWorker.register("/sw.js", { scope: "/" });
        setSwReg(reg);
        console.log("[notifications] SW registered:", reg.scope);
      } catch (e) {
        console.warn("[notifications] SW registration failed:", e);
      }
    })();
  }, []);

  // Sync permission state
  useEffect(() => {
    if (typeof window === "undefined" || !("Notification" in window)) return;
    setPermission(Notification.permission);
  }, []);

  // Poll failed services every 60s
  useEffect(() => {
    let cancelled = false;
    let timer: NodeJS.Timeout;

    async function poll() {
      try {
        // Read auth from localStorage
        const raw = localStorage.getItem("ub-admin:auth");
        if (!raw) return;
        const a = JSON.parse(raw);
        const auth = "Basic " + btoa(`${a.username}:${a.password}`);

        const res = await fetch("/api/notifications/failed-services", {
          headers: { Authorization: auth },
        });
        if (!res.ok) return;
        const data: FailedServicesResponse = await res.json();
        if (cancelled) return;

        setFailedCount(data.totalFailed);

        // If we have permission and there are newly-failed services, also show
        // a local notification (in addition to push, for instant feedback)
        if (data.newlyFailed.length > 0 && "Notification" in window && Notification.permission === "granted") {
          const title = `🔴 ${data.newlyFailed.length} service(s) failed`;
          const body = data.newlyFailed.slice(0, 3).join(", ") +
            (data.newlyFailed.length > 3 ? ` (+${data.newlyFailed.length - 3} more)` : "");
          try {
            // Use SW registration if available, else fallback to plain Notification
            if (swReg) {
              await swReg.showNotification(title, {
                body,
                icon: "/logo.svg",
                tag: "failed-services",
                renotify: true,
                requireInteraction: true,
                data: { url: "/#/services" },
              });
            } else {
              new Notification(title, { body, icon: "/logo.svg" });
            }
          } catch { /* ignore */ }
        }
      } catch { /* ignore */ }
    }

    poll();
    timer = setInterval(poll, 60_000);

    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [swReg]);

  // Listen for navigation messages from SW (notification click)
  useEffect(() => {
    if (typeof navigator === "undefined" || !navigator.serviceWorker) return;
    const handler = (event: MessageEvent) => {
      if (event.data?.type === "navigate" && event.data.url) {
        // Strip the leading "/#" — our hash router handles the rest
        const target = event.data.url.replace(/^\/?#/, "");
        navigate(target || "/");
      }
    };
    navigator.serviceWorker.addEventListener("message", handler);
    return () => navigator.serviceWorker.removeEventListener("message", handler);
  }, [navigate]);

  const enable = useCallback(async () => {
    if (!swReg) {
      toast.error("Service Worker not ready yet");
      return;
    }
    try {
      // Ask for notification permission
      const perm = await Notification.requestPermission();
      setPermission(perm);
      if (perm !== "granted") {
        toast.error("Notifications denied");
        return;
      }

      // Get VAPID public key
      const raw = localStorage.getItem("ub-admin:auth");
      if (!raw) return;
      const a = JSON.parse(raw);
      const auth = "Basic " + btoa(`${a.username}:${a.password}`);

      const vapidRes = await fetch("/api/notifications/vapid", {
        headers: { Authorization: auth },
      });
      if (!vapidRes.ok) throw new Error("Failed to get VAPID key");
      const { publicKey } = await vapidRes.json();

      // Subscribe via PushManager
      const sub = await swReg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey),
      });

      // Send subscription to server
      const deviceId = getDeviceId();
      await fetch("/api/notifications/subscribe", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": auth,
        },
        body: JSON.stringify({
          endpoint: sub.endpoint,
          keys: sub.toJSON().keys,
          deviceId,
        }),
      });

      setEnabled(true);
      toast.success("Push notifications enabled");
    } catch (e: any) {
      console.error("[notifications] enable failed:", e);
      toast.error(`Failed: ${e?.message}`);
    }
  }, [swReg]);

  const disable = useCallback(async () => {
    if (!swReg) return;
    try {
      const sub = await swReg.pushManager.getSubscription();
      if (sub) {
        await sub.unsubscribe();
        const raw = localStorage.getItem("ub-admin:auth");
        if (raw) {
          const a = JSON.parse(raw);
          const auth = "Basic " + btoa(`${a.username}:${a.password}`);
          await fetch("/api/notifications/subscribe", {
            method: "DELETE",
            headers: {
              "Content-Type": "application/json",
              "Authorization": auth,
            },
            body: JSON.stringify({ endpoint: sub.endpoint }),
          });
        }
      }
      setEnabled(false);
      toast.success("Push notifications disabled");
    } catch (e: any) {
      console.error("[notifications] disable failed:", e);
    }
  }, [swReg]);

  return { permission, failedCount, enabled, enable, disable };
}

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  const output = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    output[i] = rawData.charCodeAt(i);
  }
  return output;
}

function getDeviceId(): string {
  const KEY = "ub-admin:device-id";
  let id = localStorage.getItem(KEY);
  if (!id) {
    id = `${navigator.userAgent.slice(0, 20)}-${Date.now().toString(36)}`;
    localStorage.setItem(KEY, id);
  }
  return id;
}

// Sonner import here to avoid circular dep issues
import { toast } from "sonner";
