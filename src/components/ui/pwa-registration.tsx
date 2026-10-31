"use client";
import { useEffect } from 'react';
export function PwaRegistration() {
  useEffect(() => {
    if (process.env.NODE_ENV !== 'production' || !window.isSecureContext || !('serviceWorker' in navigator)) return;
    let active = true;
    let registration: ServiceWorkerRegistration | undefined;
    const update = () => { if (active && navigator.onLine) void registration?.update().catch(() => {}); };
    void navigator.serviceWorker.register('/sw.js', { scope: '/', updateViaCache: 'none' }).then(value => {
      if (active) registration = value;
    }).catch(() => { /* Installation must never block the app or authentication. */ });
    window.addEventListener('online', update);
    window.addEventListener('pageshow', update);
    return () => { active = false; window.removeEventListener('online', update); window.removeEventListener('pageshow', update); };
  }, []);
  return null;
}
