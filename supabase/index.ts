import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// In a real production app, this should be restricted to your domain.
// In the AI Studio preview environment, we use '*' to allow the iframe and dev URLs.
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const url = new URL(req.url);
  
  // Environment variables are provided by the Supabase project configuration
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

  if (!supabaseUrl || !supabaseServiceKey) {
    return new Response(JSON.stringify({ 
      error: "Server Configuration Error", 
      details: "Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY environment variables." 
    }), { 
      status: 500, 
      headers: { ...corsHeaders, "Content-Type": "application/json" } 
    });
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey);
  
  try {
    const body = await req.json().catch(() => ({}));

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

    // 2. LIST ENTRIES
    if (url.pathname.endsWith("/list")) {
      const { data, error } = await supabase
        .from('vault_entries')
        .select('*')
        .eq('owner', body.currentUser)
        .order('domain', { ascending: true });

      if (error) throw error;
      return new Response(JSON.stringify(data || []), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // 3. SAVE/UPDATE ENTRY
    if (url.pathname.endsWith("/save")) {
      const owner = body.currentUser;
      const entry = body.entry;
      const oldDomain = body.oldDomain;

      const entryData: any = { 
        owner: owner, 
        domain: entry.domain.trim(),
        username: entry.username || '', 
        password: entry.password || '', 
        category: entry.category || 'Personal',
        notes: entry.notes || '',
        is_hidden: entry.is_hidden || false,
        updated_at: new Date().toISOString()
      };

      // Handle domain change (since domain/owner is part of unique constraint)
      if (oldDomain && oldDomain !== entryData.domain) {
        await supabase
          .from('vault_entries')
          .delete()
          .eq('owner', owner)
          .eq('domain', oldDomain);
        
        if (body.createdAt) entryData.created_at = body.createdAt;
        const { error: insError } = await supabase.from('vault_entries').insert([entryData]);
        if (insError) throw insError;
      } else {
        const { error: upsError } = await supabase
          .from('vault_entries')
          .upsert(entryData, { onConflict: 'owner,domain' });
        if (upsError) throw upsError;
      }

      return new Response(JSON.stringify({ success: true }), { headers: corsHeaders });
    }

    // 4. DELETE ENTRY
    if (url.pathname.endsWith("/delete")) {
      const { error } = await supabase
        .from('vault_entries')
        .delete()
        .eq('owner', body.currentUser)
        .eq('domain', body.domain?.trim());

      if (error) throw error;
      return new Response(JSON.stringify({ success: true }), { headers: corsHeaders });
    }

    // 5. UPDATE PROFILE
    if (url.pathname.endsWith("/update-profile")) {
      const updateData: any = {};
      if (body.newUsername) updateData.username = body.newUsername;
      if (body.newPassword) updateData.password = body.newPassword;
      if (body.newCategories) updateData.categories = body.newCategories;

      const { error } = await supabase
        .from('vault_users')
        .update(updateData)
        .eq('username', body.oldUsername);

      if (error) throw error;
      return new Response(JSON.stringify({ success: true }), { headers: corsHeaders });
    }

    // 6. ADMIN: LIST ALL USERS
    if (url.pathname.endsWith("/list-all-users")) {
      const { data: admin } = await supabase.from('vault_users').select('role').eq('username', body.adminUser).single();
      if (admin?.role !== 'admin') {
        return new Response(JSON.stringify({ error: "Forbidden" }), { status: 403, headers: corsHeaders });
      }

      const { data: users } = await supabase.from('vault_users').select('username, password, role');
      const { data: counts } = await supabase.from('vault_entries').select('owner');
      
      const processedUsers = (users || []).map(u => ({
          ...u,
          entryCount: (counts || []).filter(c => c.owner === u.username).length || 0
      }));

      return new Response(JSON.stringify(processedUsers), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // 7. ADMIN: CREATE ACCOUNT
    if (url.pathname.endsWith("/create-account")) {
      const { data: admin } = await supabase.from('vault_users').select('role').eq('username', body.adminUser || '').single();
      if (!admin || admin.role !== 'admin') {
        return new Response(JSON.stringify({ error: "Forbidden" }), { status: 403, headers: corsHeaders });
      }

      const { error } = await supabase
        .from('vault_users')
        .insert([{ username: body.newUsername, password: body.newPassword, role: 'user' }]);

      if (error) throw error;
      return new Response(JSON.stringify({ success: true }), { headers: corsHeaders });
    }

    // 8. ADMIN: DELETE USER
    if (url.pathname.endsWith("/admin-delete-user")) {
      const { data: admin } = await supabase.from('vault_users').select('role').eq('username', body.adminUser).single();
      if (admin?.role !== 'admin') {
        return new Response(JSON.stringify({ error: "Forbidden" }), { status: 403, headers: corsHeaders });
      }

      const { error } = await supabase.from('vault_users').delete().eq('username', body.targetUser);
      if (error) throw error;
      return new Response(JSON.stringify({ success: true }), { headers: corsHeaders });
    }

    // 9. DELETE SELF ACCOUNT
    if (url.pathname.endsWith("/delete-self-account")) {
      const { username, password } = body;
      const { data: user } = await supabase
        .from('vault_users')
        .select('role')
        .eq('username', username)
        .eq('password', password)
        .single();

      if (!user) {
        return new Response(JSON.stringify({ error: "Verification Failed" }), { status: 401, headers: corsHeaders });
      }

      const { error } = await supabase.from('vault_users').delete().eq('username', username);
      if (error) throw error;
      return new Response(JSON.stringify({ success: true }), { headers: corsHeaders });
    }

    return new Response("Not Found", { status: 404, headers: corsHeaders });

  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), { 
      status: 500, 
      headers: { ...corsHeaders, "Content-Type": "application/json" } 
    });
  }
});
