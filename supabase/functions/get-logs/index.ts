import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const PROJECT_URL = Deno.env.get("PROJECT_URL");
const SERVICE_ROLE_KEY = Deno.env.get("SERVICE_ROLE_KEY");

interface DailyTotals {
  date: string;
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  fiber_g: number;
  sugar_g?: number;
  sodium_mg?: number;
}

interface Last7Avg {
  calories: number;
  fiber_g: number;
  protein_g: number;
}

function parseRange(range: string | null): { from: Date; to: Date } {
  const to = new Date();
  to.setHours(23, 59, 59, 999);

  let from = new Date();
  const days = range === "7d" ? 7 : range === "14d" ? 14 : range === "30d" ? 30 : range === "90d" ? 90 : 14;
  from.setDate(from.getDate() - days);
  from.setHours(0, 0, 0, 0);

  return { from, to };
}

function parseDateRange(fromStr: string | null, toStr: string | null): { from: Date; to: Date } | null {
  if (!fromStr || !toStr) return null;

  const from = new Date(fromStr);
  const to = new Date(toStr);

  if (isNaN(from.getTime()) || isNaN(to.getTime())) return null;

  from.setHours(0, 0, 0, 0);
  to.setHours(23, 59, 59, 999);

  return { from, to };
}

function convertToTimezone(date: Date, tz: string): Date {
  // Use Intl.DateTimeFormat to convert to timezone
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });

  const parts = formatter.formatToParts(date);
  const year = parseInt(parts.find((p) => p.type === "year")!.value);
  const month = parseInt(parts.find((p) => p.type === "month")!.value) - 1;
  const day = parseInt(parts.find((p) => p.type === "day")!.value);
  const hour = parseInt(parts.find((p) => p.type === "hour")!.value);
  const minute = parseInt(parts.find((p) => p.type === "minute")!.value);
  const second = parseInt(parts.find((p) => p.type === "second")!.value);

  return new Date(Date.UTC(year, month, day, hour, minute, second));
}

function getDateString(date: Date, tz: string): string {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return formatter.format(date);
}

function sumTotals(items: any[]): {
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  fiber_g: number;
  sugar_g?: number;
  sodium_mg?: number;
} {
  return items.reduce(
    (acc, item) => {
      const totals = item.totals || {};
      acc.calories += totals.calories || 0;
      acc.protein_g += totals.protein_g || 0;
      acc.carbs_g += totals.carbs_g || 0;
      acc.fat_g += totals.fat_g || 0;
      acc.fiber_g += totals.fiber_g || 0;
      if (totals.sugar_g !== undefined) {
        acc.sugar_g = (acc.sugar_g || 0) + totals.sugar_g;
      }
      if (totals.sodium_mg !== undefined) {
        acc.sodium_mg = (acc.sodium_mg || 0) + totals.sodium_mg;
      }
      return acc;
    },
    {
      calories: 0,
      protein_g: 0,
      carbs_g: 0,
      fat_g: 0,
      fiber_g: 0,
      sugar_g: 0,
      sodium_mg: 0,
    }
  );
}

function calculateDailyTotals(logs: any[], tz: string): DailyTotals[] {
  const byDate = new Map<string, any[]>();

  for (const log of logs) {
    const mealTime = new Date(log.meal_time);
    const dateStr = getDateString(mealTime, tz);
    if (!byDate.has(dateStr)) {
      byDate.set(dateStr, []);
    }
    byDate.get(dateStr)!.push(log);
  }

  const daily: DailyTotals[] = [];
  for (const [date, dateLogs] of byDate.entries()) {
    const totals = sumTotals(dateLogs);
    daily.push({
      date,
      calories: Math.round(totals.calories),
      protein_g: Math.round(totals.protein_g * 10) / 10,
      carbs_g: Math.round(totals.carbs_g * 10) / 10,
      fat_g: Math.round(totals.fat_g * 10) / 10,
      fiber_g: Math.round(totals.fiber_g * 10) / 10,
      ...(totals.sugar_g !== undefined && totals.sugar_g > 0
        ? { sugar_g: Math.round(totals.sugar_g * 10) / 10 }
        : {}),
      ...(totals.sodium_mg !== undefined && totals.sodium_mg > 0
        ? { sodium_mg: Math.round(totals.sodium_mg * 10) / 10 }
        : {}),
    });
  }

  return daily.sort((a, b) => a.date.localeCompare(b.date));
}

function calculateLast7Avg(logs: any[], tz: string): Last7Avg {
  const now = new Date();
  const sevenDaysAgo = new Date(now);
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

  const recentLogs = logs.filter((log) => {
    const mealTime = new Date(log.meal_time);
    return mealTime >= sevenDaysAgo;
  });

  if (recentLogs.length === 0) {
    return { calories: 0, fiber_g: 0, protein_g: 0 };
  }

  const daily = calculateDailyTotals(recentLogs, tz);
  if (daily.length === 0) {
    return { calories: 0, fiber_g: 0, protein_g: 0 };
  }

  const totals = daily.reduce(
    (acc, day) => {
      acc.calories += day.calories;
      acc.fiber_g += day.fiber_g;
      acc.protein_g += day.protein_g;
      return acc;
    },
    { calories: 0, fiber_g: 0, protein_g: 0 }
  );

  return {
    calories: Math.round(totals.calories / daily.length),
    fiber_g: Math.round((totals.fiber_g / daily.length) * 10) / 10,
    protein_g: Math.round((totals.protein_g / daily.length) * 10) / 10,
  };
}

function getTodayTotals(logs: any[], tz: string): {
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  fiber_g: number;
  sugar_g?: number;
  sodium_mg?: number;
} {
  const today = getDateString(new Date(), tz);
  const todayLogs = logs.filter((log) => {
    const mealTime = new Date(log.meal_time);
    return getDateString(mealTime, tz) === today;
  });

  if (todayLogs.length === 0) {
    return {
      calories: 0,
      protein_g: 0,
      carbs_g: 0,
      fat_g: 0,
      fiber_g: 0,
    };
  }

  const totals = sumTotals(todayLogs);
  return {
    calories: Math.round(totals.calories),
    protein_g: Math.round(totals.protein_g * 10) / 10,
    carbs_g: Math.round(totals.carbs_g * 10) / 10,
    fat_g: Math.round(totals.fat_g * 10) / 10,
    fiber_g: Math.round(totals.fiber_g * 10) / 10,
    ...(totals.sugar_g !== undefined && totals.sugar_g > 0
      ? { sugar_g: Math.round(totals.sugar_g * 10) / 10 }
      : {}),
    ...(totals.sodium_mg !== undefined && totals.sodium_mg > 0
      ? { sodium_mg: Math.round(totals.sodium_mg * 10) / 10 }
      : {}),
  };
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
    if (req.method !== "GET") {
      return new Response(
        JSON.stringify({ error: "Method not allowed" }),
        { status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const url = new URL(req.url);
    const range = url.searchParams.get("range");
    const from = url.searchParams.get("from");
    const to = url.searchParams.get("to");
    const tz = url.searchParams.get("tz") || "America/Chicago";

    // Validate timezone
    try {
      Intl.DateTimeFormat(undefined, { timeZone: tz });
    } catch {
      return new Response(
        JSON.stringify({ error: "Invalid timezone" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Determine date range
    let dateRange: { from: Date; to: Date };
    const customRange = parseDateRange(from, to);
    if (customRange) {
      dateRange = customRange;
    } else {
      dateRange = parseRange(range);
    }

    if (!PROJECT_URL || !SERVICE_ROLE_KEY) {
      throw new Error("Supabase credentials not configured");
    }

    const supabase = createClient(PROJECT_URL, SERVICE_ROLE_KEY);

    // Fetch logs
    const { data: logs, error } = await supabase
      .from("meal_logs")
      .select("*")
      .gte("meal_time", dateRange.from.toISOString())
      .lte("meal_time", dateRange.to.toISOString())
      .order("meal_time", { ascending: false })
      .limit(200);

    if (error) {
      console.error("Database error:", error);
      return new Response(
        JSON.stringify({
          error: "Failed to fetch logs",
          details: error.message,
        }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const logsArray = logs || [];

    // Calculate aggregations
    const today_totals = getTodayTotals(logsArray, tz);
    const daily_totals = calculateDailyTotals(logsArray, tz);
    const last_7_avg = calculateLast7Avg(logsArray, tz);

    return new Response(
      JSON.stringify({
        logs: logsArray,
        today_totals,
        daily_totals,
        last_7_avg,
      }),
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
