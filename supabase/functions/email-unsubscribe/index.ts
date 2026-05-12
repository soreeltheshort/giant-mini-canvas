import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const body = await req.json().catch(() => ({}));
    const rawEmail = (body.email || "").toString().trim().toLowerCase();
    if (!rawEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(rawEmail)) {
      return new Response(JSON.stringify({ error: "valid email required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Add to suppression list (skip if already there — no unique constraint)
    const { data: existing } = await admin.from("email_suppressions").select("id").eq("email", rawEmail).maybeSingle();
    if (!existing) {
      await admin.from("email_suppressions").insert({ email: rawEmail, reason: "user_unsubscribe" });
    }

    // Remove from public newsletter subscribers list
    await admin.from("newsletter_subscribers").delete().eq("email", rawEmail);

    // If a profile exists for this email, also remove the opt_in role
    const { data: profile } = await admin.from("profiles").select("user_id").eq("email", rawEmail).maybeSingle();
    if (profile?.user_id) {
      await admin.from("user_roles").delete().eq("user_id", profile.user_id).eq("role", "opt_in");
    }

    return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
