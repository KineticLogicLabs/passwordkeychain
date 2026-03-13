import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

const kv = await Deno.openKv();

// MUST BE EXACT FOR GITHUB PAGES
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  // Handle Pre-flight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  // FORCE RESET ADMIN ON EVERY CALL FOR TESTING
  await kv.set(["users", "admin"], { 
    password: "password", 
    role: "admin", 
    categories: ["Personal", "Work", "Finance", "Social"] 
  });

  const url = new URL(req.url);
  
  if (req.method === "POST") {
    try {
      const body = await req.json();

      if (url.pathname.endsWith("/auth")) {
        const user = await kv.get(["users", body.username]);
        if (user.value && (user.value as any).password === body.password) {
          return new Response(JSON.stringify({ 
            success: true, 
            role: (user.value as any).role,
            categories: (user.value as any).categories 
          }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }
        return new Response(JSON.stringify({ error: "Invalid credentials" }), { 
          status: 401, 
          headers: { ...corsHeaders, "Content-Type": "application/json" } 
        });
      }

      // Vault Listing
      if (url.pathname.endsWith("/list")) {
        const items = [];
        const iter = kv.list({ prefix: ["users", body.currentUser, "vault"] });
        for await (const entry of iter) items.push(entry.value);
        return new Response(JSON.stringify(items), { 
          headers: { ...corsHeaders, "Content-Type": "application/json" } 
        });
      }

      // Save Entry
      if (url.pathname.endsWith("/save")) {
        await kv.set(["users", body.currentUser, "vault", body.entry.domain.toLowerCase()], body.entry);
        return new Response(JSON.stringify({ success: true }), { headers: corsHeaders });
      }

      // Delete Entry
      if (url.pathname.endsWith("/delete")) {
        await kv.delete(["users", body.currentUser, "vault", body.domain.toLowerCase()]);
        return new Response(JSON.stringify({ success: true }), { headers: corsHeaders });
      }

      // Create Account (Only if Admin is logged in)
      if (url.pathname.endsWith("/create-account")) {
        const admin = await kv.get(["users", body.adminUser]);
        if ((admin.value as any)?.role !== "admin") return new Response("Forbidden", { status: 403, headers: corsHeaders });
        
        await kv.set(["users", body.newUsername], { 
          password: body.newPassword, 
          role: "standard", 
          categories: ["Personal", "Work", "Finance", "Social"] 
        });
        return new Response(JSON.stringify({ success: true }), { headers: corsHeaders });
      }

    } catch (err) {
      return new Response(JSON.stringify({ error: "Server Error" }), { 
        status: 500, 
        headers: { ...corsHeaders, "Content-Type": "application/json" } 
      });
    }
  }

  return new Response("Not Found", { status: 404, headers: corsHeaders });
});
