import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

const kv = await Deno.openKv();

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
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const url = new URL(req.url);

  if (req.method === "POST") {
    try {
      const body = await req.json();

      if (url.pathname.endsWith("/auth")) {
        const user = await kv.get(["users", body.username]);
        if (user.value && (user.value as any).password === body.password) {
          return new Response(JSON.stringify({ success: true, categories: (user.value as any).categories || [] }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        return new Response("Unauthorized", { status: 401, headers: corsHeaders });
      }

      if (url.pathname.endsWith("/list")) {
        const items = [];
        const iter = kv.list({ prefix: ["users", body.currentUser, "vault"] });
        for await (const entry of iter) items.push(entry.value);
        return new Response(JSON.stringify(items), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      // ... [Keep all other POST logic here: /trash-entry, /restore, /save, etc.] ...

    } catch (err) {
      return new Response("Error", { status: 400, headers: corsHeaders });
    }
  }

  return new Response("Not Found", { status: 404, headers: corsHeaders });
});
