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
          return new Response(JSON.stringify({ success: true, categories: (user.value as any).categories || [] }), {
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

      if (url.pathname === "/list-trash") {
        const items = [];
        const iter = kv.list({ prefix: ["users", body.currentUser, "trash"] });
        for await (const entry of iter) items.push(entry.value);
        return new Response(JSON.stringify(items), { headers: { "Content-Type": "application/json" } });
      }

      if (url.pathname === "/trash-entry") {
        const key = ["users", body.currentUser, "vault", body.domain.toLowerCase()];
        const entry = await kv.get(key);
        if (entry.value) {
          const trashEntry = { ...entry.value, deletedAt: Date.now() };
          await kv.set(["users", body.currentUser, "trash", body.domain.toLowerCase()], trashEntry);
          await kv.delete(key);
        }
        return new Response(JSON.stringify({ success: true }));
      }

      if (url.pathname === "/perm-delete") {
        await kv.delete(["users", body.currentUser, "trash", body.domain.toLowerCase()]);
        return new Response(JSON.stringify({ success: true }));
      }

      if (url.pathname === "/restore") {
        const key = ["users", body.currentUser, "trash", body.domain.toLowerCase()];
        const entry = await kv.get(key);
        if (entry.value) {
          await kv.set(["users", body.currentUser, "vault", body.domain.toLowerCase()], entry.value);
          await kv.delete(key);
        }
        return new Response(JSON.stringify({ success: true }));
      }

      if (url.pathname === "/save") {
        await kv.set(["users", body.currentUser, "vault", body.entry.domain.toLowerCase()], body.entry);
        return new Response(JSON.stringify({ success: true }));
      }

      if (url.pathname === "/create-account") {
        const existing = await kv.get(["users", body.username]);
        if (existing.value) return new Response("User exists", { status: 400 });
        await kv.set(["users", body.username], { password: body.password, categories: ["Personal", "Work", "Finance", "Social"] });
        return new Response(JSON.stringify({ success: true }));
      }
    } catch (err) { return new Response("Error", { status: 400 }); }
  }

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Password Keychain | Kinetic Logic Labs</title>
    <script src="https://cdn.tailwindcss.com"></script>
    <style>
        @keyframes shake { 0%, 100% { transform: translateX(0); } 25% { transform: translateX(-8px); } 75% { transform: translateX(8px); } }
        .shake { animation: shake 0.15s ease-in-out 0s 2; }
        .modal-bg { backdrop-filter: blur(12px); background: rgba(0,0,0,0.7); }
        .toast-pop { animation: popUp 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275) forwards; }
        @keyframes popUp { from { transform: translateY(100px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
        .custom-scrollbar::-webkit-scrollbar { width: 4px; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #262626; border-radius: 10px; }
    </style>
</head>
<body class="bg-[#0a0a0a] text-gray-200 p-4 md:p-8 font-sans selection:bg-blue-500/30">
    
    <div id="toast-container" class="fixed bottom-10 inset-x-0 flex justify-center z-[100] hidden">
        <div class="toast-pop bg-red-600 text-white px-8 py-4 rounded-2xl shadow-2xl font-bold border border-red-400">Authentication Failed</div>
    </div>

    <div id="detail-modal" class="hidden fixed inset-0 z-50 flex items-center justify-center p-4 modal-bg">
        <div class="bg-[#171717] border border-[#262626] w-full max-w-lg rounded-[2.5rem] p-8 shadow-2xl relative">
            <button onclick="closeModal()" class="absolute top-8 right-8 text-gray-500 hover:text-white text-2xl">&times;</button>
            <div id="modal-content"></div>
        </div>
    </div>

    <div id="auth-container" class="w-full max-w-md mx-auto mt-20">
        <div class="text-center mb-10">
            <h1 class="text-4xl font-black text-white tracking-tight">Password Keychain</h1>
            <p class="text-blue-500 text-xs tracking-widest mt-2 uppercase font-bold">By Kinetic Logic Labs</p>
        </div>
        <div id="login-card" class="bg-[#171717] border border-[#262626] p-8 rounded-[2.5rem]">
            <div class="space-y-4">
                <input id="auth-user" type="text" placeholder="Username" class="w-full bg-[#0a0a0a] border border-[#262626] p-4 rounded-2xl text-white outline-none focus:border-blue-500">
                <input id="auth-pw" type="password" placeholder="Password" class="w-full bg-[#0a0a0a] border border-[#262626] p-4 rounded-2xl text-white outline-none focus:border-blue-500">
            </div>
            <button onclick="handleLogin()" class="w-full bg-blue-600 hover:bg-blue-500 text-white font-black py-5 rounded-2xl mt-8 transition-all active:scale-95">ACCESS VAULT</button>
            <p id="error-msg" class="text-red-500 text-center text-sm font-bold mt-4 opacity-0 transition-opacity">Invalid Password</p>
        </div>
    </div>

    <div id="vault-screen" class="hidden w-full max-w-5xl mx-auto">
        <div class="flex flex-col md:flex-row justify-between items-end gap-6 mb-10">
            <div>
                <p class="text-blue-500 text-[10px] tracking-widest uppercase font-black mb-1">Kinetic Logic Labs</p>
                <h1 class="text-4xl font-black text-white tracking-tight">Vault</h1>
            </div>
            <div class="flex flex-wrap gap-3">
                <button onclick="showTrash()" class="bg-[#171717] border border-[#262626] px-6 py-4 rounded-2xl font-black text-xs hover:text-blue-400 transition-colors uppercase">Trash Folder</button>
                <button onclick="location.reload()" class="bg-red-950/30 text-red-500 border border-red-900/40 px-8 py-4 rounded-2xl font-black text-xs uppercase tracking-widest">Lock</button>
            </div>
        </div>

        <div class="bg-[#171717] border border-[#262626] p-8 rounded-[2.5rem] mb-10 shadow-xl">
            <div class="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                <input id="dom" placeholder="Domain" class="bg-[#0a0a0a] border border-[#262626] p-4 rounded-xl text-sm text-white outline-none">
                <input id="usr" placeholder="Username" class="bg-[#0a0a0a] border border-[#262626] p-4 rounded-xl text-sm text-white outline-none">
                <div class="relative">
                    <input id="pwd" placeholder="Password" class="w-full bg-[#0a0a0a] border border-[#262626] p-4 rounded-xl text-sm text-white outline-none">
                    <button onclick="generatePass('pwd')" class="absolute right-3 top-3 text-blue-500 text-[10px] font-black uppercase tracking-tighter">Gen</button>
                </div>
            </div>
            <div class="flex flex-col md:flex-row gap-4">
                <div class="relative flex-1 group">
                    <button id="cat-select-btn" onclick="toggleCatDropdown()" class="w-full bg-[#0a0a0a] border border-[#262626] p-4 rounded-xl text-sm text-left text-gray-400 flex justify-between items-center">
                        <span id="selected-cat-label">Select Category</span>
                        <span class="text-[8px] opacity-50">▼</span>
                    </button>
                    <div id="cat-dropdown" class="hidden absolute top-full left-0 right-0 mt-2 bg-[#171717] border border-[#262626] rounded-xl overflow-hidden z-20 shadow-2xl">
                        <div id="cat-options" class="max-h-48 overflow-y-auto custom-scrollbar"></div>
                    </div>
                </div>
                <button onclick="saveEntry()" class="md:w-64 bg-blue-600 font-black py-4 rounded-xl text-sm tracking-widest hover:bg-blue-500 transition-all">SAVE ENTRY</button>
            </div>
        </div>

        <div class="flex gap-4 mb-6">
            <input id="search" oninput="renderVault()" placeholder="Filter keys..." class="flex-1 bg-[#171717] border border-[#262626] p-5 rounded-2xl outline-none text-white">
            <button onclick="setView('list')" id="btn-list" class="px-6 py-4 rounded-2xl text-xs font-black uppercase bg-blue-600">List</button>
            <button onclick="setView('card')" id="btn-card" class="px-6 py-4 rounded-2xl text-xs font-black uppercase bg-[#171717] text-gray-500">Cards</button>
        </div>

        <div id="vault-list" class="grid gap-4"></div>
    </div>

    <script>
        let currentUser = "";
        let categories = [];
        let selectedCat = "";
        let fullVaultData = [];
        let trashData = [];
        let viewMode = 'list';

        async function handleLogin() {
            const user = document.getElementById('auth-user').value;
            const pass = document.getElementById('auth-pw').value;
            const res = await fetch('/auth', { method: 'POST', body: JSON.stringify({ username: user, password: pass }) });
            if(res.ok) {
                const data = await res.json();
                currentUser = user;
                categories = data.categories;
                document.getElementById('auth-container').classList.add('hidden');
                document.getElementById('vault-screen').classList.remove('hidden');
                setupCategoryUI();
                loadVault();
            } else { showLoginError(); }
        }

        function showLoginError() {
            const card = document.getElementById('login-card');
            const toast = document.getElementById('toast-container');
            card.classList.add('shake');
            toast.classList.remove('hidden');
            setTimeout(() => { card.classList.remove('shake'); toast.classList.add('hidden'); }, 3000);
        }

        function setupCategoryUI() {
            const container = document.getElementById('cat-options');
            container.innerHTML = categories.map(c => \`
                <div onclick="selectCategory('\${c}')" class="p-4 hover:bg-blue-600 hover:text-white cursor-pointer text-sm font-bold border-b border-[#262626] last:border-0">\${c}</div>
            \`).join('');
        }

        function toggleCatDropdown() { document.getElementById('cat-dropdown').classList.toggle('hidden'); }

        function selectCategory(c) {
            selectedCat = c;
            document.getElementById('selected-cat-label').innerText = c;
            document.getElementById('selected-cat-label').classList.remove('text-gray-400');
            document.getElementById('selected-cat-label').classList.add('text-white');
            toggleCatDropdown();
        }

        async function loadVault() {
            const res = await fetch('/list', { method: 'POST', body: JSON.stringify({ currentUser }) });
            fullVaultData = await res.json();
            renderVault();
        }

        function renderVault() {
            const q = document.getElementById('search').value.toLowerCase();
            const list = document.getElementById('vault-list');
            list.innerHTML = "";
            list.className = viewMode === 'list' ? 'grid gap-3' : 'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6';

            fullVaultData.filter(i => i.domain.toLowerCase().includes(q)).forEach((item, index) => {
                const inner = viewMode === 'list' ? \`
                    <div class="bg-[#171717] border border-[#262626] p-5 rounded-2xl flex justify-between items-center group">
                        <div onclick="openItem(\${index})" class="flex-1 cursor-pointer flex items-center gap-4">
                            <div class="h-10 w-10 bg-blue-600/10 rounded-xl flex items-center justify-center text-blue-500 font-black">\${item.domain[0].toUpperCase()}</div>
                            <div>
                                <div class="text-white font-bold">\${item.domain}</div>
                                <div class="text-gray-500 text-[10px] uppercase font-black tracking-tighter">\${item.category}</div>
                            </div>
                        </div>
                        <button onclick="trashEntry('\${item.domain}')" class="h-12 w-12 flex items-center justify-center rounded-xl bg-red-950/20 text-red-500 border border-red-900/20 hover:bg-red-600 hover:text-white transition-all">Δ</button>
                    </div>\` : \`
                    <div class="bg-[#171717] border border-[#262626] p-8 rounded-[2.5rem] relative group overflow-hidden">
                        <div onclick="openItem(\${index})" class="cursor-pointer">
                            <div class="text-blue-500 text-[10px] font-black uppercase mb-4 tracking-widest">\${item.category}</div>
                            <div class="text-white font-black text-2xl mb-1">\${item.domain}</div>
                            <div class="text-gray-500 text-sm font-mono opacity-60 mb-6">\${item.username}</div>
                        </div>
                        <button onclick="trashEntry('\${item.domain}')" class="absolute top-6 right-6 h-10 w-10 flex items-center justify-center rounded-full bg-red-950/30 text-red-500 font-bold border border-red-900/20 hover:bg-red-600 hover:text-white">Δ</button>
                    </div>\`;
                list.innerHTML += inner;
            });
        }

        async function trashEntry(domain) {
            await fetch('/trash-entry', { method: 'POST', body: JSON.stringify({ currentUser, domain }) });
            loadVault();
        }

        async function showTrash() {
            const res = await fetch('/list-trash', { method: 'POST', body: JSON.stringify({ currentUser }) });
            trashData = await res.json();
            const modal = document.getElementById('detail-modal');
            const content = document.getElementById('modal-content');
            
            content.innerHTML = \`
                <h2 class="text-3xl font-black text-white mb-2">Trash Folder</h2>
                <p class="text-gray-500 text-xs mb-6 uppercase font-bold tracking-widest">Expires in 5 Days</p>
                <div class="space-y-3 max-h-96 overflow-y-auto custom-scrollbar pr-2">
                    \${trashData.length === 0 ? '<p class="text-gray-600 py-10 text-center">Trash is empty</p>' : trashData.map(t => \`
                        <div class="p-4 bg-[#0a0a0a] border border-[#262626] rounded-2xl flex justify-between items-center">
                            <div>
                                <div class="text-white font-bold text-sm">\${t.domain}</div>
                                <div class="text-[9px] text-gray-500 uppercase">\${new Date(t.deletedAt).toLocaleDateString()}</div>
                            </div>
                            <div class="flex gap-2">
                                <button onclick="restore('\${t.domain}')" class="text-blue-500 text-[10px] font-black uppercase">Restore</button>
                                <button onclick="permDelete('\${t.domain}')" class="text-red-500 text-[10px] font-black uppercase">Wipe</button>
                            </div>
                        </div>
                    \`).join('')}
                </div>
            \`;
            modal.classList.remove('hidden');
        }

        async function permDelete(domain) {
            if(!confirm("Permanently wipe this key? This cannot be undone.")) return;
            await fetch('/perm-delete', { method: 'POST', body: JSON.stringify({ currentUser, domain }) });
            showTrash();
        }

        async function restore(domain) {
            await fetch('/restore', { method: 'POST', body: JSON.stringify({ currentUser, domain }) });
            showTrash();
            loadVault();
        }

        async function saveEntry() {
            const entry = { domain: document.getElementById('dom').value, username: document.getElementById('usr').value, password: document.getElementById('pwd').value, category: selectedCat };
            if(!entry.domain || !selectedCat) return alert("Select a category first!");
            await fetch('/save', { method: 'POST', body: JSON.stringify({ currentUser, entry }) });
            ['dom','usr','pwd'].forEach(i => document.getElementById(i).value = "");
            loadVault();
        }

        function setView(m) { viewMode = m; renderVault(); }
        function closeModal() { document.getElementById('detail-modal').classList.add('hidden'); }
        function openItem(idx) {
            const item = fullVaultData[idx];
            const content = document.getElementById('modal-content');
            content.innerHTML = \`
                <p class="text-blue-500 text-[10px] font-black uppercase tracking-widest mb-1">\${item.category}</p>
                <h2 class="text-4xl font-black text-white mb-8">\${item.domain}</h2>
                <div class="space-y-4">
                    <div class="p-5 bg-[#0a0a0a] border border-[#262626] rounded-2xl">
                        <p class="text-[10px] text-gray-500 uppercase font-black mb-1">Username</p>
                        <p class="text-white text-lg font-mono">\${item.username}</p>
                    </div>
                    <div class="p-5 bg-[#0a0a0a] border border-[#262626] rounded-2xl">
                        <p class="text-[10px] text-gray-500 uppercase font-black mb-1">Password</p>
                        <p class="text-blue-400 text-xl font-mono">••••••••••••</p>
                    </div>
                </div>
                <button onclick="closeModal()" class="w-full mt-8 bg-blue-600 py-4 rounded-xl text-xs font-black uppercase tracking-widest">Back to Vault</button>
            \`;
            document.getElementById('detail-modal').classList.remove('hidden');
        }

        function generatePass(id) {
            const c = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*";
            document.getElementById(id).value = Array.from(crypto.getRandomValues(new Uint32Array(16))).map(n => c[n % c.length]).join('');
        }
</script>
</body>
</html>`; // <--- Add this backtick here to close the string

  return new Response(html, { headers: { "Content-Type": "text/html" } });
});
