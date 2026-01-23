import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const PROJECT_URL = Deno.env.get("PROJECT_URL");
const SERVICE_ROLE_KEY = Deno.env.get("SERVICE_ROLE_KEY");

interface UpdateBody {
  id: string;
  totals: {
    calories?: number;
    protein_g?: number;
    carbs_g?: number;
    fat_g?: number;
    fiber_g?: number;
    sugar_g?: number;
    sodium_mg?: number;
  };
}

function roundCalories(cal: number): number {
  return Math.round(Math.max(0, cal));
}

function roundMacro(macro: number): number {
  return Math.round(Math.max(0, macro) * 10) / 10;
}

serve(async (req) => {
  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers":
      "authorization, x-client-info, apikey, content-type",
  };

  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    if (req.method !== "PUT" && req.method !== "POST") {
      return new Response(
        JSON.stringify({ error: "Method not allowed" }),
        { status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const body: UpdateBody = await req.json();

    if (!body.id || typeof body.id !== "string") {
      return new Response(
        JSON.stringify({ error: "Missing or invalid 'id' field" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!body.totals || typeof body.totals !== "object") {
      return new Response(
        JSON.stringify({ error: "Missing or invalid 'totals' field" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!PROJECT_URL || !SERVICE_ROLE_KEY) {
      throw new Error("Supabase credentials not configured");
    }

    const supabase = createClient(PROJECT_URL, SERVICE_ROLE_KEY);

    // Get existing meal to preserve structure
    const { data: existing, error: fetchError } = await supabase
      .from("meal_logs")
      .select("totals")
      .eq("id", body.id)
      .single();

    if (fetchError || !existing) {
      return new Response(
        JSON.stringify({ error: "Meal not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Merge existing totals with new values, rounding appropriately
    const updatedTotals = {
      ...existing.totals,
      ...(body.totals.calories !== undefined && {
        calories: roundCalories(body.totals.calories),
      }),
      ...(body.totals.protein_g !== undefined && {
        protein_g: roundMacro(body.totals.protein_g),
      }),
      ...(body.totals.carbs_g !== undefined && {
        carbs_g: roundMacro(body.totals.carbs_g),
      }),
      ...(body.totals.fat_g !== undefined && {
        fat_g: roundMacro(body.totals.fat_g),
      }),
      ...(body.totals.fiber_g !== undefined && {
        fiber_g: roundMacro(body.totals.fiber_g),
      }),
      ...(body.totals.sugar_g !== undefined && {
        sugar_g: roundMacro(body.totals.sugar_g),
      }),
      ...(body.totals.sodium_mg !== undefined && {
        sodium_mg: roundMacro(body.totals.sodium_mg),
      }),
    };

    const { data, error } = await supabase
      .from("meal_logs")
      .update({ totals: updatedTotals })
      .eq("id", body.id)
      .select()
      .single();

    if (error) {
      console.error("Database error:", error);
      return new Response(
        JSON.stringify({
          error: "Failed to update meal log",
          details: error.message,
        }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ ok: true, data }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Unexpected error:", error);
    return new Response(
      JSON.stringify({
        error: "Internal server error",
        details: error instanceof Error ? error.message : "Unknown error",
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
