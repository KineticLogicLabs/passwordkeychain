import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

const kv = await Deno.openKv();
const REGISTRATION_KEY = "KINETIC_2026"; // Change this to your secret code

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const url = new URL(req.url);
  const body = await req.json().catch(() => ({}));

  if (req.method === "POST") {
    // --- CREATE ACCOUNT (With Spam Protection) ---
    if (url.pathname.endsWith("/create-account")) {
      if (body.regKey !== REGISTRATION_KEY) {
        return new Response("Invalid Registration Key", { status: 403, headers: corsHeaders });
      }
      const existing = await kv.get(["users", body.username]);
      if (existing.value) return new Response("User exists", { status: 400, headers: corsHeaders });
      
      await kv.set(["users", body.username], { 
        password: body.password, 
        role: "user", 
        categories: ["Personal", "Work", "Finance", "Social"] 
      });
      return new Response(JSON.stringify({ success: true }), { headers: corsHeaders });
    }

    // --- UPDATE PROFILE (Change Username/Password) ---
    if (url.pathname.endsWith("/update-profile")) {
      const userKey = ["users", body.oldUsername];
      const user = await kv.get(userKey);
      if (!user.value) return new Response("Not Found", { status: 404, headers: corsHeaders });

      // If changing username, move the data
      if (body.oldUsername !== body.newUsername) {
        await kv.set(["users", body.newUsername], { ...(user.value as object), password: body.newPassword });
        await kv.delete(userKey);
        // Note: In a production app, you'd also migrate the vault keys here
      } else {
        await kv.set(userKey, { ...(user.value as object), password: body.newPassword });
      }
      return new Response(JSON.stringify({ success: true }), { headers: corsHeaders });
    }
    
    // ... [Include your existing /auth, /list, /save logic here] ...
  }
  return new Response("Not Found", { status: 404, headers: corsHeaders });
});
