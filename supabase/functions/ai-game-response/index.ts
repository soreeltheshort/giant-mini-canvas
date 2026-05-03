import { corsHeaders } from "https://esm.sh/@supabase/supabase-js@2.95.0/cors";

const headers = corsHeaders ?? {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers });

  try {
    const body = await req.json().catch(() => null);
    if (!body) {
      return json({ error: "Invalid JSON body" }, 400);
    }
    const { playerId, turnNumber, gameContext, playerInput } = body;

    const missing: string[] = [];
    if (!playerId || typeof playerId !== "string") missing.push("playerId");
    if (typeof turnNumber !== "number") missing.push("turnNumber");
    if (!gameContext || typeof gameContext !== "object") missing.push("gameContext");
    if (!playerInput || typeof playerInput !== "string") missing.push("playerInput");
    if (missing.length) {
      return json({ error: `Missing or invalid fields: ${missing.join(", ")}` }, 400);
    }

    const apiKey = Deno.env.get("OPENAI_API_KEY");
    if (!apiKey) return json({ error: "OPENAI_API_KEY not configured" }, 500);

    const systemPrompt = `You are the narrative arbiter for a tactical space wargame called Third Republic.
You receive game context and a player's free-form input. You narrate, interpret, and PROPOSE outcomes.
You MUST NOT alter game state — only suggest mechanical effects for the app to apply.
Respond with VALID JSON ONLY matching this schema:
{
  "narration": string,
  "result": string,
  "options": string[],
  "mechanicalEffects": {
    "cindersChange": number,
    "influenceChange": number,
    "reputationChange": number,
    "flags": string[]
  }
}`;

    const userPrompt = JSON.stringify({ playerId, turnNumber, gameContext, playerInput });

    const resp = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        input: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        text: { format: { type: "json_object" } },
      }),
    });

    if (!resp.ok) {
      const t = await resp.text();
      console.error("OpenAI error:", resp.status, t);
      return json({ error: "OpenAI request failed", status: resp.status, detail: t }, 502);
    }

    const data = await resp.json();
    // Extract text from Responses API
    let text = data.output_text;
    if (!text && Array.isArray(data.output)) {
      text = data.output
        .flatMap((o: any) => o.content ?? [])
        .filter((c: any) => c?.type === "output_text" || c?.type === "text")
        .map((c: any) => c.text)
        .join("");
    }
    if (!text) return json({ error: "Empty AI response", raw: data }, 502);

    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch {
      return json({ error: "AI did not return valid JSON", raw: text }, 502);
    }

    return json(parsed, 200);
  } catch (e) {
    console.error("ai-game-response error:", e);
    return json({ error: e instanceof Error ? e.message : "Unknown error" }, 500);
  }
});

function json(obj: unknown, status: number) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { ...headers, "Content-Type": "application/json" },
  });
}
