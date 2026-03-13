import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

// Note: Deno.openKv() is not supported on Supabase. 
// We are using a hardcoded check for the admin for now to ensure you can log in.
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  // Handle CORS Pre-flight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const url = new URL(req.url);
  
  if (req.method === "POST") {
    try {
      const body = await req.json();

      // Authentication Logic
      if (url.pathname.endsWith("/auth")) {
        // Hardcoded check to ensure admin/password always works on Supabase
        if (body.username === "admin" && body.password === "password") {
          return new Response(JSON.stringify({ 
            success: true, 
            role: "admin",
            categories: ["Personal", "Work", "Finance", "Social"] 
          }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }
        
        return new Response(JSON.stringify({ error: "Invalid credentials" }), { 
          status: 401, 
          headers: { ...corsHeaders, "Content-Type": "application/json" } 
        });
      }

      // Placeholder for Vault Listing (Since KV isn't available, we return an empty list for now)
      if (url.pathname.endsWith("/list")) {
        return new Response(JSON.stringify([]), { 
          headers: { ...corsHeaders, "Content-Type": "application/json" } 
        });
      }

      // Placeholder for Save
      if (url.pathname.endsWith("/save")) {
        return new Response(JSON.stringify({ success: true }), { headers: corsHeaders });
      }

    } catch (err) {
      return new Response(JSON.stringify({ error: "Server Error", details: err.message }), { 
        status: 500, 
        headers: { ...corsHeaders, "Content-Type": "application/json" } 
      });
    }
  }

  return new Response("Not Found", { status: 404, headers: corsHeaders });
});
