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

function localDate(d: Date, tz: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    if (!PROJECT_URL || !SERVICE_ROLE_KEY) return json({ error: "Supabase credentials not configured" }, 500);
    const supabase = createClient(PROJECT_URL, SERVICE_ROLE_KEY);

    const url = new URL(req.url);
    const tz = url.searchParams.get("tz") || "America/Chicago";
    // optional focus: "protein" | "water" | "calories" -> a shorter answer
    const focus = (url.searchParams.get("focus") || "").toLowerCase();

    const since = new Date();
    since.setDate(since.getDate() - 1); // 48h window is plenty to cover "today" in any tz
    since.setHours(0, 0, 0, 0);

    const [{ data: settings }, { data: meals }, { data: waters }] = await Promise.all([
      supabase.from("user_settings").select("*").eq("id", 1).single(),
      supabase.from("meal_logs").select("meal_time, totals").gte("meal_time", since.toISOString()),
      supabase.from("water_logs").select("logged_at, amount_oz").gte("logged_at", since.toISOString()),
    ]);

    const today = localDate(new Date(), tz);
    const t = { calories: 0, protein_g: 0, fiber_g: 0 };
    for (const m of meals ?? []) {
      if (localDate(new Date(m.meal_time), tz) !== today) continue;
      const tot = m.totals || {};
      t.calories += tot.calories || 0;
      t.protein_g += tot.protein_g || 0;
      t.fiber_g += tot.fiber_g || 0;
    }
    let water = 0;
    for (const w of waters ?? []) {
      if (localDate(new Date(w.logged_at), tz) !== today) continue;
      water += Number(w.amount_oz) || 0;
    }

    const cal = Math.round(t.calories);
    const protein = Math.round(t.protein_g);
    const fiber = Math.round(t.fiber_g);
    const calGoal = settings?.calories_goal ?? 2500;
    const proteinGoal = Math.round(Number(settings?.protein_goal_g ?? 180));
    const waterGoal = Math.round(Number(settings?.water_goal_oz ?? 64));
    const remaining = calGoal - cal;

    let speech: string;
    if (focus === "protein") {
      const left = Math.max(0, proteinGoal - protein);
      speech = `You have ${protein} of ${proteinGoal} grams of protein today, ${left} grams to go.`;
    } else if (focus === "water") {
      const left = Math.max(0, waterGoal - Math.round(water));
      speech = `You've had ${Math.round(water)} of ${waterGoal} ounces of water, ${left} ounces to go.`;
    } else {
      const calClause =
        remaining >= 0 ? `You're ${remaining} calories under goal.` : `You're ${Math.abs(remaining)} calories over goal.`;
      speech = `You've had ${cal} calories and ${protein} grams of protein today. ${calClause}`;
    }

    return json({
      speech,
      today_totals: { calories: cal, protein_g: protein, fiber_g: fiber },
      water_oz: Math.round(water * 10) / 10,
      goals: { calories_goal: calGoal, protein_goal_g: proteinGoal, water_goal_oz: waterGoal },
    });
  } catch (error) {
    return json({ error: "Internal server error", details: error instanceof Error ? error.message : "Unknown" }, 500);
  }
});
