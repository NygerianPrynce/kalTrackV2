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

// Parse a free-text water amount like "16oz", "2 cups", "500 ml", "a glass" -> ounces
export function parseWaterOz(text: string): number | null {
  const t = text.toLowerCase();
  const m = t.match(/(\d+(?:\.\d+)?)\s*(fl\s*oz|oz|ounce|ounces|cups?|glass(?:es)?|bottles?|ml|l|liters?|litres?)?/);
  if (!m) {
    // bare words with no number
    if (/glass/.test(t)) return 8;
    if (/bottle/.test(t)) return 16.9;
    if (/cup/.test(t)) return 8;
    return null;
  }
  const amount = parseFloat(m[1]);
  if (!Number.isFinite(amount)) return null;
  const unit = (m[2] || "oz").replace(/\s+/g, "");
  switch (true) {
    case /^(floz|oz|ounce|ounces)$/.test(unit):
      return amount;
    case /^cups?$/.test(unit):
      return amount * 8;
    case /^glass(es)?$/.test(unit):
      return amount * 8;
    case /^bottles?$/.test(unit):
      return amount * 16.9;
    case /^ml$/.test(unit):
      return amount * 0.033814;
    case /^(l|liters?|litres?)$/.test(unit):
      return amount * 33.814;
    default:
      return amount;
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
    if (!PROJECT_URL || !SERVICE_ROLE_KEY) return json({ error: "Supabase credentials not configured" }, 500);

    const body = await req.json().catch(() => ({} as Record<string, unknown>));
    let amount_oz: number | null = null;

    if (body.amount_oz !== undefined && body.amount_oz !== null) {
      amount_oz = Number(body.amount_oz);
    } else if (typeof body.text === "string") {
      amount_oz = parseWaterOz(body.text);
    }

    // Allow negative amounts as corrections (e.g. -8 to undo a glass)
    if (amount_oz === null || !Number.isFinite(amount_oz) || amount_oz === 0) {
      return json({ error: "Could not determine a water amount" }, 400);
    }
    amount_oz = Math.round(amount_oz * 10) / 10;

    const supabase = createClient(PROJECT_URL, SERVICE_ROLE_KEY);
    const { data, error } = await supabase
      .from("water_logs")
      .insert({ logged_at: new Date().toISOString(), amount_oz, note: body.note ? String(body.note) : null })
      .select()
      .single();

    if (error) return json({ error: "Failed to log water", details: error.message }, 500);

    return json({
      ok: true,
      id: data.id,
      amount_oz,
      speech:
        amount_oz < 0
          ? `Removed ${Math.abs(amount_oz)} ounces of water.`
          : `Logged ${amount_oz} ounces of water.`,
    });
  } catch (error) {
    return json({ error: "Internal server error", details: error instanceof Error ? error.message : "Unknown" }, 500);
  }
});
