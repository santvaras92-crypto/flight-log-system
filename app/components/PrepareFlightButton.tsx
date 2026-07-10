"use client";

import { useEffect, useState } from "react";
import { Icon } from "./Icon";

// Key in-app routes to make available offline. Fetching each one through the
// active service worker populates its runtime caches (HTML + data + assets).
const ROUTES_TO_CACHE = [
  "/",
  "/admin/dashboard",
  "/admin/validacion",
];

type Status = "idle" | "working" | "done" | "error" | "offline";

const LAST_PREP_KEY = "flightlog:lastOfflinePrep";

export default function PrepareFlightButton() {
  const [status, setStatus] = useState<Status>("idle");
  const [progress, setProgress] = useState(0);
  const [lastPrep, setLastPrep] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    setLastPrep(localStorage.getItem(LAST_PREP_KEY));
  }, []);

  const prepare = async () => {
    if (!navigator.onLine) {
      setStatus("offline");
      return;
    }
    setStatus("working");
    setProgress(0);

    try {
      // Ensure the service worker is active before we warm the caches.
      if ("serviceWorker" in navigator) {
        await navigator.serviceWorker.ready;
      }

      const total = ROUTES_TO_CACHE.length;
      let done = 0;

      for (const route of ROUTES_TO_CACHE) {
        try {
          // Fetch through the SW so runtimeCaching stores the response.
          const res = await fetch(route, {
            credentials: "include",
            cache: "reload",
          });
          // Also store explicitly in the SW pages cache as a safety net.
          if (res.ok && "caches" in window) {
            try {
              const cache = await caches.open("pages-cache");
              await cache.put(route, res.clone());
            } catch {
              /* cache.put may fail on opaque/redirected responses — ignore */
            }
          }
        } catch {
          /* individual route failure shouldn't abort the whole prep */
        }
        done += 1;
        setProgress(Math.round((done / total) * 100));
      }

      const now = new Date().toISOString();
      localStorage.setItem(LAST_PREP_KEY, now);
      setLastPrep(now);
      setStatus("done");
    } catch {
      setStatus("error");
    }
  };

  const fmtLast = (iso: string | null) => {
    if (!iso) return null;
    const d = new Date(iso);
    return d.toLocaleString("en-US", {
      day: "numeric",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  return (
    <>
      <button
        onClick={() => {
          setOpen(true);
          setStatus("idle");
        }}
        title="Prepare app for offline use (flight mode)"
        className="px-2 sm:px-4 py-2 text-[10px] sm:text-sm font-semibold text-blue-100 hover:text-white hover:bg-white/15 rounded-lg transition-all"
      >
        <span className="hidden sm:inline">Flight prep</span>
        <span className="sm:hidden"><Icon name="airframe" className="w-5 h-5" title="Flight prep" /></span>
      </button>

      {open && (
        <div
          className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
          onClick={() => status !== "working" && setOpen(false)}
        >
          <div
            className="w-full max-w-sm bg-white dark:bg-card border border-slate-200 dark:border-edge rounded-2xl shadow-2xl p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-3 mb-4">
              <div className="w-11 h-11 rounded-xl bg-blue-100 dark:bg-blue-500/15 flex items-center justify-center">
                <Icon name="airframe" className="w-6 h-6 text-blue-600 dark:text-blue-400" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900 dark:text-foreground">Prepare for flight</h3>
                <p className="text-xs text-slate-500 dark:text-muted-foreground">Save sections for offline use</p>
              </div>
            </div>

            <p className="text-sm text-slate-600 dark:text-foreground-soft mb-4">
              This downloads the main sections and their latest data so you can browse them
              without connection during the flight. Run it on the ground, with internet.
            </p>

            {status === "working" && (
              <div className="mb-4">
                <div className="w-full h-2 rounded-full bg-slate-100 dark:bg-muted overflow-hidden">
                  <div
                    className="h-full bg-blue-500 transition-all duration-300"
                    style={{ width: `${progress}%` }}
                  />
                </div>
                <p className="text-xs text-slate-500 dark:text-muted-foreground mt-2 text-center">
                  Saving… {progress}%
                </p>
              </div>
            )}

            {status === "done" && (
              <div className="mb-4 flex items-center gap-2 px-3 py-2.5 rounded-lg bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 text-sm font-medium">
                <Icon name="checkCircle" className="w-5 h-5 shrink-0" />
                Ready to fly offline. Keep the app open during the flight.
              </div>
            )}

            {status === "offline" && (
              <div className="mb-4 flex items-center gap-2 px-3 py-2.5 rounded-lg bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-300 text-sm font-medium">
                <Icon name="warning" className="w-5 h-5 shrink-0" />
                You're offline. Connect to the internet first.
              </div>
            )}

            {status === "error" && (
              <div className="mb-4 flex items-center gap-2 px-3 py-2.5 rounded-lg bg-red-50 dark:bg-red-500/10 text-red-700 dark:text-red-300 text-sm font-medium">
                <Icon name="warning" className="w-5 h-5 shrink-0" />
                Something went wrong. Try again.
              </div>
            )}

            {lastPrep && status !== "working" && (
              <p className="text-[11px] text-slate-400 dark:text-faint mb-4 text-center">
                Last prepared: {fmtLast(lastPrep)}
              </p>
            )}

            <div className="flex gap-2">
              <button
                onClick={() => setOpen(false)}
                disabled={status === "working"}
                className="flex-1 px-4 py-2.5 rounded-lg text-sm font-semibold text-slate-600 dark:text-foreground-soft bg-slate-100 dark:bg-muted hover:bg-slate-200 dark:hover:bg-edge-strong transition-colors disabled:opacity-50"
              >
                {status === "done" ? "Close" : "Cancel"}
              </button>
              {status !== "done" && (
                <button
                  onClick={prepare}
                  disabled={status === "working"}
                  className="flex-1 px-4 py-2.5 rounded-lg text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 transition-colors disabled:opacity-50 inline-flex items-center justify-center gap-2"
                >
                  {status === "working" ? "Saving…" : "Prepare now"}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
