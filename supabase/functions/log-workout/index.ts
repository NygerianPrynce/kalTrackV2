import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");
const PROJECT_URL = Deno.env.get("PROJECT_URL") ?? Deno.env.get("SUPABASE_URL");
const SERVICE_ROLE_KEY = Deno.env.get("SERVICE_ROLE_KEY") ?? Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

// Canonical muscle vocabulary used by the body map on the frontend.
const MUSCLES = [
  "chest", "shoulders", "back", "lats", "traps", "biceps", "triceps",
  "forearms", "abs", "obliques", "quads", "hamstrings", "glutes", "calves",
  "lower_back", "cardio",
];

interface WorkoutItem {
  name: string;
  muscle_groups: string[];
  sets?: number;
  reps?: number;
  weight?: number;
  weight_unit?: string;
  duration_min?: number;
  calories?: number;
}

interface ParsedWorkout {
  summary: string;
  items: WorkoutItem[];
  confidence: number;
  assumptions: string[];
}

const SYSTEM_PROMPT = `You are a workout parser. Analyze the workout description and output ONLY valid JSON. No markdown, no extra keys, no explanations.

Schema:
{
  "summary": "Brief description of the workout",
  "items": [
    {
      "name": "Exercise name (e.g., 'Bench Press')",
      "muscle_groups": ["chest", "triceps"],
      "sets": 3,
      "reps": 10,
      "weight": 135,
      "weight_unit": "lb",
      "duration_min": 0,
      "calories": 0
    }
  ],
  "confidence": 0.8,
  "assumptions": []
}

Rules:
- muscle_groups MUST be chosen ONLY from this list: ${MUSCLES.join(", ")}.
- Pick every primary and secondary muscle each exercise trains.
- For cardio (running, cycling, etc.), use muscle_groups ["cardio"] plus legs if relevant, set duration_min, and estimate calories.
- If sets/reps/weight are not mentioned, omit them or set 0; note guesses in assumptions.
- weight_unit is "lb" or "kg".
- Estimate calories burned per exercise when reasonable, else 0.
- confidence 0.0-1.0 based on clarity.`;

function extractOutputText(data: any): string {
  if (typeof data.output_text === "string" && data.output_text.trim()) return data.output_text;
  const chunks: string[] = [];
  for (const item of data.output ?? []) {
    if (item.type === "message" && Array.isArray(item.content)) {
      for (const c of item.content) {
        if (c.type === "output_text" && typeof c.text === "string") chunks.push(c.text);
      }
    }
  }
  return chunks.join("\n");
}

function normalize(parsed: ParsedWorkout): ParsedWorkout {
  const items = (parsed.items || []).map((it) => {
    const groups = (Array.isArray(it.muscle_groups) ? it.muscle_groups : [])
      .map((m) => String(m).toLowerCase().trim().replace(/\s+/g, "_"))
      .filter((m) => MUSCLES.includes(m));
    return {
      name: it.name || "Exercise",
      muscle_groups: groups.length ? Array.from(new Set(groups)) : ["cardio"],
      sets: Math.max(0, Math.round(Number(it.sets) || 0)),
      reps: Math.max(0, Math.round(Number(it.reps) || 0)),
      weight: Math.max(0, Number(it.weight) || 0),
      weight_unit: it.weight_unit === "kg" ? "kg" : "lb",
      duration_min: Math.max(0, Number(it.duration_min) || 0),
      calories: Math.max(0, Math.round(Number(it.calories) || 0)),
    };
  });
  return {
    summary: parsed.summary || "Workout",
    items,
    confidence: Math.max(0, Math.min(1, Number(parsed.confidence) || 0.6)),
    assumptions: Array.isArray(parsed.assumptions) ? parsed.assumptions : [],
  };
}

export function computeTotals(items: WorkoutItem[]) {
  const muscles = new Set<string>();
  let total_sets = 0, total_reps = 0, total_volume = 0, calories = 0;
  for (const it of items) {
    (it.muscle_groups || []).forEach((m) => muscles.add(m));
    total_sets += it.sets || 0;
    total_reps += (it.sets || 0) * (it.reps || 0);
    total_volume += (it.sets || 0) * (it.reps || 0) * (it.weight || 0);
    calories += it.calories || 0;
  }
  return {
    total_sets,
    total_reps,
    total_volume: Math.round(total_volume),
    calories: Math.round(calories),
    muscles: Array.from(muscles),
  };
}

async function callOpenAI(text: string, retry = false): Promise<ParsedWorkout> {
  if (!OPENAI_API_KEY) throw new Error("OPENAI_API_KEY not configured");
  const instruction = retry
    ? `Output ONLY the JSON (no markdown) for this workout: "${text}"`
    : `Parse this workout: "${text}"`;

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${OPENAI_API_KEY}` },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      temperature: 0.3,
      instructions: SYSTEM_PROMPT,
      input: instruction,
    }),
  });
  if (!response.ok) throw new Error(`OpenAI API error: ${response.status} ${await response.text()}`);

  const data = await response.json();
  let content = extractOutputText(data).trim();
  if (content.startsWith("```")) {
    content = content.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "");
  } else {
    const a = content.indexOf("{"), b = content.lastIndexOf("}");
    if (a !== -1 && b > a) content = content.slice(a, b + 1);
  }
  try {
    return normalize(JSON.parse(content));
  } catch (e) {
    if (!retry && e instanceof SyntaxError) return callOpenAI(text, true);
    throw e;
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

    const body = await req.json().catch(() => ({} as any));
    if (!body.text || typeof body.text !== "string" || !body.text.trim()) {
      return json({ error: "Missing or invalid 'text' field" }, 400);
    }
    const text = body.text.trim();
    const preview = body.preview === true;

    let parsed: ParsedWorkout;
    try {
      parsed = await callOpenAI(text);
    } catch (error) {
      return json({ error: "Failed to parse workout with AI", details: error instanceof Error ? error.message : "Unknown" }, 502);
    }

    const totals = computeTotals(parsed.items);

    if (preview) {
      return json({ ok: true, preview: true, summary: parsed.summary, items: parsed.items, totals, confidence: parsed.confidence, assumptions: parsed.assumptions });
    }

    if (!PROJECT_URL || !SERVICE_ROLE_KEY) return json({ error: "Supabase credentials not configured" }, 500);
    const supabase = createClient(PROJECT_URL, SERVICE_ROLE_KEY);
    const { data, error } = await supabase
      .from("workout_logs")
      .insert({
        workout_time: new Date().toISOString(),
        raw_text: text,
        items: parsed.items,
        totals,
        confidence: parsed.confidence,
        assumptions: parsed.assumptions,
      })
      .select()
      .single();

    if (error) return json({ error: "Failed to save workout", details: error.message }, 500);

    const muscleList = totals.muscles.filter((m) => m !== "cardio").join(", ");
    const speech = `Logged ${parsed.items.length} exercise${parsed.items.length === 1 ? "" : "s"}${muscleList ? ", hitting " + muscleList : ""}.`;

    return json({ ok: true, id: data.id, workout_time: data.workout_time, totals, speech });
  } catch (error) {
    return json({ error: "Internal server error", details: error instanceof Error ? error.message : "Unknown" }, 500);
  }
});
