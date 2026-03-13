const kv = await Deno.openKv();

// --- AUTO-SETUP ---
const initialUser = await kv.get(["users", "admin"]);
if (!initialUser.value) {
  await kv.set(["users", "admin"], { password: "password" });
}

Deno.serve(async (req: Request) => {
  const url = new URL(req.url);

  if (req.method === "POST") {
    const body = await req.json();

    if (url.pathname === "/auth") {
      const user = await kv.get(["users", body.username]);
      if (user.value && (user.value as any).password === body.password) {
        return new Response(JSON.stringify({ success: true }));
      }
      return new Response("Unauthorized", { status: 401 });
    }

    if (url.pathname === "/list") {
      const items = [];
      const iter = kv.list({ prefix: ["users", body.currentUser, "vault"] });
      for await (const entry of iter) items.push(entry.value);
      return new Response(JSON.stringify(items));
    }

    if (url.pathname === "/save") {
      await kv.set(["users", body.currentUser, "vault", body.entry.domain.toLowerCase()], body.entry);
      return new Response(JSON.stringify({ success: true }));
    }

    if (url.pathname === "/delete") {
      await kv.delete(["users", body.currentUser, "vault", body.domain]);
      return new Response(JSON.stringify({ success: true }));
    }

    if (url.pathname === "/update-account") {
      const oldEntries = [];
      const iter = kv.list({ prefix: ["users", body.oldUser, "vault"] });
      for await (const entry of iter) oldEntries.push(entry);
      
      await kv.set(["users", body.newUser], { password: body.newPassword });
      
      for (const entry of oldEntries) {
        const domain = (entry.key[3] as string);
        await kv.set(["users", body.newUser, "vault", domain], entry.value);
        await kv.delete(["users", body.oldUser, "vault", domain]);
      }
      if (body.oldUser !== body.newUser) await kv.delete(["users", body.oldUser]);
      return new Response(JSON.stringify({ success: true }));
    }
  }

  if (url.pathname !== "/") {
    return new Response("Not Found", { status: 404 });
  }

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Password Keychain | Kinetic Logic Labs</title>
    <script src="https://cdn.tailwindcss.com"></script>
    <script>tailwind.config = { theme: { extend: { colors: { brand: { bg: '#0a0a0a', card: '#171717', border: '#262626', primary: '#3b82f6', accent: '#60a5fa' } } } } }</script>
    <style>
        .modal-bg { background: rgba(0,0,0,0.85); backdrop-filter: blur(4px); }
        .hidden { display: none !important; }
        @keyframes spin { to { transform: rotate(360deg); } }
        .spinner { width: 24px; height: 24px; border: 3px solid rgba(255,255,255,0.1); border-top-color: #3b82f6; border-radius: 50%; animation: spin 0.8s linear infinite; }
        @keyframes shake { 0%, 100% { transform: translateX(0); } 25% { transform: translateX(-8px); } 50% { transform: translateX(8px); } 75% { transform: translateX(-8px); } }
        .shake { animation: shake 0.4s ease-in-out; border-color: #ef4444 !important; }
    </style>
</head>
<body class="bg-brand-bg text-gray-200 min-h-screen flex flex-col items-center p-6 transition-opacity duration-500">
    <div id="loader" class="hidden fixed inset-0 z-[200] modal-bg flex items-center justify-center"><div class="spinner"></div></div>
    <div id="auth-container" class="w-full max-w-md mt-20">
        <div class="text-center mb-8">
            <h1 class="text-3xl font-bold text-white tracking-tight">Password Keychain</h1>
            <p class="text-brand-accent text-sm font-medium uppercase tracking-widest mt-1">By Kinetic Logic Labs</p>
        </div>
        <div id="login-card" class="bg-brand-card border border-brand-border p-8 rounded-2xl shadow-2xl">
            <h2 class="text-white font-bold mb-6 text-xl">Log In</h2>
            <input id="auth-user" placeholder="Username" class="w-full bg-brand-bg border border-brand-border p-3 rounded-lg mb-3 outline-none focus:border-brand-primary transition text-white">
            <div class="relative mb-6">
                <input id="auth-pw" type="password" placeholder="Master Password" class="w-full bg-brand-bg border border-brand-border p-3 rounded-lg outline-none focus:border-brand-primary transition text-white pr-12">
                <button onclick="toggleLoginVisibility()" class="absolute right-3 top-3.5 text-gray-500 hover:text-brand-primary transition">
                    <svg id="eye-icon" class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"></path><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"></path></svg>
                </button>
            </div>
            <button onclick="handleLogin()" class="w-full bg-brand-primary hover:bg-blue-600 text-white font-bold py-3 rounded-lg transition">Access Vault</button>
            <p id="login-error" class="text-red-500 text-sm text-center mt-4 opacity-0 transition-opacity">Invalid Credentials</p>
        </div>
    </div>
    <div id="vault-screen" class="hidden w-full max-w-2xl">
        <div class="flex justify-between items-center mb-8">
            <h1 class="text-2xl font-bold text-white">My Vault</h1>
            <div class="flex gap-2">
                <button onclick="document.getElementById('settings-panel').classList.toggle('hidden')" class="text-xs bg-brand-card border border-brand-border px-4 py-2 rounded-lg">Settings</button>
                <button onclick="location.reload()" class="text-xs bg-brand-card border border-brand-border px-4 py-2 rounded-lg">Lock</button>
            </div>
        </div>
        <div id="settings-panel" class="hidden bg-brand-card border border-brand-primary/30 p-6 rounded-2xl mb-8">
            <div class="grid grid-cols-2 gap-3 mb-4">
                <input id="new-user" placeholder="New User" class="bg-brand-bg border p-2 rounded text-white text-sm">
                <input id="new-pass" type="password" placeholder="New Pass" class="bg-brand-bg border p-2 rounded text-white text-sm">
            </div>
            <button onclick="updateAccount()" class="w-full bg-slate-800 py-2 rounded-lg font-bold text-xs">Sync Changes</button>
        </div>
        <input id="search" oninput="loadVault()" placeholder="Search..." class="w-full bg-brand-card border border-brand-border p-3 rounded-xl mb-6 outline-none text-white">
        <div class="bg-brand-card border border-brand-border p-6 rounded-2xl mb-8">
            <div class="grid grid-cols-2 gap-3 mb-3">
                <input id="dom" placeholder="Domain" class="bg-brand-bg border p-2 rounded text-sm text-white">
                <input id="usr" placeholder="User" class="bg-brand-bg border p-2 rounded text-sm text-white">
            </div>
            <input id="pwd" placeholder="Pass" class="w-full bg-brand-bg border p-2 rounded mb-4 text-sm text-white">
            <button onclick="saveEntry()" class="w-full bg-brand-primary font-bold py-2 rounded-lg">Add Entry</button>
        </div>
        <div id="vault-list" class="space-y-3"></div>
    </div>
    <script>
        let currentUser = "";
        async function handleLogin() {
            const username = document.getElementById('auth-user').value;
            const password = document.getElementById('auth-pw').value;
            const res = await fetch('/auth', { method: 'POST', body: JSON.stringify({ username, password }) });
            if(res.ok) {
                currentUser = username;
                document.getElementById('auth-container').classList.add('hidden');
                document.getElementById('vault-screen').classList.remove('hidden');
                loadVault();
            } else {
                document.getElementById('login-card').classList.add('shake');
                document.getElementById('login-error').style.opacity = 1;
                setTimeout(() => { document.getElementById('login-card').classList.remove('shake'); }, 400);
            }
        }
        function toggleLoginVisibility() {
            const pw = document.getElementById('auth-pw');
            pw.type = pw.type === 'password' ? 'text' : 'password';
        }
        async function updateAccount() {
            const newUser = document.getElementById('new-user').value;
            const newPassword = document.getElementById('new-pass').value;
            await fetch('/update-account', { method: 'POST', body: JSON.stringify({ oldUser: currentUser, newUser, newPassword }) });
            location.reload();
        }
        async function saveEntry() {
            const entry = { domain: document.getElementById('dom').value, username: document.getElementById('usr').value, password: document.getElementById('pwd').value };
            await fetch('/save', { method: 'POST', body: JSON.stringify({ currentUser, entry }) });
            loadVault();
        }
        async function loadVault() {
            const res = await fetch('/list', { method: 'POST', body: JSON.stringify({ currentUser }) });
            const data = await res.json();
            const q = document.getElementById('search').value.toLowerCase();
            const list = document.getElementById('vault-list');
            list.innerHTML = "";
            data.filter(i => i.domain.toLowerCase().includes(q)).forEach(item => {
                // REWRITTEN TO AVOID TEMPLATE LITERALS ENTIRELY
                var row = '<div class="bg-brand-card border border-brand-border p-4 rounded-xl flex justify-between"><div>';
                row += '<div class="text-white font-bold">' + item.domain + '</div>';
                row += '<div class="text-gray-500 text-xs font-mono">' + item.username + '</div></div>';
                row += '<button onclick="deleteEntry(\'' + item.domain + '\')" class="text-red-500 text-xs font-bold transition px-2">Delete</button></div>';
                list.innerHTML += row;
            });
        }
        async function deleteEntry(domain) {
            await fetch('/delete', { method: 'POST', body: JSON.stringify({ currentUser, domain }) });
            loadVault();
        }
        document.addEventListener('keydown', (e) => { if (e.key === 'Enter') handleLogin(); });
    </script>
</body>
</html>\`;

  return new Response(html, { headers: { "Content-Type": "text/html" } });
});
