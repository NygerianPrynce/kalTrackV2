import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");
const PROJECT_URL = Deno.env.get("PROJECT_URL");
const SERVICE_ROLE_KEY = Deno.env.get("SERVICE_ROLE_KEY");

interface MealItem {
  name: string;
  qty: string;
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  fiber_g: number;
  sugar_g?: number;
  sodium_mg?: number;
}

interface MealTotals {
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  fiber_g: number;
  sugar_g?: number;
  sodium_mg?: number;
}

interface OpenAIResponse {
  meal_summary: string;
  items: MealItem[];
  totals: MealTotals;
  confidence: number;
  assumptions: string[];
}

interface RequestBody {
  text: string;
  timestamp?: string;
  meal_type?: string;
}

const SYSTEM_PROMPT = `You are a nutrition parser. Analyze the meal description and output ONLY valid JSON matching this exact schema. No markdown. No extra keys. No explanations.

Schema:
{
  "meal_summary": "Brief description of the meal",
  "items": [
    {
      "name": "Food item name",
      "qty": "Quantity description (e.g., '1 cup', '200g', '2 slices')",
      "calories": 0,
      "protein_g": 0.0,
      "carbs_g": 0.0,
      "fat_g": 0.0,
      "fiber_g": 0.0,
      "sugar_g": 0.0,
      "sodium_mg": 0.0
    }
  ],
  "totals": {
    "calories": 0,
    "protein_g": 0.0,
    "carbs_g": 0.0,
    "fat_g": 0.0,
    "fiber_g": 0.0,
    "sugar_g": 0.0,
    "sodium_mg": 0.0
  },
  "confidence": 0.5,
  "assumptions": []
}

Rules:
- If portion sizes are missing, assume common serving sizes and list them in assumptions.
- If ambiguous (e.g., "sandwich"), pick a reasonable default and lower confidence (0.3-0.6).
- Clamp all negative numbers to 0.
- Round calories to integers, macros to 1 decimal place.
- Always include totals that sum all items.
- Provide confidence 0.0-1.0 based on clarity of description.
- List any assumptions made in the assumptions array.`;

function clampToZero(num: number): number {
  return Math.max(0, num);
}

function roundCalories(cal: number): number {
  return Math.round(clampToZero(cal));
}

function roundMacro(macro: number): number {
  return Math.round(clampToZero(macro) * 10) / 10;
}

function normalizeResponse(data: OpenAIResponse): OpenAIResponse {
  // Normalize items
  const normalizedItems = data.items.map((item) => ({
    name: item.name || "Unknown",
    qty: item.qty || "1 serving",
    calories: roundCalories(item.calories),
    protein_g: roundMacro(item.protein_g),
    carbs_g: roundMacro(item.carbs_g),
    fat_g: roundMacro(item.fat_g),
    fiber_g: roundMacro(item.fiber_g),
    sugar_g: item.sugar_g !== undefined ? roundMacro(item.sugar_g) : undefined,
    sodium_mg: item.sodium_mg !== undefined ? roundMacro(item.sodium_mg) : undefined,
  }));

  // Recalculate totals from normalized items
  const totals: MealTotals = {
    calories: roundCalories(
      normalizedItems.reduce((sum, item) => sum + item.calories, 0)
    ),
    protein_g: roundMacro(
      normalizedItems.reduce((sum, item) => sum + item.protein_g, 0)
    ),
    carbs_g: roundMacro(
      normalizedItems.reduce((sum, item) => sum + item.carbs_g, 0)
    ),
    fat_g: roundMacro(
      normalizedItems.reduce((sum, item) => sum + item.fat_g, 0)
    ),
    fiber_g: roundMacro(
      normalizedItems.reduce((sum, item) => sum + item.fiber_g, 0)
    ),
  };

  if (normalizedItems.some((item) => item.sugar_g !== undefined)) {
    totals.sugar_g = roundMacro(
      normalizedItems.reduce((sum, item) => sum + (item.sugar_g || 0), 0)
    );
  }

  if (normalizedItems.some((item) => item.sodium_mg !== undefined)) {
    totals.sodium_mg = roundMacro(
      normalizedItems.reduce((sum, item) => sum + (item.sodium_mg || 0), 0)
    );
  }

  return {
    meal_summary: data.meal_summary || "Meal",
    items: normalizedItems,
    totals,
    confidence: Math.max(0, Math.min(1, data.confidence || 0.5)),
    assumptions: Array.isArray(data.assumptions) ? data.assumptions : [],
  };
}

async function callOpenAI(text: string, retry = false): Promise<OpenAIResponse> {
  if (!OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY not configured");
  }

  const prompt = retry
    ? `${SYSTEM_PROMPT}\n\nFix the JSON response for this meal: "${text}"`
    : `Parse this meal description: "${text}"`;

  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: prompt },
        ],
        response_format: { type: "json_object" },
        temperature: 0.3,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`OpenAI API error: ${response.status} ${error}`);
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;

    if (!content) {
      throw new Error("No content in OpenAI response");
    }

    // Parse JSON, handling markdown code blocks if present
    let jsonStr = content.trim();
    if (jsonStr.startsWith("```")) {
      jsonStr = jsonStr.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "");
    }

    const parsed = JSON.parse(jsonStr);
    return normalizeResponse(parsed);
  } catch (error) {
    if (!retry && error instanceof SyntaxError) {
      // Retry once if JSON parsing failed
      return callOpenAI(text, true);
    }
    throw error;
  }
}

function generateSpeech(totals: MealTotals, confidence: number): string {
  const cal = Math.round(totals.calories);
  const protein = Math.round(totals.protein_g);
  const fiber = Math.round(totals.fiber_g);

  if (confidence < 0.5) {
    return `Logged approximately ${cal} calories, about ${protein} grams protein, ${fiber} grams fiber.`;
  }
  return `Logged ${cal} calories, ${protein} grams protein, ${fiber} grams fiber.`;
}

serve(async (req) => {
  // CORS headers
  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers":
      "authorization, x-client-info, apikey, content-type",
  };

  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    if (req.method !== "POST") {
      return new Response(
        JSON.stringify({ error: "Method not allowed" }),
        { status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const body: RequestBody = await req.json();

    if (!body.text || typeof body.text !== "string" || body.text.trim().length === 0) {
      return new Response(
        JSON.stringify({ error: "Missing or invalid 'text' field" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Determine meal_time
    let meal_time: Date;
    if (body.timestamp) {
      meal_time = new Date(body.timestamp);
      if (isNaN(meal_time.getTime())) {
        return new Response(
          JSON.stringify({ error: "Invalid timestamp format" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    } else {
      meal_time = new Date();
    }

    // Call OpenAI
    let parsed: OpenAIResponse;
    try {
      parsed = await callOpenAI(body.text.trim());
    } catch (error) {
      console.error("OpenAI error:", error);
      return new Response(
        JSON.stringify({
          error: "Failed to parse meal with AI",
          details: error instanceof Error ? error.message : "Unknown error",
        }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Insert into database
    if (!PROJECT_URL || !SERVICE_ROLE_KEY) {
      throw new Error("Supabase credentials not configured");
    }

    const supabase = createClient(PROJECT_URL, SERVICE_ROLE_KEY);

    const { data, error } = await supabase
      .from("meal_logs")
      .insert({
        meal_time: meal_time.toISOString(),
        raw_text: body.text.trim(),
        meal_type: body.meal_type || null,
        totals: parsed.totals,
        items: parsed.items,
        confidence: parsed.confidence,
        assumptions: parsed.assumptions,
      })
      .select()
      .single();

    if (error) {
      console.error("Database error:", error);
      return new Response(
        JSON.stringify({
          error: "Failed to save meal log",
          details: error.message,
        }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const speech = generateSpeech(parsed.totals, parsed.confidence);

    return new Response(
      JSON.stringify({
        ok: true,
        id: data.id,
        meal_time: data.meal_time,
        totals: parsed.totals,
        confidence: parsed.confidence,
        assumptions: parsed.assumptions,
        speech,
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
