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

const num = (v: unknown, d = 0) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.max(0, n) : d;
};

// Fields a client can set on a template
function templateFromBody(body: Record<string, unknown>) {
  return {
    name: String(body.name ?? "").trim() || "Untitled",
    aliases: Array.isArray(body.aliases)
      ? (body.aliases as unknown[]).map((a) => String(a).trim().toLowerCase()).filter(Boolean)
      : [],
    calories: Math.round(num(body.calories)),
    protein_g: num(body.protein_g),
    carbs_g: num(body.carbs_g),
    fat_g: num(body.fat_g),
    fiber_g: num(body.fiber_g),
    sugar_g: body.sugar_g === undefined || body.sugar_g === null ? null : num(body.sugar_g),
    sodium_mg: body.sodium_mg === undefined || body.sodium_mg === null ? null : num(body.sodium_mg),
    is_active: body.is_active === undefined ? true : Boolean(body.is_active),
    sort_order: Math.round(num(body.sort_order)),
  };
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    if (!PROJECT_URL || !SERVICE_ROLE_KEY) {
      return json({ error: "Supabase credentials not configured" }, 500);
    }
    const supabase = createClient(PROJECT_URL, SERVICE_ROLE_KEY);

    // GET -> list templates (active first, by sort order)
    if (req.method === "GET") {
      const url = new URL(req.url);
      const includeInactive = url.searchParams.get("all") === "1";
      let q = supabase.from("daily_templates").select("*").order("sort_order").order("created_at");
      if (!includeInactive) q = q.eq("is_active", true);
      const { data, error } = await q;
      if (error) return json({ error: "Failed to load templates", details: error.message }, 500);
      return json({ templates: data ?? [] });
    }

    if (req.method === "POST") {
      const body = await req.json().catch(() => ({} as Record<string, unknown>));
      const action = String(body.action ?? "create");

      if (action === "delete") {
        if (!body.id) return json({ error: "Missing id" }, 400);
        const { error } = await supabase.from("daily_templates").delete().eq("id", body.id);
        if (error) return json({ error: "Failed to delete", details: error.message }, 500);
        return json({ ok: true, id: body.id });
      }

      if (action === "update") {
        if (!body.id) return json({ error: "Missing id" }, 400);
        const { data, error } = await supabase
          .from("daily_templates")
          .update(templateFromBody(body))
          .eq("id", body.id)
          .select()
          .single();
        if (error) return json({ error: "Failed to update", details: error.message }, 500);
        return json({ ok: true, template: data });
      }

      // default: create
      const { data, error } = await supabase
        .from("daily_templates")
        .insert(templateFromBody(body))
        .select()
        .single();
      if (error) return json({ error: "Failed to create", details: error.message }, 500);
      return json({ ok: true, template: data });
    }

    return json({ error: "Method not allowed" }, 405);
  } catch (error) {
    return json({ error: "Internal server error", details: error instanceof Error ? error.message : "Unknown" }, 500);
  }
});
