import { createClient } from "@supabase/supabase-js";

// Browser-side client (anon key) used for Realtime subscriptions so the UI can
// refresh the instant the collection job inserts a new reading, rather than
// polling on a fixed timer.
export const supabaseBrowser = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  { realtime: { params: { eventsPerSecond: 2 } } }
);
