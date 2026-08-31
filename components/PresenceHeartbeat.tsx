"use client";

import { useEffect } from "react";
import { createClient } from "@/lib/supabase/client";

const HEARTBEAT_MS = 60_000;

export function PresenceHeartbeat() {
  useEffect(() => {
    const supabase = createClient();

    const heartbeat = () => {
      void supabase.rpc("heartbeat_presence").then(() => undefined);
    };

    heartbeat();
    const interval = window.setInterval(heartbeat, HEARTBEAT_MS);

    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") heartbeat();
    };
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, []);

  return null;
}
