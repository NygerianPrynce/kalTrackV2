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

const num = (v: unknown) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.max(0, n) : 0;
};
const r1 = (n: number) => Math.round(n * 10) / 10;

function inferMealType(tz: string): string {
  const hour = Number(
    new Intl.DateTimeFormat("en-US", { timeZone: tz, hour: "2-digit", hour12: false }).format(new Date())
  );
  if (hour >= 4 && hour < 11) return "breakfast";
  if (hour >= 11 && hour < 16) return "lunch";
  if (hour >= 16 && hour < 22) return "dinner";
  return "snack";
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
    if (!PROJECT_URL || !SERVICE_ROLE_KEY) return json({ error: "Supabase credentials not configured" }, 500);

    const body = await req.json().catch(() => ({} as Record<string, any>));
    const rawItems = Array.isArray(body.items) ? body.items : [];
    if (rawItems.length === 0) return json({ error: "No items to save" }, 400);

    const tz = body.tz ? String(body.tz) : "America/Chicago";

    // Normalize each item the client confirmed/edited
    const items = rawItems.map((it: any) => {
      const item: Record<string, any> = {
        name: String(it.name ?? "Item").trim() || "Item",
        qty: String(it.qty ?? "1 serving"),
        calories: Math.round(num(it.calories)),
        protein_g: r1(num(it.protein_g)),
        carbs_g: r1(num(it.carbs_g)),
        fat_g: r1(num(it.fat_g)),
        fiber_g: r1(num(it.fiber_g)),
      };
      if (it.sugar_g !== undefined && it.sugar_g !== null) item.sugar_g = r1(num(it.sugar_g));
      if (it.sodium_mg !== undefined && it.sodium_mg !== null) item.sodium_mg = r1(num(it.sodium_mg));
      return item;
    });

    // Recompute totals from the (possibly edited) items so they always agree
    const totals: Record<string, number> = {
      calories: Math.round(items.reduce((s, i) => s + i.calories, 0)),
      protein_g: r1(items.reduce((s, i) => s + i.protein_g, 0)),
      carbs_g: r1(items.reduce((s, i) => s + i.carbs_g, 0)),
      fat_g: r1(items.reduce((s, i) => s + i.fat_g, 0)),
      fiber_g: r1(items.reduce((s, i) => s + i.fiber_g, 0)),
    };
    if (items.some((i) => i.sugar_g !== undefined))
      totals.sugar_g = r1(items.reduce((s, i) => s + (i.sugar_g || 0), 0));
    if (items.some((i) => i.sodium_mg !== undefined))
      totals.sodium_mg = r1(items.reduce((s, i) => s + (i.sodium_mg || 0), 0));

    const supabase = createClient(PROJECT_URL, SERVICE_ROLE_KEY);
    const { data, error } = await supabase
      .from("meal_logs")
      .insert({
        meal_time: new Date().toISOString(),
        raw_text: body.raw_text ? String(body.raw_text) : items.map((i) => i.name).join(", "),
        meal_type: body.meal_type ? String(body.meal_type) : inferMealType(tz),
        totals,
        items,
        confidence: body.confidence != null ? Number(body.confidence) : 1.0,
        assumptions: Array.isArray(body.assumptions) ? body.assumptions.map(String) : [],
      })
      .select()
      .single();

    if (error) return json({ error: "Failed to save meal", details: error.message }, 500);

    return json({ ok: true, id: data.id, meal_time: data.meal_time, totals });
  } catch (error) {
    return json({ error: "Internal server error", details: error instanceof Error ? error.message : "Unknown" }, 500);
  }
});
