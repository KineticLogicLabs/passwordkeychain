import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

const kv = await Deno.openKv();

// Required for browser security (CORS)
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Initial Setup for the default account
const adminKey = ["users", "admin"];
const initial = await kv.get(adminKey);
if (!initial.value) {
  await kv.set(adminKey, { password: "password", role: "admin", categories: ["Personal", "Work", "Finance", "Social"] });
}

serve(async (req) => {
  // Handle pre-flight browser requests
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const url = new URL(req.url);
  const body = await req.json().catch(() => ({}));

  if (req.method === "POST") {
    // --- AUTHENTICATION ---
    if (url.pathname.endsWith("/auth")) {
      const user = await kv.get(["users", body.username]);
      if (user.value && (user.value as any).password === body.password) {
        return new Response(JSON.stringify({ 
          success: true, 
          role: (user.value as any).role,
          categories: (user.value as any).categories || ["Personal", "Work", "Finance", "Social"]
        }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      return new Response("Unauthorized", { status: 401, headers: corsHeaders });
    }

    // --- VAULT OPERATIONS ---
    if (url.pathname.endsWith("/list")) {
      const items = [];
      const iter = kv.list({ prefix: ["users", body.currentUser, "vault"] });
      for await (const entry of iter) items.push(entry.value);
      return new Response(JSON.stringify(items), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (url.pathname.endsWith("/save")) {
      await kv.set(["users", body.currentUser, "vault", body.entry.domain.toLowerCase()], body.entry);
      return new Response(JSON.stringify({ success: true }), { headers: corsHeaders });
    }

    if (url.pathname.endsWith("/delete")) {
      await kv.delete(["users", body.currentUser, "vault", body.domain.toLowerCase()]);
      return new Response(JSON.stringify({ success: true }), { headers: corsHeaders });
    }

    // --- ACCOUNT MANAGEMENT ---
    if (url.pathname.endsWith("/create-account")) {
      const creator = await kv.get(["users", body.adminUser]);
      if ((creator.value as any)?.role !== "admin") return new Response("Forbidden", { status: 403, headers: corsHeaders });
      
      await kv.set(["users", body.newUsername], { 
        password: body.newPassword, 
        role: "standard", 
        categories: ["Personal", "Work", "Finance", "Social"] 
      });
      return new Response(JSON.stringify({ success: true }), { headers: corsHeaders });
    }
  }

  return new Response("Not Found", { status: 404, headers: corsHeaders });
});
