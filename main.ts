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

    if (url.pathname === "/create-account") {
      const existing = await kv.get(["users", body.username]);
      if (existing.value) return new Response("User exists", { status: 400 });
      await kv.set(["users", body.username], { password: body.password });
      return new Response(JSON.stringify({ success: true }));
    }
  }

  if (url.pathname !== "/") return new Response("Not Found", { status: 404 });

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Keychain | Kinetic Logic Labs</title>
    <script src="https://cdn.tailwindcss.com"></script>
    <script>tailwind.config = { theme: { extend: { colors: { brand: { bg: '#0a0a0a', card: '#171717', border: '#262626', primary: '#3b82f6' } } } } }</script>
</head>
<body class="bg-brand-bg text-gray-200 p-6">
    <div id="auth-container" class="w-full max-w-md mx-auto mt-20">
        <div class="text-center mb-8">
            <h1 class="text-3xl font-bold text-white">Password Keychain</h1>
            <p class="text-blue-400 text-xs tracking-widest mt-1 uppercase">Kinetic Logic Labs</p>
        </div>
        <div id="login-card" class="bg-brand-card border border-brand-border p-8 rounded-2xl shadow-2xl">
            <input id="auth-user" placeholder="Username" class="w-full bg-brand-bg border border-brand-border p-3 rounded-lg mb-3 text-white outline-none focus:border-brand-primary">
            <input id="auth-pw" type="password" placeholder="Password" class="w-full bg-brand-bg border border-brand-border p-3 rounded-lg mb-6 text-white outline-none focus:border-brand-primary">
            <button onclick="handleLogin()" class="w-full bg-brand-primary hover:bg-blue-600 text-white font-bold py-3 rounded-lg transition">Access Vault</button>
        </div>
    </div>

    <div id="vault-screen" class="hidden w-full max-w-2xl mx-auto">
        <div class="flex justify-between items-center mb-6">
            <div>
                <h1 class="text-2xl font-bold text-white">My Vault</h1>
                <p id="vault-count" class="text-xs text-gray-500 font-mono">0 saved keys</p>
            </div>
            <div class="flex gap-2">
                <button onclick="exportVault()" class="text-[10px] bg-brand-card border border-brand-border px-3 py-1 rounded">Export</button>
                <button onclick="document.getElementById('import-file').click()" class="text-[10px] bg-brand-card border border-brand-border px-3 py-1 rounded">Import</button>
                <input type="file" id="import-file" class="hidden" onchange="importVault(event)">
                <button onclick="location.reload()" class="text-[10px] bg-red-900/30 text-red-400 border border-red-900 px-3 py-1 rounded">Lock</button>
            </div>
        </div>

        <div class="flex gap-2 mb-6 overflow-x-auto pb-2" id="filter-chips">
            <button onclick="setFilter('All')" class="category-chip bg-brand-primary text-xs px-4 py-1.5 rounded-full font-bold">All</button>
            <button onclick="setFilter('Personal')" class="category-chip bg-brand-card border border-brand-border text-xs px-4 py-1.5 rounded-full">Personal</button>
            <button onclick="setFilter('Work')" class="category-chip bg-brand-card border border-brand-border text-xs px-4 py-1.5 rounded-full">Work</button>
            <button onclick="setFilter('Finance')" class="category-chip bg-brand-card border border-brand-border text-xs px-4 py-1.5 rounded-full">Finance</button>
            <button onclick="setFilter('Social')" class="category-chip bg-brand-card border border-brand-border text-xs px-4 py-1.5 rounded-full">Social</button>
        </div>

        <input id="search" oninput="loadVault()" placeholder="Search domain or username..." class="w-full bg-brand-card border border-brand-border p-4 rounded-xl mb-6 outline-none text-white focus:border-brand-primary">
        
        <div class="bg-brand-card border border-brand-border p-6 rounded-2xl mb-8">
            <div class="grid grid-cols-2 gap-3 mb-3">
                <input id="dom" placeholder="Domain" class="bg-brand-bg border border-brand-border p-2 rounded text-sm text-white">
                <input id="usr" placeholder="Username" class="bg-brand-bg border border-brand-border p-2 rounded text-sm text-white">
            </div>
            <div class="grid grid-cols-2 gap-3 mb-4">
                <input id="pwd" placeholder="Password" class="bg-brand-bg border border-brand-border p-2 rounded text-sm text-white">
                <select id="cat" class="bg-brand-bg border border-brand-border p-2 rounded text-sm text-white outline-none">
                    <option value="Personal">Personal</option>
                    <option value="Work">Work</option>
                    <option value="Finance">Finance</option>
                    <option value="Social">Social</option>
                </select>
            </div>
            <button onclick="saveEntry()" class="w-full bg-brand-primary font-bold py-2 rounded-lg hover:bg-blue-600">Save Securely</button>
        </div>

        <div id="vault-list" class="space-y-3"></div>
    </div>

    <script>
        let currentUser = "";
        let currentFilter = "All";

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
                alert('Invalid Credentials');
            }
        }

        function setFilter(cat) {
            currentFilter = cat;
            document.querySelectorAll('.category-chip').forEach(btn => {
                btn.classList.remove('bg-brand-primary', 'font-bold');
                btn.classList.add('bg-brand-card', 'border', 'border-brand-border');
                if(btn.innerText === cat) {
                    btn.classList.add('bg-brand-primary', 'font-bold');
                    btn.classList.remove('bg-brand-card', 'border-brand-border');
                }
            });
            loadVault();
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
            document.getElementById('dom').value = ""; document.getElementById('usr').value = ""; document.getElementById('pwd').value = "";
            loadVault();
        }

        async function loadVault() {
            const res = await fetch('/list', { method: 'POST', body: JSON.stringify({ currentUser }) });
            const data = await res.json();
            const q = document.getElementById('search').value.toLowerCase();
            
            document.getElementById('vault-count').innerText = data.length + ' saved keys';
            
            const list = document.getElementById('vault-list');
            list.innerHTML = "";
            
            const filtered = data.filter(i => {
                const matchesSearch = i.domain.toLowerCase().indexOf(q) !== -1 || i.username.toLowerCase().indexOf(q) !== -1;
                const matchesCategory = currentFilter === 'All' || i.category === currentFilter;
                return matchesSearch && matchesCategory;
            });

            filtered.forEach(item => {
                let row = '<div class="bg-brand-card border border-brand-border p-4 rounded-xl flex justify-between items-center">';
                row += '<div><div class="flex items-center gap-2"><span class="text-white font-bold">' + item.domain + '</span>';
                row += '<span class="text-[9px] bg-blue-900/30 text-blue-400 px-2 rounded">' + (item.category || 'Personal') + '</span></div>';
                row += '<div class="text-gray-500 text-xs font-mono">' + item.username + '</div></div>';
                row += '<div class="flex gap-4"><button onclick="alert(\'Pass: \' + \'' + item.password + '\')" class="text-brand-primary text-xs">View</button>';
                row += '<button onclick="deleteEntry(\'' + item.domain + '\')" class="text-red-500 text-xs">Delete</button></div></div>';
                list.innerHTML += row;
            });
        }

        async function deleteEntry(domain) {
            await fetch('/delete', { method: 'POST', body: JSON.stringify({ currentUser, domain }) });
            loadVault();
        }

        async function exportVault() {
            const res = await fetch('/list', { method: 'POST', body: JSON.stringify({ currentUser }) });
            const data = await res.json();
            const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = 'vault_backup.json';
            a.click();
        }

        async function importVault(event) {
            const file = event.target.files[0];
            if(!file) return;
            const reader = new FileReader();
            reader.onload = async (e) => {
                const data = JSON.parse(e.target.result);
                for(const entry of data) {
                    await fetch('/save', { method: 'POST', body: JSON.stringify({ currentUser, entry }) });
                }
                loadVault();
                alert('Import Complete');
            };
            reader.readAsText(file);
        }
    </script>
</body>
</html>\`;

  return new Response(html, { headers: { "Content-Type": "text/html" } });
});
