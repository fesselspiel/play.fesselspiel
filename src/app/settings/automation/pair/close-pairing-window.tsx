"use client";

import { useEffect } from "react";

export function ClosePairingWindow() {
  useEffect(() => {
    if (!window.opener || window.opener.closed) return;
    window.opener.focus();
    const timer = window.setTimeout(() => window.close(), 1800);
    return () => window.clearTimeout(timer);
  }, []);

  return null;
}
