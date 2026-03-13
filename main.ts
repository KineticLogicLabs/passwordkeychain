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
        // Use domain as key, but store original casing in value
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
    <title>Password Keychain | Kinetic Logic Labs</title>
    <script src="https://cdn.tailwindcss.com"></script>
    <style>
        @keyframes shake { 0%, 100% { transform: translateX(0); } 25% { transform: translateX(-8px); } 75% { transform: translateX(8px); } }
        .shake { animation: shake 0.15s ease-in-out 0s 2; }
        .modal-bg { backdrop-filter: blur(12px); background: rgba(0,0,0,0.7); }
        .toast-pop { animation: popUp 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275) forwards; }
        @keyframes popUp { from { transform: translateY(100px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
    </style>
</head>
<body class="bg-[#0a0a0a] text-gray-200 p-4 md:p-8 font-sans overflow-x-hidden">
    
    <div id="toast-container" class="fixed bottom-10 inset-x-0 flex justify-center z-[100] pointer-events-none hidden">
        <div class="toast-pop bg-red-600 text-white px-8 py-4 rounded-2xl shadow-2xl font-bold border border-red-400 pointer-events-auto">
            Authentication Failed: Please check your credentials.
        </div>
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
        <div id="login-card" class="bg-[#171717] border border-[#262626] p-8 rounded-[2.5rem] shadow-2xl">
            <div class="space-y-4">
                <input id="auth-user" type="text" placeholder="Username" class="w-full bg-[#0a0a0a] border border-[#262626] p-4 rounded-2xl text-white outline-none focus:border-blue-500 transition-colors">
                <div class="relative">
                    <input id="auth-pw" type="password" placeholder="Password" class="w-full bg-[#0a0a0a] border border-[#262626] p-4 rounded-2xl text-white outline-none focus:border-blue-500 transition-colors">
                    <button onclick="togglePw('auth-pw')" class="absolute right-4 top-4 text-[10px] text-gray-500 hover:text-white uppercase font-black tracking-widest">Show</button>
                </div>
            </div>
            <button id="login-btn" onclick="handleLogin()" class="w-full bg-blue-600 hover:bg-blue-500 text-white font-black py-5 rounded-2xl mt-8 transition-all active:scale-95">ACCESS VAULT</button>
            <p id="error-msg" class="text-red-500 text-center text-sm font-bold mt-4 opacity-0 transition-opacity">Invalid Password</p>
        </div>
    </div>

    <div id="vault-screen" class="hidden w-full max-w-5xl mx-auto">
        <div class="flex flex-col md:flex-row justify-between items-start md:items-end gap-6 mb-10">
            <div>
                <p class="text-blue-500 text-[10px] tracking-widest uppercase font-black mb-1">Kinetic Logic Labs</p>
                <h1 class="text-4xl font-black text-white tracking-tight">My Vault</h1>
                <p id="vault-count" class="text-xs text-gray-500 font-mono mt-1">0 encrypted records</p>
            </div>
            <div class="flex flex-wrap gap-3 w-full md:w-auto">
                <button onclick="toggleSettings()" class="flex-1 md:flex-none bg-[#171717] border border-[#262626] px-8 py-4 rounded-2xl font-black text-xs hover:bg-[#212121] transition-colors uppercase tracking-widest">Settings</button>
                <button onclick="exportVault()" class="flex-1 md:flex-none bg-[#171717] border border-[#262626] px-8 py-4 rounded-2xl font-black text-xs hover:bg-[#212121] transition-colors uppercase tracking-widest">Export</button>
                <button onclick="document.getElementById('import-file').click()" class="flex-1 md:flex-none bg-[#171717] border border-[#262626] px-8 py-4 rounded-2xl font-black text-xs hover:bg-[#212121] transition-colors uppercase tracking-widest">Import</button>
                <button onclick="location.reload()" class="flex-1 md:flex-none bg-red-950/30 text-red-500 border border-red-900/40 px-8 py-4 rounded-2xl font-black text-xs uppercase tracking-widest">Lock</button>
                <input type="file" id="import-file" class="hidden" onchange="importVault(event)">
            </div>
        </div>

        <div id="settings-panel" class="hidden bg-[#171717] border border-blue-900/20 p-8 rounded-[2rem] mb-10">
            <div class="grid md:grid-cols-2 gap-10">
                <div>
                    <h3 class="text-white text-xs font-black mb-4 uppercase text-blue-500 tracking-widest">Registry</h3>
                    <input id="new-acc-user" placeholder="New Username" class="w-full bg-[#0a0a0a] border border-[#262626] p-4 rounded-xl text-sm text-white mb-3">
                    <input id="new-acc-pw" type="password" placeholder="New Password" class="w-full bg-[#0a0a0a] border border-[#262626] p-4 rounded-xl text-sm text-white mb-6">
                    <button onclick="createNewAccount()" class="w-full bg-blue-600 py-4 rounded-xl text-xs font-black uppercase tracking-widest">Register</button>
                </div>
                <div>
                    <h3 class="text-white text-xs font-black mb-4 uppercase text-blue-500 tracking-widest">Categories</h3>
                    <textarea id="cat-editor" class="w-full bg-[#0a0a0a] border border-[#262626] p-4 rounded-xl text-sm text-white h-28 mb-3 outline-none"></textarea>
                    <button onclick="updateCategories()" class="w-full bg-[#262626] py-4 rounded-xl text-xs font-black uppercase tracking-widest">Update</button>
                </div>
            </div>
        </div>

        <div class="flex flex-col md:flex-row gap-4 mb-8">
            <input id="search" oninput="loadVault()" placeholder="Search vault entries..." class="flex-1 bg-[#171717] border border-[#262626] p-5 rounded-2xl outline-none text-white focus:border-blue-500 transition-all">
            <div class="bg-[#171717] border border-[#262626] rounded-2xl p-1.5 flex gap-1">
                <button onclick="setView('list')" id="btn-list" class="px-6 py-3 rounded-xl text-xs font-black uppercase bg-blue-600 text-white transition-all">List</button>
                <button onclick="setView('card')" id="btn-card" class="px-6 py-3 rounded-xl text-xs font-black uppercase text-gray-500 hover:text-white transition-all">Cards</button>
            </div>
        </div>

        <div class="bg-[#171717] border border-[#262626] p-8 rounded-[2.5rem] mb-10">
            <div class="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
                <input id="dom" placeholder="Domain" class="bg-[#0a0a0a] border border-[#262626] p-4 rounded-xl text-sm text-white outline-none">
                <input id="usr" placeholder="Username" class="bg-[#0a0a0a] border border-[#262626] p-4 rounded-xl text-sm text-white outline-none">
                <div class="relative">
                    <input id="pwd" placeholder="Password" class="w-full bg-[#0a0a0a] border border-[#262626] p-4 rounded-xl text-sm text-white outline-none">
                    <button onclick="generatePass('pwd')" class="absolute right-3 top-3 bg-blue-600/10 text-blue-500 px-3 py-2 rounded-lg text-[10px] font-black uppercase tracking-tighter hover:bg-blue-600/20">Gen</button>
                </div>
                <select id="cat" class="bg-[#0a0a0a] border border-[#262626] p-4 rounded-xl text-sm text-white outline-none cursor-pointer"></select>
            </div>
            <button onclick="saveEntry()" class="w-full bg-blue-600 font-black py-5 rounded-2xl hover:bg-blue-500 transition-all text-sm tracking-widest">SAVE TO VAULT</button>
        </div>

        <div id="vault-list" class="grid gap-4"></div>
    </div>

    <script>
        let currentUser = "";
        let currentCategories = [];
        let viewMode = 'list';
        let fullVaultData = [];
        let editingIndex = null;

        function showLoginError() {
            const card = document.getElementById('login-card');
            const msg = document.getElementById('error-msg');
            const toast = document.getElementById('toast-container');
            card.classList.add('shake');
            msg.style.opacity = '1';
            toast.classList.remove('hidden');
            setTimeout(() => {
                card.classList.remove('shake');
                msg.style.opacity = '0';
                toast.classList.add('hidden');
            }, 4000);
        }

        function togglePw(id) {
            const el = document.getElementById(id);
            el.type = el.type === 'password' ? 'text' : 'password';
        }

        function generatePass(targetId) {
            const chars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*";
            let p = Array.from(crypto.getRandomValues(new Uint32Array(16)))
                        .map(n => chars[n % chars.length]).join('');
            document.getElementById(targetId).value = p;
        }

        function toggleSettings() {
            document.getElementById('settings-panel').classList.toggle('hidden');
        }

        function setView(mode) {
            viewMode = mode;
            document.getElementById('btn-list').className = mode === 'list' ? 'px-6 py-3 rounded-xl text-xs font-black uppercase bg-blue-600 text-white' : 'px-6 py-3 rounded-xl text-xs font-black uppercase text-gray-500 hover:text-white';
            document.getElementById('btn-card').className = mode === 'card' ? 'px-6 py-3 rounded-xl text-xs font-black uppercase bg-blue-600 text-white' : 'px-6 py-3 rounded-xl text-xs font-black uppercase text-gray-500 hover:text-white';
            renderVault();
        }

        async function handleLogin() {
            const userInp = document.getElementById('auth-user');
            const passInp = document.getElementById('auth-pw');
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
                } else { showLoginError(); }
            } catch { showLoginError(); }
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
            fullVaultData = await res.json();
            renderVault();
        }

        function renderVault() {
            const q = document.getElementById('search').value.toLowerCase();
            const list = document.getElementById('vault-list');
            list.innerHTML = "";
            list.className = viewMode === 'list' ? 'grid gap-4' : 'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6';

            const filtered = fullVaultData.filter(i => 
                i.domain.toLowerCase().includes(q) || i.username.toLowerCase().includes(q)
            );
            document.getElementById('vault-count').innerText = filtered.length + ' entries total';

            filtered.forEach((item, index) => {
                const html = viewMode === 'list' ? \`
                    <div onclick="openItem(\${index})" class="bg-[#171717] border border-[#262626] p-6 rounded-2xl flex justify-between items-center hover:border-blue-500 cursor-pointer transition-all group">
                        <div class="flex items-center gap-6">
                            <div class="h-10 w-10 bg-blue-600/10 rounded-xl flex items-center justify-center text-blue-500 font-black">\${item.domain[0].toUpperCase()}</div>
                            <div><span class="text-white font-bold text-lg">\${item.domain}</span><div class="text-gray-500 text-xs font-mono">\${item.username}</div></div>
                        </div>
                        <div class="text-[10px] text-blue-500 font-black uppercase bg-blue-600/5 px-3 py-1 rounded-lg">\${item.category}</div>
                    </div>\` : \`
                    <div onclick="openItem(\${index})" class="bg-[#171717] border border-[#262626] p-8 rounded-[2.5rem] cursor-pointer hover:border-blue-500 transition-all group relative">
                        <div class="text-blue-500 text-[10px] font-black uppercase mb-4 tracking-widest">\${item.category}</div>
                        <div class="text-white font-black text-2xl mb-2 group-hover:text-blue-400">\${item.domain}</div>
                        <div class="text-gray-500 text-sm font-mono truncate opacity-60 mb-4">\${item.username}</div>
                        <div class="text-[10px] text-gray-600 font-bold uppercase group-hover:text-blue-500 transition-colors">Details &rarr;</div>
                    </div>\`;
                list.innerHTML += html;
            });
        }

        function copyText(text, label) {
            navigator.clipboard.writeText(text);
            const feedback = document.getElementById('copy-feedback');
            feedback.innerText = "Copied " + label + "!";
            feedback.style.opacity = '1';
            setTimeout(() => feedback.style.opacity = '0', 2000);
        }

        function openItem(index) {
            editingIndex = index;
            const item = fullVaultData[index];
            const modal = document.getElementById('detail-modal');
            const content = document.getElementById('modal-content');
            
            content.innerHTML = \`
                <div class="mb-8">
                    <p class="text-blue-500 text-[10px] font-black uppercase tracking-widest mb-1">Edit Entry</p>
                    <input id="edit-dom" value="\${item.domain}" class="bg-transparent text-3xl font-black text-white w-full border-none outline-none focus:text-blue-400">
                </div>
                
                <div class="space-y-4">
                    <div class="p-4 bg-[#0a0a0a] border border-[#262626] rounded-2xl">
                        <p class="text-[10px] text-gray-500 uppercase font-black mb-1">Username (Click to copy)</p>
                        <div class="flex items-center gap-2">
                            <input id="edit-usr" onclick="copyText(this.value, 'Username')" value="\${item.username}" class="bg-transparent text-white text-lg font-mono flex-1 outline-none">
                        </div>
                    </div>
                    
                    <div class="p-4 bg-[#0a0a0a] border border-[#262626] rounded-2xl">
                        <p class="text-[10px] text-gray-500 uppercase font-black mb-1">Password (Click to copy)</p>
                        <div class="flex items-center gap-3">
                            <input id="edit-pwd" onclick="copyText(this.value, 'Password')" type="password" value="\${item.password}" class="bg-transparent text-blue-400 text-xl font-mono flex-1 outline-none">
                            <button onclick="togglePw('edit-pwd')" class="text-[10px] text-gray-600 font-bold hover:text-white uppercase tracking-tighter">Toggle</button>
                            <button onclick="generatePass('edit-pwd')" class="text-[10px] text-blue-900 font-bold hover:text-blue-500 uppercase tracking-tighter">Gen</button>
                        </div>
                    </div>

                    <div class="p-4 bg-[#0a0a0a] border border-[#262626] rounded-2xl">
                         <p class="text-[10px] text-gray-500 uppercase font-black mb-1">Category</p>
                         <select id="edit-cat" class="bg-transparent text-white text-sm outline-none w-full">
                            \${currentCategories.map(c => \`<option value="\${c}" \${c === item.category ? 'selected' : ''}>\${c}</option>\`).join('')}
                         </select>
                    </div>
                </div>

                <div id="copy-feedback" class="text-center text-green-500 text-[10px] font-bold mt-4 opacity-0 transition-opacity uppercase tracking-widest">Copied!</div>

                <div class="mt-8 flex gap-3">
                    <button onclick="updateVaultEntry()" class="flex-1 bg-blue-600 text-white font-black py-4 rounded-xl text-xs uppercase tracking-widest hover:bg-blue-500 transition-all">Save Changes</button>
                    <button onclick="deleteEntry('\${item.domain}')" class="bg-red-950/30 text-red-500 px-6 rounded-xl text-xs font-bold uppercase hover:bg-red-600 hover:text-white transition-all">Delete</button>
                </div>
            \`;
            modal.classList.remove('hidden');
        }

        async function updateVaultEntry() {
            const oldDomain = fullVaultData[editingIndex].domain;
            const newEntry = {
                domain: document.getElementById('edit-dom').value,
                username: document.getElementById('edit-usr').value,
                password: document.getElementById('edit-pwd').value,
                category: document.getElementById('edit-cat').value
            };

            // If domain name changed, delete the old key first
            if (oldDomain.toLowerCase() !== newEntry.domain.toLowerCase()) {
                await fetch('/delete', { method: 'POST', body: JSON.stringify({ currentUser, domain: oldDomain }) });
            }

            await fetch('/save', { method: 'POST', body: JSON.stringify({ currentUser, entry: newEntry }) });
            closeModal();
            loadVault();
        }

        function closeModal() {
            document.getElementById('detail-modal').classList.add('hidden');
            editingIndex = null;
        }

        async function deleteEntry(domain) {
            if(!confirm("Permanently delete?")) return;
            await fetch('/delete', { method: 'POST', body: JSON.stringify({ currentUser, domain }) });
            closeModal();
            loadVault();
        }

        async function createNewAccount() {
            const username = document.getElementById('new-acc-user').value;
            const password = document.getElementById('new-acc-pw').value;
            const res = await fetch('/create-account', { method: 'POST', body: JSON.stringify({ username, password }) });
            if(res.ok) alert("Registered!");
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
