import { createClient } from "@supabase/supabase-js";

import type { Database } from "./types";

function isPublishableSupabaseApiKey(value: string): boolean {
  return value.startsWith("sb_publishable_");
}

function createSupabaseFetch(supabaseKey: string): typeof fetch {
  return (input, init) => {
    const headers = new Headers(
      typeof Request !== "undefined" && input instanceof Request ? input.headers : undefined,
    );

    if (init?.headers) {
      new Headers(init.headers).forEach((value, key) => headers.set(key, value));
    }

    // New Supabase API keys are opaque strings, not bearer JWTs.
    if (
      isPublishableSupabaseApiKey(supabaseKey) &&
      headers.get("Authorization") === `Bearer ${supabaseKey}`
    ) {
      headers.delete("Authorization");
    }

    headers.set("apikey", supabaseKey);
    return fetch(input, { ...init, headers });
  };
}

const supabaseUrl = import.meta.env["VITE_SUPABASE_URL"];
const supabasePublishableKey = import.meta.env["VITE_SUPABASE_PUBLISHABLE_KEY"];

if (!supabaseUrl || !supabasePublishableKey) {
  throw new Error("Defina VITE_SUPABASE_URL e VITE_SUPABASE_PUBLISHABLE_KEY.");
}

export const supabase = createClient<Database>(supabaseUrl, supabasePublishableKey, {
  global: {
    fetch: createSupabaseFetch(supabasePublishableKey),
  },
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});
