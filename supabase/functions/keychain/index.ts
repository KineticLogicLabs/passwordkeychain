import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

const kv = await Deno.openKv();

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  // FORCE RESET ADMIN (Ensures login always works for testing)
  await kv.set(["users", "admin"], { 
    password: "password", 
    role: "admin", 
    categories: ["Personal", "Work", "Finance", "Social"] 
  });

  const url = new URL(req.url);
  const body = await req.json().catch(() => ({}));

  if (req.method === "POST") {
    if (url.pathname.endsWith("/auth")) {
      const user = await kv.get(["users", body.username]);
      if (user.value && (user.value as any).password === body.password) {
        return new Response(JSON.stringify({ 
          success: true, 
          categories: (user.value as any).categories 
        }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      // Return 401 for wrong password
      return new Response("Unauthorized", { status: 401, headers: corsHeaders });
    }
    
    // ... [Keep your /list and /save logic here] ...
  }
  return new Response("Not Found", { status: 404, headers: corsHeaders });
});
