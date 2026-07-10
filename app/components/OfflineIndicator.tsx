"use client";

import { useEffect, useState } from "react";

/**
 * Global connectivity indicator.
 * - Shows a persistent banner while the browser is offline, letting the user
 *   know they are viewing cached (last-known) data served by the PWA service worker.
 * - Shows a brief "reconnected" toast when connectivity is restored.
 *
 * The dashboard is server-rendered, so when offline the service worker serves the
 * last cached HTML (with its data baked in). This component makes that state visible.
 */
export default function OfflineIndicator() {
  // `null` until mounted to avoid hydration mismatch (navigator is client-only)
  const [online, setOnline] = useState<boolean | null>(null);
  const [showReconnected, setShowReconnected] = useState(false);

  useEffect(() => {
    setOnline(navigator.onLine);

    const handleOnline = () => {
      setOnline(true);
      setShowReconnected(true);
      window.setTimeout(() => setShowReconnected(false), 3000);
    };
    const handleOffline = () => setOnline(false);

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  // Not mounted yet, or online with no reconnect toast pending → render nothing
  if (online === null) return null;

  if (!online) {
    return (
      <div
        role="status"
        aria-live="polite"
        className="fixed bottom-0 inset-x-0 z-[100] flex items-center justify-center gap-2 px-4 py-2 bg-amber-500 text-amber-950 text-xs sm:text-sm font-semibold shadow-lg"
      >
        <span className="relative flex h-2 w-2">
          <span className="absolute inline-flex h-full w-full rounded-full bg-amber-900/40 animate-ping" />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-amber-900" />
        </span>
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M18.364 5.636a9 9 0 010 12.728m0 0l-2.829-2.829m2.829 2.829L21 21M15.536 8.464a5 5 0 010 7.072m0 0l-2.829-2.829m-4.243 2.829a4.978 4.978 0 01-1.414-2.83m-1.414 5.658a9 9 0 01-2.167-9.238m7.824 2.167a1 1 0 111.414 1.414m-1.414-1.414L3 3m8.293 8.293l1.414 1.414" />
        </svg>
        <span>No connection — showing saved data</span>
      </div>
    );
  }

  if (showReconnected) {
    return (
      <div
        role="status"
        aria-live="polite"
        className="fixed bottom-0 inset-x-0 z-[100] flex items-center justify-center gap-2 px-4 py-2 bg-emerald-500 text-emerald-950 text-xs sm:text-sm font-semibold shadow-lg"
      >
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
        </svg>
        <span>Back online</span>
      </div>
    );
  }

  return null;
}
