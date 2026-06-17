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

// Pick a meal_type from the local hour
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

    const body = await req.json().catch(() => ({} as Record<string, unknown>));
    const id = body.id ? String(body.id) : null;
    const name = body.name ? String(body.name) : null;
    const tz = body.tz ? String(body.tz) : "America/Chicago";

    if (!id && !name) return json({ error: "Provide a template id or name" }, 400);

    const supabase = createClient(PROJECT_URL, SERVICE_ROLE_KEY);

    // Look up the template by id, or by name/alias (case-insensitive)
    let template: Record<string, any> | null = null;
    if (id) {
      const { data } = await supabase.from("daily_templates").select("*").eq("id", id).single();
      template = data;
    } else if (name) {
      const needle = name.trim().toLowerCase();
      const { data } = await supabase.from("daily_templates").select("*").eq("is_active", true);
      template =
        (data ?? []).find(
          (t: any) =>
            t.name.toLowerCase() === needle ||
            (Array.isArray(t.aliases) && t.aliases.includes(needle)) ||
            needle.includes(t.name.toLowerCase())
        ) ?? null;
    }

    if (!template) return json({ error: "Template not found" }, 404);

    const totals = {
      calories: template.calories,
      protein_g: Number(template.protein_g),
      carbs_g: Number(template.carbs_g),
      fat_g: Number(template.fat_g),
      fiber_g: Number(template.fiber_g),
      ...(template.sugar_g != null ? { sugar_g: Number(template.sugar_g) } : {}),
      ...(template.sodium_mg != null ? { sodium_mg: Number(template.sodium_mg) } : {}),
    };

    const items = [{ name: template.name, qty: "1 serving", ...totals }];

    const { data, error } = await supabase
      .from("meal_logs")
      .insert({
        meal_time: new Date().toISOString(),
        raw_text: template.name,
        meal_type: inferMealType(tz),
        totals,
        items,
        confidence: 1.0,
        assumptions: [],
        template_id: template.id,
      })
      .select()
      .single();

    if (error) return json({ error: "Failed to log template", details: error.message }, 500);

    const speech = `Logged ${template.name}, ${Math.round(totals.calories)} calories, ${Math.round(
      totals.protein_g
    )} grams protein.`;

    return json({ ok: true, id: data.id, meal_time: data.meal_time, totals, speech });
  } catch (error) {
    return json({ error: "Internal server error", details: error instanceof Error ? error.message : "Unknown" }, 500);
  }
});
