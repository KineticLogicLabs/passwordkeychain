import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  // 1. Handle CORS Preflight
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const url = new URL(req.url);
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  );

  try {
    const body = await req.json().catch(() => ({}));

    // 2. Public Endpoint: Login (This is the ONLY way to get a token)
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

    // 3. THE BOUNCER: Check for token on EVERY other request
    const authHeader = req.headers.get('Authorization');
    const token = authHeader?.replace('Bearer ', '');

    if (!token) {
      return new Response(JSON.stringify({ error: "Access Denied: Token Required" }), { status: 401, headers: corsHeaders });
    }

    // Verify token against database
    const { data: user, error: userError } = await supabase
      .from('vault_users')
      .select('username, role')
      .eq('token', token)
      .single();

    if (userError || !user) {
      return new Response(JSON.stringify({ error: "Invalid or Expired Token" }), { status: 401, headers: corsHeaders });
    }

    const authenticatedUser = user.username;

    // 4. Secure Endpoints (Now using ONLY authenticatedUser)
    if (url.pathname.endsWith("/list")) {
      const { data } = await supabase
        .from('vault_entries')
        .select('*')
        .eq('owner', authenticatedUser) // Ignores any 'currentUser' in body
        .order('domain', { ascending: true });
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

      const { error } = await supabase.from('vault_entries').upsert(entryData, { onConflict: 'owner,domain' });
      if (error) throw error;
      return new Response(JSON.stringify({ success: true }), { headers: corsHeaders });
    }

    // Delete Entry Endpoint
    if (url.pathname.endsWith("/delete")) {
      const { error } = await supabase
        .from('vault_entries')
        .delete()
        .eq('owner', authenticatedUser)
        .eq('domain', body.domain?.trim());

      if (error) throw error;
      return new Response(JSON.stringify({ success: true }), { headers: corsHeaders });
    }

    return new Response("Not Found", { status: 404, headers: corsHeaders });

  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: corsHeaders });
  }
});
