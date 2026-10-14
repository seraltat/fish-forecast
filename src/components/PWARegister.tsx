"use client";

import { useEffect } from "react";

export function PWARegister() {
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!("serviceWorker" in navigator)) return;
    const onLoad = () => {
      navigator.serviceWorker
        .register("/sw.js")
        .then(() => {
          if (process.env.NODE_ENV !== "production") {
            console.log("[PWA] Сервис-воркер зарегистрирован");
          }
        })
        .catch((err) => {
          if (process.env.NODE_ENV !== "production") {
            console.warn("[PWA] Ошибка регистрации SW:", err);
          }
        });
    };
    if (document.readyState === "complete") onLoad();
    else window.addEventListener("load", onLoad);
    return () => window.removeEventListener("load", onLoad);
  }, []);

  return null;
}
