import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  // Initialize Supabase Client using internal environment variables
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  );

  const url = new URL(req.url);
  
  if (req.method === "POST") {
    try {
      const body = await req.json();

      // 1. AUTHENTICATION
      if (url.pathname.endsWith("/auth")) {
        const { data: user, error } = await supabase
          .from('vault_users')
          .select('*')
          .eq('username', body.username)
          .eq('password', body.password)
          .single();

        if (user && !error) {
          return new Response(JSON.stringify({ 
            success: true, 
            role: user.role,
            categories: user.categories 
          }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }
        
        return new Response(JSON.stringify({ error: "Invalid credentials" }), { 
          status: 401, 
          headers: { ...corsHeaders, "Content-Type": "application/json" } 
        });
      }

      // 2. UPDATE PROFILE
      if (url.pathname.endsWith("/update-profile")) {
        const { error } = await supabase
          .from('vault_users')
          .update({ username: body.newUsername, password: body.newPassword })
          .eq('username', body.oldUsername);

        if (error) throw error;
        return new Response(JSON.stringify({ success: true }), { 
          headers: { ...corsHeaders, "Content-Type": "application/json" } 
        });
      }

      // 3. CREATE ACCOUNT (Admin Only)
      if (url.pathname.endsWith("/create-account")) {
        // Verify requester is admin
        const { data: admin } = await supabase
          .from('vault_users')
          .select('role')
          .eq('username', body.adminUser)
          .single();

        if (admin?.role !== 'admin') return new Response("Forbidden", { status: 403, headers: corsHeaders });

        const { error } = await supabase
          .from('vault_users')
          .insert([{ username: body.newUsername, password: body.newPassword, role: 'user' }]);

        if (error) throw error;
        return new Response(JSON.stringify({ success: true }), { headers: corsHeaders });
      }

      // 4. VAULT LISTING
      if (url.pathname.endsWith("/list")) {
        const { data, error } = await supabase
          .from('vault_entries')
          .select('*')
          .eq('owner', body.currentUser);

        if (error) throw error;
        return new Response(JSON.stringify(data || []), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      // 5. SAVE ENTRY
      if (url.pathname.endsWith("/save")) {
        const { error } = await supabase
          .from('vault_entries')
          .upsert([{ 
            owner: body.currentUser, 
            domain: body.entry.domain, 
            username: body.entry.username, 
            password: body.entry.password, 
            category: body.entry.category 
          }], { onConflict: 'owner,domain' }); // Note: unique constraint needed for domain-per-user

        if (error) throw error;
        return new Response(JSON.stringify({ success: true }), { headers: corsHeaders });
      }

      // 6. DELETE ENTRY
      if (url.pathname.endsWith("/delete")) {
        const { error } = await supabase
          .from('vault_entries')
          .delete()
          .eq('owner', body.currentUser)
          .eq('domain', body.domain);

        if (error) throw error;
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
