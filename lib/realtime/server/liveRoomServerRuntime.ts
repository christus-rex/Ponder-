import { createClient as createAdminClient } from "@supabase/supabase-js";
import { CloudflareRealtimeKitMeetingControlPlane } from "./cloudflareRealtimeKitMeetingControlPlane";
import { createSupabaseLiveRoomLifecycleStore } from "./liveRoomLifecycle";
import { createSupabaseRoomMediaProvisioningStore } from "./roomMediaProvisioning";

export function createLiveRoomServerRuntime() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID?.trim();
  const appId = process.env.REALTIMEKIT_APP_ID?.trim();
  const apiToken = process.env.CLOUDFLARE_REALTIME_API_TOKEN?.trim();

  if (!supabaseUrl || !serviceRoleKey || !accountId || !appId || !apiToken) {
    return null;
  }

  const admin = createAdminClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const allowedApiHosts = (process.env.REALTIMEKIT_ALLOWED_API_HOSTS ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);

  const controlPlane = new CloudflareRealtimeKitMeetingControlPlane({
    accountId,
    appId,
    apiToken,
    ...(process.env.REALTIMEKIT_API_BASE?.trim()
      ? { apiBase: process.env.REALTIMEKIT_API_BASE.trim() }
      : {}),
    ...(allowedApiHosts.length > 0 ? { allowedApiHosts } : {}),
  });

  return {
    roomStore: createSupabaseLiveRoomLifecycleStore(admin),
    mediaStore: createSupabaseRoomMediaProvisioningStore(admin),
    controlPlane,
  };
}
