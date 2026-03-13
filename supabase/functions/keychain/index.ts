import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

const kv = await Deno.openKv();

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const url = new URL(req.url);
  const body = await req.json().catch(() => ({}));

  // Helper to check if a user is an admin
  const checkAdmin = async (username: string) => {
    const user = await kv.get(["users", username]);
    return (user.value as any)?.role === "admin";
  };

  if (req.method === "POST") {
    // --- 1. LOGIN ---
    if (url.pathname.endsWith("/auth")) {
      const user = await kv.get(["users", body.username]);
      if (user.value && (user.value as any).password === body.password) {
        return new Response(JSON.stringify({ 
          success: true, 
          role: (user.value as any).role,
          categories: (user.value as any).categories 
        }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      return new Response("Unauthorized", { status: 401, headers: corsHeaders });
    }

    // --- 2. CREATE ACCOUNT (First user becomes Admin) ---
    if (url.pathname.endsWith("/create-account")) {
      const usersIter = kv.list({ prefix: ["users"] });
      const allUsers = [];
      for await (const entry of usersIter) allUsers.push(entry);
      
      const isFirstUser = allUsers.length === 0;
      const existing = await kv.get(["users", body.username]);
      
      if (existing.value) return new Response("User exists", { status: 400, headers: corsHeaders });
      
      const newUser = { 
        password: body.password, 
        role: isFirstUser ? "admin" : "user", 
        categories: ["Personal", "Work", "Finance", "Social"] 
      };
      
      await kv.set(["users", body.username], newUser);
      return new Response(JSON.stringify({ success: true, role: newUser.role }), { headers: corsHeaders });
    }

    // --- 3. ADMIN ONLY: LIST ALL USERS ---
    if (url.pathname.endsWith("/admin-list-users")) {
      if (!await checkAdmin(body.adminUser)) return new Response("Forbidden", { status: 403, headers: corsHeaders });
      
      const users = [];
      const iter = kv.list({ prefix: ["users"] });
      for await (const entry of iter) {
        users.push({ username: entry.key[1], role: (entry.value as any).role });
      }
      return new Response(JSON.stringify(users), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // --- 4. ADMIN ONLY: DELETE ANY USER ---
    if (url.pathname.endsWith("/admin-delete-user")) {
      if (!await checkAdmin(body.adminUser)) return new Response("Forbidden", { status: 403, headers: corsHeaders });
      await kv.delete(["users", body.targetUser]);
      // Also delete their vault
      const vaultIter = kv.list({ prefix: ["users", body.targetUser, "vault"] });
      for await (const entry of vaultIter) await kv.delete(entry.key);
      return new Response(JSON.stringify({ success: true }), { headers: corsHeaders });
    }

    // --- 5. VAULT LOGIC (List, Save, Delete) ---
    if (url.pathname.endsWith("/list")) {
      const items = [];
      const iter = kv.list({ prefix: ["users", body.currentUser, "vault"] });
      for await (const entry of iter) items.push(entry.value);
      return new Response(JSON.stringify(items), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (url.pathname.endsWith("/save")) {
      await kv.set(["users", body.currentUser, "vault", body.entry.domain.toLowerCase()], body.entry);
      return new Response(JSON.stringify({ success: true }), { headers: corsHeaders });
    }
  }

  return new Response("Not Found", { status: 404, headers: corsHeaders });
});
