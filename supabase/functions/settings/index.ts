import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const PROJECT_URL = Deno.env.get("PROJECT_URL") ?? Deno.env.get("SUPABASE_URL");
const SERVICE_ROLE_KEY = Deno.env.get("SERVICE_ROLE_KEY") ?? Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

// Only these columns are writable from the client
const ALLOWED = [
  "calories_goal",
  "protein_goal_g",
  "carbs_goal_g",
  "fat_goal_g",
  "fiber_goal_g",
  "sugar_goal_g",
  "sodium_goal_mg",
  "water_goal_oz",
  "timezone",
];

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    if (!PROJECT_URL || !SERVICE_ROLE_KEY) {
      return json({ error: "Supabase credentials not configured" }, 500);
    }
    const supabase = createClient(PROJECT_URL, SERVICE_ROLE_KEY);

    if (req.method === "GET") {
      const { data, error } = await supabase
        .from("user_settings")
        .select("*")
        .eq("id", 1)
        .single();
      if (error) return json({ error: "Failed to load settings", details: error.message }, 500);
      return json(data);
    }

    if (req.method === "POST") {
      const body = await req.json().catch(() => ({}));
      const patch: Record<string, unknown> = { id: 1, updated_at: new Date().toISOString() };
      for (const key of ALLOWED) {
        if (body[key] !== undefined && body[key] !== null) patch[key] = body[key];
      }
      const { data, error } = await supabase
        .from("user_settings")
        .upsert(patch, { onConflict: "id" })
        .select()
        .single();
      if (error) return json({ error: "Failed to save settings", details: error.message }, 500);
      return json({ ok: true, settings: data });
    }

    return json({ error: "Method not allowed" }, 405);
  } catch (error) {
    return json({ error: "Internal server error", details: error instanceof Error ? error.message : "Unknown" }, 500);
  }
});
