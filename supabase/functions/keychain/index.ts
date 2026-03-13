import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

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
        return new Response(JSON.stringify({ error: "Invalid credentials" }), { status: 401, headers: corsHeaders });
      }

      // 2. SAVE ENTRY (Fixed with Normalization and Error Logging)
      if (url.pathname.endsWith("/save")) {
        if (!body.currentUser || !body.entry.domain) {
          return new Response("Missing required fields", { status: 400, headers: corsHeaders });
        }

        const { error } = await supabase
          .from('vault_entries')
          .upsert([{ 
            owner: body.currentUser, 
            domain: body.entry.domain.toLowerCase().trim(), // Normalize domain
            username: body.entry.username, 
            password: body.entry.password, 
            category: body.entry.category 
          }], { onConflict: 'owner,domain' });

        if (error) {
          console.error("Database Upsert Error:", error.message);
          throw error;
        }
        
        return new Response(JSON.stringify({ success: true }), { headers: corsHeaders });
      }

      // 3. VAULT LISTING
      if (url.pathname.endsWith("/list")) {
        const { data, error } = await supabase
          .from('vault_entries')
          .select('*')
          .eq('owner', body.currentUser)
          .order('domain', { ascending: true });

        if (error) throw error;
        return new Response(JSON.stringify(data || []), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      // 4. DELETE ENTRY
      if (url.pathname.endsWith("/delete")) {
        const { error } = await supabase
          .from('vault_entries')
          .delete()
          .eq('owner', body.currentUser)
          .eq('domain', body.domain.toLowerCase().trim());

        if (error) throw error;
        return new Response(JSON.stringify({ success: true }), { headers: corsHeaders });
      }

      // 5. UPDATE PROFILE
      if (url.pathname.endsWith("/update-profile")) {
        const { error } = await supabase
          .from('vault_users')
          .update({ username: body.newUsername, password: body.newPassword })
          .eq('username', body.oldUsername);

        if (error) throw error;
        return new Response(JSON.stringify({ success: true }), { headers: corsHeaders });
      }

      // 6. ADMIN: LIST ALL USERS
      if (url.pathname.endsWith("/list-all-users")) {
        const { data: admin } = await supabase.from('vault_users').select('role').eq('username', body.adminUser).single();
        if (admin?.role !== 'admin') return new Response("Forbidden", { status: 403, headers: corsHeaders });

        const { data: users, error: userError } = await supabase.from('vault_users').select('username, password, role');
        const { data: counts } = await supabase.from('vault_entries').select('owner');
        
        const processedUsers = users.map(u => ({
            ...u,
            entryCount: counts?.filter(c => c.owner === u.username).length || 0
        }));

        return new Response(JSON.stringify(processedUsers), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
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
