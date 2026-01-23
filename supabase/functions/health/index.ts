import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

serve(async (req) => {
  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers":
      "authorization, x-client-info, apikey, content-type",
  };

  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  // Test endpoint - accepts POST with timestamp to test parsing
  if (req.method === "POST") {
    try {
      const body = await req.json();
      const timestamp = body.timestamp || new Date().toISOString();
      const parsed = new Date(timestamp);
      
      return new Response(
        JSON.stringify({ 
          ok: true, 
          received: body.timestamp,
          parsed: parsed.toISOString(),
          isValid: !isNaN(parsed.getTime())
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    } catch (error) {
      return new Response(
        JSON.stringify({ 
          ok: false, 
          error: error instanceof Error ? error.message : "Unknown error" 
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
  }

  return new Response(
    JSON.stringify({ ok: true, timestamp: new Date().toISOString() }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } }
  );
});
