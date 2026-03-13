const kv = await Deno.openKv();

// --- AUTO-SETUP ---
const adminKey = ["users", "admin"];
const initialUser = await kv.get(adminKey);
if (!initialUser.value) {
  await kv.set(adminKey, { password: "password", categories: ["Personal", "Work", "Finance", "Social"] });
}

Deno.serve(async (req: Request) => {
  const url = new URL(req.url);

  if (req.method === "POST") {
    try {
      const body = await req.json();

      if (url.pathname === "/auth") {
        const user = await kv.get(["users", body.username]);
        if (user.value && (user.value as any).password === body.password) {
          return new Response(JSON.stringify({ success: true, categories: (user.value as any).categories || ["Personal", "Work", "Finance", "Social"] }), {
            headers: { "Content-Type": "application/json" },
          });
        }
        return new Response("Unauthorized", { status: 401 });
      }

      if (url.pathname === "/list") {
        const items = [];
        const iter = kv.list({ prefix: ["users", body.currentUser, "vault"] });
        for await (const entry of iter) items.push(entry.value);
        return new Response(JSON.stringify(items), { headers: { "Content-Type": "application/json" } });
      }

      if (url.pathname === "/save-categories") {
        const user = await kv.get(["users", body.currentUser]);
        if (user.value) {
          await kv.set(["users", body.currentUser], { ...(user.value as object), categories: body.categories });
          return new Response(JSON.stringify({ success: true }));
        }
      }

      if (url.pathname === "/save") {
        await kv.set(["users", body.currentUser, "vault", body.entry.domain.toLowerCase()], body.entry);
        return new Response(JSON.stringify({ success: true }));
      }

      if (url.pathname === "/delete") {
        await kv.delete(["users", body.currentUser, "vault", body.domain.toLowerCase()]);
        return new Response(JSON.stringify({ success: true }));
      }

      if (url.pathname === "/create-account") {
        const existing = await kv.get(["users", body.username]);
        if (existing.value) return new Response("User exists", { status: 400 });
        await kv.set(["users", body.username], { password: body.password, categories: ["Personal", "Work", "Finance", "Social"] });
        return new Response(JSON.stringify({ success: true }));
      }
    } catch (err) {
      return new Response("Error", { status: 400 });
    }
  }

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Keychain | Kinetic Logic Labs</title>
    <script src="https://cdn.tailwindcss.com"></script>
    <style>
        @keyframes shake { 0%, 100% { transform: translateX(0); } 25% { transform: translateX(-10px); } 75% { transform: translateX(10px); } }
        .shake { animation: shake 0.2s ease-in-out 0s 2; }
        .toast { transition: transform 0.3s ease, opacity 0.3s ease; transform: translateY(100px); }
        .toast.show { transform: translateY(0); opacity: 1; }
    </style>
</head>
<body class="bg-[#0a0a0a] text-gray-200 p-4 md:p-8 font-sans">
    <div id="toast" class="toast fixed bottom-8 left-1/2 -translate-x-1/2 bg-red-600 text-white px-6 py-3 rounded-full shadow-xl opacity-0 z-50 pointer-events-none">Wrong Password</div>

    <div id="auth-container" class="w-full max-w-md mx-auto mt-20">
        <div class="text-center mb-8">
            <h1 class="text-4xl font-black text-white tracking-tighter">KEYCHAIN</h1>
            <p class="text-blue-500 text-[10px] tracking-[0.3em] uppercase font-bold">Kinetic Logic Labs</p>
        </div>
        <div id="login-card" class="bg-[#171717] border border-[#262626] p-8 rounded-3xl shadow-2xl">
            <input id="auth-user" type="text" placeholder="Username" class="w-full bg-[#0a0a0a] border border-[#262626] p-4 rounded-xl mb-3 text-white outline-none focus:border-blue-500">
            <div class="relative mb-6">
                <input id="auth-pw" type="password" placeholder="Password" class="w-full bg-[#0a0a0a] border border-[#262626] p-4 rounded-xl text-white outline-none focus:border-blue-500">
                <button onclick="togglePw('auth-pw')" class="absolute right-4 top-4 text-xs text-gray-500 hover:text-white uppercase font-bold">Show</button>
            </div>
            <button id="login-btn" onclick="handleLogin()" class="w-full bg-blue-600 hover:bg-blue-500 text-white font-black py-4 rounded-xl transition-all active:scale-95">ACCESS VAULT</button>
        </div>
    </div>

    <div id="vault-screen" class="hidden w-full max-w-4xl mx-auto">
        <div class="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-8">
            <div>
                <h1 class="text-3xl font-black text-white tracking-tight">My Vault</h1>
                <p id="vault-count" class="text-xs text-gray-500 font-mono">0 saved keys</p>
            </div>
            <div class="flex flex-wrap gap-2 w-full md:w-auto">
                <button onclick="toggleSettings()" class="flex-1 md:flex-none bg-[#171717] border border-[#262626] px-6 py-3 rounded-xl font-bold text-sm hover:bg-[#262626]">Settings</button>
                <button onclick="exportVault()" class="flex-1 md:flex-none bg-[#171717] border border-[#262626] px-6 py-3 rounded-xl font-bold text-sm hover:bg-[#262626]">Export</button>
                <button onclick="document.getElementById('import-file').click()" class="flex-1 md:flex-none bg-[#171717] border border-[#262626] px-6 py-3 rounded-xl font-bold text-sm hover:bg-[#262626]">Import</button>
                <button onclick="location.reload()" class="flex-1 md:flex-none bg-red-950/40 text-red-500 border border-red-900/50 px-6 py-3 rounded-xl font-bold text-sm">Lock</button>
                <input type="file" id="import-file" class="hidden" onchange="importVault(event)">
            </div>
        </div>

        <div id="settings-panel" class="hidden bg-[#171717] border border-blue-900/30 p-6 rounded-3xl mb-8">
            <div class="grid md:grid-cols-2 gap-8">
                <div>
                    <h3 class="text-white text-xs font-black mb-4 uppercase text-blue-500">Create Account</h3>
                    <input id="new-acc-user" placeholder="New Username" class="w-full bg-[#0a0a0a] border border-[#262626] p-3 rounded-xl text-sm text-white mb-2">
                    <input id="new-acc-pw" type="password" placeholder="New Password" class="w-full bg-[#0a0a0a] border border-[#262626] p-3 rounded-xl text-sm text-white mb-4">
                    <button onclick="createNewAccount()" class="w-full bg-blue-600 py-3 rounded-xl text-xs font-bold">Register User</button>
                </div>
                <div>
                    <h3 class="text-white text-xs font-black mb-4 uppercase text-blue-500">Manage Categories</h3>
                    <textarea id="cat-editor" class="w-full bg-[#0a0a0a] border border-[#262626] p-3 rounded-xl text-sm text-white h-24 mb-2" placeholder="Enter categories separated by commas"></textarea>
                    <button onclick="updateCategories()" class="w-full bg-gray-700 py-3 rounded-xl text-xs font-bold">Update Categories</button>
                </div>
            </div>
        </div>

        <div class="flex gap-4 mb-6">
            <input id="search" oninput="loadVault()" placeholder="Search vault..." class="flex-1 bg-[#171717] border border-[#262626] p-4 rounded-2xl outline-none text-white focus:border-blue-500">
            <div class="bg-[#171717] border border-[#262626] rounded-2xl p-1 flex">
                <button onclick="setView('list')" id="btn-list" class="px-4 py-2 rounded-xl text-xs font-bold bg-blue-600 text-white">List</button>
                <button onclick="setView('card')" id="btn-card" class="px-4 py-2 rounded-xl text-xs font-bold text-gray-400">Cards</button>
            </div>
        </div>

        <div class="bg-[#171717] border border-[#262626] p-6 rounded-3xl mb-8">
            <div class="grid grid-cols-1 md:grid-cols-4 gap-3 mb-4">
                <input id="dom" placeholder="Domain" class="bg-[#0a0a0a] border border-[#262626] p-3 rounded-xl text-sm text-white">
                <input id="usr" placeholder="Username" class="bg-[#0a0a0a] border border-[#262626] p-3 rounded-xl text-sm text-white">
                <div class="relative">
                    <input id="pwd" placeholder="Password" class="w-full bg-[#0a0a0a] border border-[#262626] p-3 rounded-xl text-sm text-white">
                    <button onclick="generatePass()" class="absolute right-2 top-2 bg-blue-600/20 text-blue-400 px-2 py-1 rounded text-[10px] font-bold">GEN</button>
                </div>
                <select id="cat" class="bg-[#0a0a0a] border border-[#262626] p-3 rounded-xl text-sm text-white outline-none"></select>
            </div>
            <button onclick="saveEntry()" class="w-full bg-blue-600 font-black py-4 rounded-xl hover:bg-blue-500 transition-colors">SAVE SECURE ENTRY</button>
        </div>

        <div id="vault-list" class="grid gap-3"></div>
    </div>

    <script>
        let currentUser = "";
        let currentCategories = [];
        let viewMode = 'list';
        let currentFilter = "All";

        function showToast(msg) {
            const t = document.getElementById('toast');
            t.innerText = msg;
            t.classList.add('show');
            setTimeout(() => t.classList.remove('show'), 3000);
        }

        function togglePw(id) {
            const el = document.getElementById(id);
            el.type = el.type === 'password' ? 'text' : 'password';
        }

        function generatePass() {
            const chars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*()_+";
            let p = "";
            for(let i=0; i<16; i++) p += chars.charAt(Math.floor(Math.random() * chars.length));
            document.getElementById('pwd').value = p;
        }

        function toggleSettings() {
            document.getElementById('settings-panel').classList.toggle('hidden');
        }

        function setView(mode) {
            viewMode = mode;
            document.getElementById('btn-list').className = mode === 'list' ? 'px-4 py-2 rounded-xl text-xs font-bold bg-blue-600 text-white' : 'px-4 py-2 rounded-xl text-xs font-bold text-gray-400';
            document.getElementById('btn-card').className = mode === 'card' ? 'px-4 py-2 rounded-xl text-xs font-bold bg-blue-600 text-white' : 'px-4 py-2 rounded-xl text-xs font-bold text-gray-400';
            loadVault();
        }

        async function handleLogin() {
            const userInp = document.getElementById('auth-user');
            const passInp = document.getElementById('auth-pw');
            const card = document.getElementById('login-card');
            
            try {
                const res = await fetch('/auth', { 
                    method: 'POST', body: JSON.stringify({ username: userInp.value, password: passInp.value }) 
                });
                const data = await res.json();
                if(res.ok) {
                    currentUser = userInp.value;
                    currentCategories = data.categories;
                    renderCategoryOptions();
                    document.getElementById('auth-container').classList.add('hidden');
                    document.getElementById('vault-screen').classList.remove('hidden');
                    loadVault();
                } else { throw new Error(); }
            } catch {
                card.classList.add('shake');
                showToast("Invalid Credentials");
                setTimeout(() => card.classList.remove('shake'), 400);
            }
        }

        function renderCategoryOptions() {
            const select = document.getElementById('cat');
            const editor = document.getElementById('cat-editor');
            select.innerHTML = currentCategories.map(c => \`<option value="\${c}">\${c}</option>\`).join('');
            editor.value = currentCategories.join(', ');
        }

        async function updateCategories() {
            const cats = document.getElementById('cat-editor').value.split(',').map(s => s.trim()).filter(s => s);
            const res = await fetch('/save-categories', {
                method: 'POST', body: JSON.stringify({ currentUser, categories: cats })
            });
            if(res.ok) {
                currentCategories = cats;
                renderCategoryOptions();
                alert("Categories Updated");
            }
        }

        async function saveEntry() {
            const entry = { 
                domain: document.getElementById('dom').value, 
                username: document.getElementById('usr').value, 
                password: document.getElementById('pwd').value,
                category: document.getElementById('cat').value 
            };
            if(!entry.domain) return;
            await fetch('/save', { method: 'POST', body: JSON.stringify({ currentUser, entry }) });
            ['dom', 'usr', 'pwd'].forEach(id => document.getElementById(id).value = "");
            loadVault();
        }

        async function loadVault() {
            const res = await fetch('/list', { method: 'POST', body: JSON.stringify({ currentUser }) });
            const data = await res.json();
            const q = document.getElementById('search').value.toLowerCase();
            const list = document.getElementById('vault-list');
            list.innerHTML = "";
            list.className = viewMode === 'list' ? 'grid gap-3' : 'grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4';

            const filtered = data.filter(i => i.domain.toLowerCase().includes(q) || i.username.toLowerCase().includes(q));
            document.getElementById('vault-count').innerText = filtered.length + ' entries';

            filtered.forEach(item => {
                if(viewMode === 'list') {
                    list.innerHTML += \`
                    <div class="bg-[#171717] border border-[#262626] p-4 rounded-2xl flex justify-between items-center">
                        <div>
                            <span class="text-white font-bold">\${item.domain}</span>
                            <span class="text-[10px] ml-2 text-blue-500 font-bold uppercase">\${item.category}</span>
                            <div class="text-gray-500 text-xs font-mono">\${item.username}</div>
                        </div>
                        <div class="flex gap-4">
                            <button onclick="alert('Password: ' + '\${item.password}')" class="text-blue-500 text-xs font-bold">VIEW</button>
                            <button onclick="deleteEntry('\${item.domain}')" class="text-red-500 text-xs font-bold">DELETE</button>
                        </div>
                    </div>\`;
                } else {
                    list.innerHTML += \`
                    <div onclick="alert('User: \${item.username}\\nPass: \${item.password}')" class="bg-[#171717] border border-[#262626] p-6 rounded-3xl cursor-pointer hover:border-blue-500 transition-all group">
                        <div class="text-blue-500 text-[10px] font-black uppercase mb-1">\${item.category}</div>
                        <div class="text-white font-black text-xl mb-1 group-hover:text-blue-400">\${item.domain}</div>
                        <div class="text-gray-500 text-sm font-mono truncate">\${item.username}</div>
                    </div>\`;
                }
            });
        }

        async function deleteEntry(domain) {
            if(!confirm("Delete this entry?")) return;
            await fetch('/delete', { method: 'POST', body: JSON.stringify({ currentUser, domain }) });
            loadVault();
        }

        async function createNewAccount() {
            const username = document.getElementById('new-acc-user').value;
            const password = document.getElementById('new-acc-pw').value;
            const res = await fetch('/create-account', { method: 'POST', body: JSON.stringify({ username, password }) });
            if(res.ok) alert("Account created!");
        }

        async function exportVault() {
            const res = await fetch('/list', { method: 'POST', body: JSON.stringify({ currentUser }) });
            const data = await res.json();
            const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url; a.download = 'vault.json'; a.click();
        }
  </script>
</body>
</html>`; // <--- Add this backtick here to close the string

  return new Response(html, { headers: { "Content-Type": "text/html" } });
});
