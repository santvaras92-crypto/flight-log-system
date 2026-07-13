"use client";

import { useEffect } from "react";

/**
 * One-shot cleanup of the previous PWA/offline experiment.
 *
 * A service worker was registered by `next-pwa` in earlier builds and is still
 * installed in users' browsers, where it keeps serving stale cached pages. This
 * component unregisters any existing service workers and clears their caches so
 * everyone falls back to normal online-only behavior. It's safe to keep around
 * and is a no-op once there's nothing left to clean.
 */
export default function ServiceWorkerCleanup() {
  useEffect(() => {
    if (typeof window === "undefined") return;

    if ("serviceWorker" in navigator) {
      navigator.serviceWorker
        .getRegistrations()
        .then((regs) => regs.forEach((r) => r.unregister()))
        .catch(() => {});
    }

    if ("caches" in window) {
      caches
        .keys()
        .then((keys) => keys.forEach((k) => caches.delete(k)))
        .catch(() => {});
    }
  }, []);

  return null;
}
