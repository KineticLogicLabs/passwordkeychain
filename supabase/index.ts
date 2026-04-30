import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  // 1. Handle CORS preflight
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const url = new URL(req.url);
  
  // 2. Check Environment Variables
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
    // 3. JWT Verification
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Missing Authorization header" }), { 
        status: 401, 
        headers: { ...corsHeaders, "Content-Type": "application/json" } 
      });
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);

    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Invalid or expired session", details: authError?.message }), { 
        status: 401, 
        headers: { ...corsHeaders, "Content-Type": "application/json" } 
      });
    }

    // Source of truth for identity
    const authenticatedUser = user.email;
    const body = await req.json().catch(() => ({}));

    // 4. LIST ENTRIES
    if (url.pathname.endsWith("/list")) {
      const { data, error } = await supabase
        .from('vault_entries')
        .select('*')
        .eq('owner', authenticatedUser)
        .order('domain', { ascending: true });

      if (error) throw error;
      return new Response(JSON.stringify(data || []), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // 5. SAVE/UPDATE ENTRY
    if (url.pathname.endsWith("/save")) {
      const entry = body.entry;
      const oldDomain = body.oldDomain;

      if (!entry || !entry.domain) {
        return new Response(JSON.stringify({ error: "Invalid entry data" }), { status: 400, headers: corsHeaders });
      }

      const entryData: any = { 
        owner: authenticatedUser, 
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
          .eq('owner', authenticatedUser)
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

    // 6. DELETE ENTRY
    if (url.pathname.endsWith("/delete")) {
      if (!body.domain) {
        return new Response(JSON.stringify({ error: "Domain required for deletion" }), { status: 400, headers: corsHeaders });
      }

      const { error } = await supabase
        .from('vault_entries')
        .delete()
        .eq('owner', authenticatedUser)
        .eq('domain', body.domain.trim());

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
