import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const url = new URL(req.url);
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  );

  try {
    const body = await req.json().catch(() => ({}));

    if (url.pathname.endsWith("/login")) {
      const { data: user, error } = await supabase
        .from('vault_users')
        .select('username, role, token')
        .eq('username', body.username)
        .eq('password', body.password)
        .single();

      if (error || !user) return new Response(JSON.stringify({ error: "Invalid credentials" }), { status: 401, headers: corsHeaders });
      
      return new Response(JSON.stringify({ token: user.token, username: user.username, role: user.role }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const authHeader = req.headers.get('Authorization');
    const token = authHeader?.replace('Bearer ', '');
    if (!token) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: corsHeaders });

    const { data: user, error: userError } = await supabase.from('vault_users').select('username, role').eq('token', token).single();
    if (userError || !user) return new Response(JSON.stringify({ error: "Invalid token" }), { status: 401, headers: corsHeaders });

    const authenticatedUser = user.username;

    // --- ACCOUNT MANAGEMENT ENDPOINTS ---

    if (url.pathname.endsWith("/update-account")) {
      const { newUsername, newPassword } = body;
      const updates: any = {};
      if (newUsername) updates.username = newUsername;
      if (newPassword) updates.password = newPassword;

      const { error } = await supabase
        .from('vault_users')
        .update(updates)
        .eq('username', authenticatedUser);

      if (error) throw error;
      return new Response(JSON.stringify({ success: true }), { headers: corsHeaders });
    }

    if (url.pathname.endsWith("/delete-account")) {
      const { error } = await supabase
        .from('vault_users')
        .delete()
        .eq('username', authenticatedUser);

      if (error) throw error;
      return new Response(JSON.stringify({ success: true }), { headers: corsHeaders });
    }

    // --- VAULT ENTRY ENDPOINTS ---

    if (url.pathname.endsWith("/list")) {
      const { data } = await supabase.from('vault_entries').select('*').eq('owner', authenticatedUser).order('domain', { ascending: true });
      return new Response(JSON.stringify(data || []), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (url.pathname.endsWith("/save")) {
      const entryData = { 
        owner: authenticatedUser, 
        domain: body.entry.domain.trim(),
        username: body.entry.username || '', 
        password: body.entry.password || '', 
        category: body.entry.category || 'Personal',
        notes: body.entry.notes || '',
        is_hidden: body.entry.is_hidden || false,
        updated_at: new Date().toISOString()
      };

      if (body.oldDomain && body.oldDomain !== entryData.domain) {
        await supabase.from('vault_entries').delete().eq('owner', authenticatedUser).eq('domain', body.oldDomain);
        const { error } = await supabase.from('vault_entries').insert([entryData]);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('vault_entries').upsert(entryData, { onConflict: 'owner,domain' });
        if (error) throw error;
      }
      return new Response(JSON.stringify({ success: true }), { headers: corsHeaders });
    }

    if (url.pathname.endsWith("/delete")) {
      const { error } = await supabase.from('vault_entries').delete().eq('owner', authenticatedUser).eq('domain', body.domain?.trim());
      if (error) throw error;
      return new Response(JSON.stringify({ success: true }), { headers: corsHeaders });
    }

    if (url.pathname.endsWith("/admin-create-user") && user.role === 'admin') {
      const { error } = await supabase.from('vault_users').insert([{ username: body.newUsername, password: body.newPassword, role: 'user' }]);
      if (error) throw error;
      return new Response(JSON.stringify({ success: true }), { headers: corsHeaders });
    }

    return new Response("Not Found", { status: 404, headers: corsHeaders });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
