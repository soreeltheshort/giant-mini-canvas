import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_PUBLISHABLE_KEY")!;
    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    const { target_user_id, return_to_admin_id } = await req.json();

    if (return_to_admin_id) {
      // Return-to-admin mode: verify the target IS actually an admin, then generate link
      const { data: roles } = await adminClient
        .from("user_roles")
        .select("role")
        .eq("user_id", return_to_admin_id)
        .eq("role", "admin");

      if (!roles || roles.length === 0) {
        return new Response(JSON.stringify({ error: "Target is not an admin" }), {
          status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { data: { user: adminUser }, error: userError } = await adminClient.auth.admin.getUserById(return_to_admin_id);
      if (userError || !adminUser?.email) {
        return new Response(JSON.stringify({ error: "Admin user not found" }), {
          status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { data: linkData, error: linkError } = await adminClient.auth.admin.generateLink({
        type: "magiclink",
        email: adminUser.email,
      });

      if (linkError || !linkData) {
        return new Response(JSON.stringify({ error: linkError?.message || "Failed to generate link" }), {
          status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      return new Response(JSON.stringify({
        token_hash: linkData.properties?.hashed_token,
        email: adminUser.email,
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Standard impersonation: verify caller is admin
    const authHeader = req.headers.get("Authorization")!;
    const callerClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user: caller } } = await callerClient.auth.getUser();
    if (!caller) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: roles } = await adminClient
      .from("user_roles")
      .select("role")
      .eq("user_id", caller.id)
      .eq("role", "admin");

    if (!roles || roles.length === 0) {
      return new Response(JSON.stringify({ error: "Admin access required" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!target_user_id) {
      return new Response(JSON.stringify({ error: "target_user_id required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: { user: targetUser }, error: userError } = await adminClient.auth.admin.getUserById(target_user_id);
    if (userError || !targetUser?.email) {
      return new Response(JSON.stringify({ error: "User not found" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: linkData, error: linkError } = await adminClient.auth.admin.generateLink({
      type: "magiclink",
      email: targetUser.email,
    });

    if (linkError || !linkData) {
      return new Response(JSON.stringify({ error: linkError?.message || "Failed to generate link" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({
      token_hash: linkData.properties?.hashed_token,
      email: targetUser.email,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
