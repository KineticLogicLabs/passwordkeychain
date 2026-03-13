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
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Keychain | Kinetic Logic Labs</title>
    <script src="https://cdn.tailwindcss.com"></script>
    <style>
        @keyframes shake {
            0%, 100% { transform: translateX(0); }
            25% { transform: translateX(-8px); }
            75% { transform: translateX(8px); }
        }
        .shake { animation: shake 0.2s ease-in-out 0s 2; }
        ::-webkit-scrollbar { width: 8px; }
        ::-webkit-scrollbar-track { background: #0a0a0a; }
        ::-webkit-scrollbar-thumb { background: #262626; border-radius: 10px; }
    </style>
    <script>
        tailwind.config = { 
            theme: { 
                extend: { 
                    colors: { 
                        brand: { bg: '#0a0a0a', card: '#171717', border: '#262626', primary: '#3b82f6' } 
                    } 
                } 
            } 
        }
    </script>
</head>
<body class="bg-brand-bg text-gray-200 p-6 font-sans">
    
    <div id="toast" class="fixed bottom-10 left-1/2 -translate-x-1/2 bg-red-600 text-white px-6 py-3 rounded-xl opacity-0 transition-all duration-300 z-50 shadow-2xl pointer-events-none font-bold">
        Invalid Credentials
    </div>

    <div id="modal" class="fixed inset-0 bg-black/80 backdrop-blur-md hidden flex items-center justify-center p-4 z-40" onclick="closeModal()">
        <div class="bg-brand-card border border-brand-border w-full max-w-md rounded-3xl p-8 relative shadow-2xl" onclick="event.stopPropagation()">
            <button onclick="closeModal()" class="absolute top-4 right-4 text-gray-500 hover:text-white text-2xl">&times;</button>
            <div class="text-center mb-8">
                <h2 id="modal-domain" class="text-3xl font-bold text-white mb-1 uppercase tracking-tight"></h2>
                <span id="modal-cat" class="text-[10px] bg-blue-900/30 text-blue-400 px-3 py-1 rounded-full uppercase tracking-widest font-bold"></span>
            </div>
            <div class="space-y-6">
                <div class="cursor-pointer group" onclick="copyText('modal-user', 'Username')">
                    <p class="text-xs text-gray-500 mb-2 ml-1">Username (Click to copy)</p>
                    <p id="modal-user" class="text-lg text-white bg-brand-bg p-4 rounded-xl border border-brand-border group-hover:border-brand-primary transition font-mono"></p>
                </div>
                <div class="cursor-pointer group" onclick="copyText('modal-pass', 'Password')">
                    <p class="text-xs text-gray-500 mb-2 ml-1">Password (Click to copy)</p>
                    <p id="modal-pass" class="text-4xl text-brand-primary bg-brand-bg p-4 rounded-xl border border-brand-border group-hover:border-white transition font-mono break-all leading-tight"></p>
                </div>
            </div>
        </div>
    </div>

    <div id="auth-container" class="w-full max-w-md mx-auto mt-20">
        <div class="text-center mb-8">
            <h1 class="text-3xl font-bold text-white">Password Keychain</h1>
            <p class="text-blue-400 text-xs tracking-widest mt-1 uppercase font-semibold">By Kinetic Logic Labs</p>
        </div>
        <div id="login-card" class="bg-brand-card border border-brand-border p-8 rounded-2xl shadow-2xl transition-all">
            <input id="auth-user" placeholder="Username" class="w-full bg-brand-bg border border-brand-border p-3 rounded-lg mb-3 text-white outline-none focus:border-brand-primary">
            <input id="auth-pw" type="password" placeholder="Password" class="w-full bg-brand-bg border border-brand-border p-3 rounded-lg mb-4 text-white outline-none focus:border-brand-primary">
            <p id="error-msg" class="text-red-500 text-xs text-center mb-4 hidden font-bold italic">Invalid Password</p>
            <button onclick="handleLogin()" class="w-full bg-brand-primary hover:bg-blue-600 text-white font-bold py-3 rounded-lg transition shadow-lg">Access Vault</button>
        </div>
    </div>

    <div id="vault-screen" class="hidden w-full max-w-2xl mx-auto">
        <div class="flex justify-between items-center mb-6">
            <div>
                <h1 class="text-2xl font-bold text-white">My Vault</h1>
                <p id="vault-count" class="text-xs text-gray-500 font-mono">0 saved keys</p>
            </div>
            <div class="flex gap-2">
                <button onclick="location.reload()" class="text-[10px] bg-red-900/30 text-red-400 border border-red-900 px-3 py-1 rounded hover:bg-red-900 transition">Lock Vault</button>
            </div>
        </div>

        <input id="search" oninput="renderList()" placeholder="Search domain or username..." class="w-full bg-brand-card border border-brand-border p-4 rounded-xl mb-6 outline-none text-white focus:border-brand-primary transition">
        
        <div class="bg-brand-card border border-brand-border p-6 rounded-2xl mb-8">
            <div class="grid grid-cols-2 gap-3 mb-3">
                <input id="dom" placeholder="Domain (e.g. google.com)" class="bg-brand-bg border border-brand-border p-2 rounded text-sm text-white outline-none focus:border-brand-primary">
                <input id="usr" placeholder="Username" class="bg-brand-bg border border-brand-border p-2 rounded text-sm text-white outline-none focus:border-brand-primary">
            </div>
            <div class="grid grid-cols-2 gap-3 mb-4">
                <input id="pwd" type="text" placeholder="Password" class="bg-brand-bg border border-brand-border p-2 rounded text-sm text-white outline-none focus:border-brand-primary">
                <select id="cat" class="bg-brand-bg border border-brand-border p-2 rounded text-sm text-white outline-none focus:border-brand-primary">
                    <option value="Personal">Personal</option>
                    <option value="Work">Work</option>
                    <option value="Finance">Finance</option>
                    <option value="Social">Social</option>
                </select>
            </div>
            <button onclick="saveEntry()" class="w-full bg-brand-primary font-bold py-2 rounded-lg hover:bg-blue-600 transition shadow-md">Save Securely</button>
        </div>

        <div id="vault-list" class="space-y-3 pb-20"></div>
    </div>

    <script>
        let currentUser = "";
        let vaultData = [];

        async function handleLogin() {
            const username = document.getElementById('auth-user').value;
            const password = document.getElementById('auth-pw').value;
            const card = document.getElementById('login-card');
            const errorText = document.getElementById('error-msg');
            const toast = document.getElementById('toast');

            const res = await fetch('/auth', { 
                method: 'POST', 
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({ username, password }) 
            });
            
            if(res.ok) {
                currentUser = username;
                document.getElementById('auth-container').classList.add('hidden');
                document.getElementById('vault-screen').classList.remove('hidden');
                loadVault();
            } else {
                card.classList.add('shake');
                errorText.classList.remove('hidden');
                toast.classList.add('opacity-100');
                setTimeout(() => { 
                    card.classList.remove('shake'); 
                    toast.classList.remove('opacity-100');
                }, 3000);
            }
        }

        async function loadVault() {
            const res = await fetch('/list', { 
                method: 'POST', 
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({ currentUser }) 
            });
            vaultData = await res.json();
            renderList();
        }

        function renderList() {
            const q = document.getElementById('search').value.toLowerCase();
            const list = document.getElementById('vault-list');
            list.innerHTML = "";
            
            const filtered = vaultData.filter(i => 
                i.domain.toLowerCase().includes(q) || 
                i.username.toLowerCase().includes(q)
            );
            
            document.getElementById('vault-count').innerText = filtered.length + ' saved keys';

            filtered.forEach((item) => {
                const div = document.createElement('div');
                div.className = "bg-brand-card border border-brand-border p-4 rounded-xl flex justify-between items-center cursor-pointer hover:border-brand-primary hover:scale-[1.01] transition-all duration-200 group";
                div.onclick = () => openDetails(item);
                div.innerHTML = \`
                    <div>
                        <div class="flex items-center gap-2">
                            <span class="text-white font-bold group-hover:text-brand-primary transition">\${item.domain}</span>
                            <span class="text-[9px] bg-blue-900/30 text-blue-400 px-2 rounded uppercase font-bold">\${item.category || 'Personal'}</span>
                        </div>
                        <div class="text-gray-500 text-xs font-mono">\${item.username}</div>
                    </div>
                    <button onclick="event.stopPropagation(); deleteEntry('\${item.domain}')" class="text-red-900 hover:text-red-500 text-xs transition px-2 py-1">Delete</button>
                \`;
                list.appendChild(div);
            });
        }

        function openDetails(item) {
            document.getElementById('modal-domain').innerText = item.domain;
            document.getElementById('modal-cat').innerText = item.category || 'Personal';
            document.getElementById('modal-user').innerText = item.username;
            document.getElementById('modal-pass').innerText = item.password;
            document.getElementById('modal').classList.remove('hidden');
        }

        function closeModal() { 
            document.getElementById('modal').classList.add('hidden'); 
        }

        function copyText(id, label) {
            const element = document.getElementById(id);
            const text = element.innerText;
            navigator.clipboard.writeText(text);
            
            const originalText = text;
            element.innerText = "COPIED!";
            element.classList.add('text-green-400');
            
            setTimeout(() => { 
                element.innerText = originalText;
                element.classList.remove('text-green-400');
            }, 1000);
        }

        async function saveEntry() {
            const domain = document.getElementById('dom').value;
            const username = document.getElementById('usr').value;
            const password = document.getElementById('pwd').value;
            const category = document.getElementById('cat').value;

            if(!domain || !password) return alert("Domain and Password are required");

            const entry = { domain, username, password, category };
            await fetch('/save', { 
                method: 'POST', 
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({ currentUser, entry }) 
            });
            
            // Clear inputs
            document.getElementById('dom').value = "";
            document.getElementById('usr').value = "";
            document.getElementById('pwd').value = "";
            
            loadVault();
        }

        async function deleteEntry(domain) {
            if(!confirm("Are you sure you want to delete this key?")) return;
            await fetch('/delete', { 
                method: 'POST', 
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({ currentUser, domain }) 
            });
            loadVault();
        }
</script>
</body>
</html>`; // <--- Add this backtick here to close the string

  return new Response(html, { headers: { "Content-Type": "text/html" } });
});
