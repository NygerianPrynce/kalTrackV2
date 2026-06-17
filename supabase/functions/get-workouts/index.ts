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

function localDate(d: Date, tz: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    if (req.method !== "GET") return json({ error: "Method not allowed" }, 405);
    if (!PROJECT_URL || !SERVICE_ROLE_KEY) return json({ error: "Supabase credentials not configured" }, 500);

    const url = new URL(req.url);
    const tz = url.searchParams.get("tz") || "America/Chicago";
    const range = url.searchParams.get("range") || "30d";
    const days = range === "7d" ? 7 : range === "14d" ? 14 : range === "90d" ? 90 : 30;

    const from = new Date();
    from.setDate(from.getDate() - days);
    from.setHours(0, 0, 0, 0);

    const supabase = createClient(PROJECT_URL, SERVICE_ROLE_KEY);
    const { data: workouts, error } = await supabase
      .from("workout_logs")
      .select("*")
      .gte("workout_time", from.toISOString())
      .order("workout_time", { ascending: false })
      .limit(200);

    if (error) return json({ error: "Failed to fetch workouts", details: error.message }, 500);

    const list = workouts || [];
    const today = localDate(new Date(), tz);

    // Muscles worked today (for the body map) + last 7 days (lighter highlight)
    const todayMuscles = new Set<string>();
    const weekMuscles = new Set<string>();
    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 7);

    for (const w of list) {
      const wd = localDate(new Date(w.workout_time), tz);
      const muscles: string[] = (w.totals?.muscles) || [];
      if (wd === today) muscles.forEach((m) => todayMuscles.add(m));
      if (new Date(w.workout_time) >= weekAgo) muscles.forEach((m) => weekMuscles.add(m));
    }

    // Simple streak: consecutive days (ending today or yesterday) with a workout
    const workoutDays = new Set(list.map((w: any) => localDate(new Date(w.workout_time), tz)));
    let streak = 0;
    const cursor = new Date();
    if (!workoutDays.has(localDate(cursor, tz))) cursor.setDate(cursor.getDate() - 1);
    while (workoutDays.has(localDate(cursor, tz))) {
      streak++;
      cursor.setDate(cursor.getDate() - 1);
    }

    return json({
      workouts: list,
      today_muscles: Array.from(todayMuscles),
      week_muscles: Array.from(weekMuscles),
      streak,
      count: list.length,
    });
  } catch (error) {
    return json({ error: "Internal server error", details: error instanceof Error ? error.message : "Unknown" }, 500);
  }
});
