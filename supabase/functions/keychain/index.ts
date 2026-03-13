import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

const kv = await Deno.openKv();

// REQUIRED: Allow your GitHub website to access this API
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// --- AUTO-SETUP ---
const adminKey = ["users", "admin"];
const initialUser = await kv.get(adminKey);
if (!initialUser.value) {
  await kv.set(adminKey, { password: "password", categories: ["Personal", "Work", "Finance", "Social"] });
}

serve(async (req) => {
  // Handle pre-flight browser requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const url = new URL(req.url);

  if (req.method === "POST") {
    try {
      const body = await req.json();

      // Logic for Authentication
      if (url.pathname.endsWith("/auth")) {
        const user = await kv.get(["users", body.username]);
        if (user.value && (user.value as any).password === body.password) {
          return new Response(JSON.stringify({ 
            success: true, 
            categories: (user.value as any).categories || [] 
          }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }
        return new Response("Unauthorized", { status: 401, headers: corsHeaders });
      }

      // Logic for Listing Passwords
      if (url.pathname.endsWith("/list")) {
        const items = [];
        const iter = kv.list({ prefix: ["users", body.currentUser, "vault"] });
        for await (const entry of iter) items.push(entry.value);
        return new Response(JSON.stringify(items), { 
          headers: { ...corsHeaders, "Content-Type": "application/json" } 
        });
      }

      // Logic for Saving
      if (url.pathname.endsWith("/save")) {
        await kv.set(["users", body.currentUser, "vault", body.entry.domain.toLowerCase()], body.entry);
        return new Response(JSON.stringify({ success: true }), { headers: corsHeaders });
      }

      // Logic for Trashing
      if (url.pathname.endsWith("/trash-entry")) {
        const key = ["users", body.currentUser, "vault", body.domain.toLowerCase()];
        const entry = await kv.get(key);
        if (entry.value) {
          const trashEntry = { ...entry.value, deletedAt: Date.now() };
          await kv.set(["users", body.currentUser, "trash", body.domain.toLowerCase()], trashEntry);
          await kv.delete(key);
        }
        return new Response(JSON.stringify({ success: true }), { headers: corsHeaders });
      }

    } catch (err) {
      return new Response("Error", { status: 400, headers: corsHeaders });
    }
  }

  return new Response("Not Found", { status: 404, headers: corsHeaders });
});
