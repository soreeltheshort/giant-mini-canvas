import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const GATEWAY_URL = "https://connector-gateway.lovable.dev/resend";

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
}

function postToHtml(post: { title: string; excerpt: string; content: string; cover_image_url: string | null }, postUrl: string, unsubscribeUrl: string): string {
  // Very basic markdown rendering for email
  const md = (post.content || "")
    .replace(/^### (.*$)/gim, "<h3>$1</h3>")
    .replace(/^## (.*$)/gim, "<h2>$1</h2>")
    .replace(/^# (.*$)/gim, "<h1>$1</h1>")
    .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
    .replace(/\n\n/g, "</p><p>")
    .replace(/\n/g, "<br/>");
  const cover = post.cover_image_url
    ? `<img src="${escapeHtml(post.cover_image_url)}" alt="" style="max-width:100%;border-radius:4px;margin:0 0 20px"/>`
    : "";
  return `<!doctype html><html><body style="background:#ffffff;font-family:Georgia,'Times New Roman',serif;color:#222;line-height:1.6;margin:0;padding:0">
    <div style="max-width:600px;margin:0 auto;padding:32px 24px">
      <p style="font-size:11px;letter-spacing:3px;text-transform:uppercase;color:#8b6f3a;margin:0 0 8px">Third Republic — Dispatch</p>
      <h1 style="font-size:26px;margin:0 0 16px;color:#111">${escapeHtml(post.title)}</h1>
      ${cover}
      ${post.excerpt ? `<p style="font-style:italic;color:#555;margin:0 0 20px">${escapeHtml(post.excerpt)}</p>` : ""}
      <div style="font-size:15px"><p>${md}</p></div>
      <p style="margin:32px 0 0"><a href="${postUrl}" style="background:#8b1f2f;color:#fff;padding:10px 18px;text-decoration:none;border-radius:2px;font-weight:600;letter-spacing:1px;text-transform:uppercase;font-size:12px">Read on the Forum →</a></p>
      <hr style="border:none;border-top:1px solid #ddd;margin:40px 0 20px"/>
      <p style="font-size:11px;color:#888;text-align:center">
        You received this because you opted in to Third Republic communications.<br/>
        <a href="${unsubscribeUrl}" style="color:#888">Unsubscribe</a>
      </p>
    </div>
  </body></html>`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");
    if (!RESEND_API_KEY) throw new Error("RESEND_API_KEY not configured");

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const FROM_EMAIL = Deno.env.get("RESEND_FROM_EMAIL") || "Third Republic <onboarding@resend.dev>";
    const APP_URL = Deno.env.get("APP_URL") || "https://minigiantgames.com";

    // Auth check: must be admin
    const authHeader = req.headers.get("Authorization") || "";
    const userClient = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData } = await userClient.auth.getUser();
    if (!userData?.user) return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const { data: roles } = await admin.from("user_roles").select("role").eq("user_id", userData.user.id);
    if (!roles?.some((r: any) => r.role === "admin")) {
      return new Response(JSON.stringify({ error: "forbidden" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const body = await req.json().catch(() => ({}));
    const blogPostId: string | undefined = body.blog_post_id;
    const force: boolean = !!body.force;
    if (!blogPostId) return new Response(JSON.stringify({ error: "blog_post_id required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const { data: post, error: postErr } = await admin.from("blog_posts").select("*").eq("id", blogPostId).maybeSingle();
    if (postErr || !post) return new Response(JSON.stringify({ error: "post not found" }), { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    if ((post.mailed_count || 0) > 0 && !force) {
      return new Response(JSON.stringify({ error: "already_mailed", mailed_at: post.mailed_at, mailed_count: post.mailed_count }), { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Collect recipients from BOTH opt-in users (with accounts) AND newsletter_subscribers (no account)
    const { data: optInRoles } = await admin.from("user_roles").select("user_id").eq("role", "opt_in");
    const userIds = Array.from(new Set((optInRoles || []).map((r: any) => r.user_id)));

    let optInProfiles: any[] = [];
    if (userIds.length > 0) {
      const { data } = await admin.from("profiles").select("email").in("user_id", userIds);
      optInProfiles = data || [];
    }

    const { data: publicSubs } = await admin.from("newsletter_subscribers").select("email");
    const { data: suppressed } = await admin.from("email_suppressions").select("email");
    const suppressedSet = new Set((suppressed || []).map((s: any) => (s.email || "").toLowerCase()));

    const emailMap = new Map<string, { email: string }>();
    for (const p of optInProfiles) {
      if (p.email && !suppressedSet.has(p.email.toLowerCase())) {
        emailMap.set(p.email.toLowerCase(), { email: p.email });
      }
    }
    for (const s of publicSubs || []) {
      if (s.email && !suppressedSet.has(s.email.toLowerCase())) {
        emailMap.set(s.email.toLowerCase(), { email: s.email });
      }
    }
    const recipients = Array.from(emailMap.values());

    if (recipients.length === 0) {
      return new Response(JSON.stringify({ sent: 0, skipped: 0, message: "No subscribers." }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const postUrl = `${APP_URL}/blog/${post.slug}`;
    let sent = 0;
    let failed = 0;
    const errors: string[] = [];

    // Send one at a time so each gets a personalized unsubscribe link
    for (const r of recipients) {
      const unsubscribeUrl = `${APP_URL}/unsubscribe?email=${encodeURIComponent(r.email)}`;
      const html = postToHtml(post as any, postUrl, unsubscribeUrl);
      try {
        const resp = await fetch(`${GATEWAY_URL}/emails`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${LOVABLE_API_KEY}`,
            "X-Connection-Api-Key": RESEND_API_KEY,
          },
          body: JSON.stringify({
            from: FROM_EMAIL,
            to: [r.email],
            subject: post.title,
            html,
            headers: { "List-Unsubscribe": `<${unsubscribeUrl}>` },
          }),
        });
        if (resp.ok) {
          sent++;
        } else {
          failed++;
          const t = await resp.text();
          errors.push(`${r.email}: ${resp.status} ${t.slice(0, 200)}`);
        }
      } catch (e: any) {
        failed++;
        errors.push(`${r.email}: ${e.message}`);
      }
    }

    await admin.from("blog_posts").update({
      mailed_at: new Date().toISOString(),
      mailed_count: (post.mailed_count || 0) + 1,
    }).eq("id", blogPostId);

    return new Response(JSON.stringify({ sent, failed, total: recipients.length, errors: errors.slice(0, 10) }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    console.error("mail-blog-post error", e);
    return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
