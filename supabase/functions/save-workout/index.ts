import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const PROJECT_URL = Deno.env.get("PROJECT_URL") ?? Deno.env.get("SUPABASE_URL");
const SERVICE_ROLE_KEY = Deno.env.get("SERVICE_ROLE_KEY") ?? Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

const MUSCLES = [
  "chest", "shoulders", "back", "lats", "traps", "biceps", "triceps",
  "forearms", "abs", "obliques", "quads", "hamstrings", "glutes", "calves",
  "lower_back", "cardio",
];

const n = (v: unknown) => Math.max(0, Number(v) || 0);

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
    if (!PROJECT_URL || !SERVICE_ROLE_KEY) return json({ error: "Supabase credentials not configured" }, 500);

    const body = await req.json().catch(() => ({} as any));
    const rawItems = Array.isArray(body.items) ? body.items : [];
    if (rawItems.length === 0) return json({ error: "No exercises to save" }, 400);

    const items = rawItems.map((it: any) => {
      const groups = (Array.isArray(it.muscle_groups) ? it.muscle_groups : [])
        .map((m: any) => String(m).toLowerCase().trim().replace(/\s+/g, "_"))
        .filter((m: string) => MUSCLES.includes(m));
      return {
        name: String(it.name ?? "Exercise").trim() || "Exercise",
        muscle_groups: groups.length ? Array.from(new Set(groups)) : ["cardio"],
        sets: Math.round(n(it.sets)),
        reps: Math.round(n(it.reps)),
        weight: n(it.weight),
        weight_unit: it.weight_unit === "kg" ? "kg" : "lb",
        duration_min: n(it.duration_min),
        calories: Math.round(n(it.calories)),
      };
    });

    const muscles = new Set<string>();
    let total_sets = 0, total_reps = 0, total_volume = 0, calories = 0;
    for (const it of items) {
      it.muscle_groups.forEach((m: string) => muscles.add(m));
      total_sets += it.sets;
      total_reps += it.sets * it.reps;
      total_volume += it.sets * it.reps * it.weight;
      calories += it.calories;
    }
    const totals = {
      total_sets,
      total_reps,
      total_volume: Math.round(total_volume),
      calories: Math.round(calories),
      muscles: Array.from(muscles),
    };

    const supabase = createClient(PROJECT_URL, SERVICE_ROLE_KEY);
    const { data, error } = await supabase
      .from("workout_logs")
      .insert({
        workout_time: new Date().toISOString(),
        raw_text: body.raw_text ? String(body.raw_text) : items.map((i: any) => i.name).join(", "),
        items,
        totals,
        confidence: body.confidence != null ? Number(body.confidence) : 1.0,
        assumptions: Array.isArray(body.assumptions) ? body.assumptions.map(String) : [],
      })
      .select()
      .single();

    if (error) return json({ error: "Failed to save workout", details: error.message }, 500);
    return json({ ok: true, id: data.id, workout_time: data.workout_time, totals });
  } catch (error) {
    return json({ error: "Internal server error", details: error instanceof Error ? error.message : "Unknown" }, 500);
  }
});
