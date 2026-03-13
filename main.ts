const kv = await Deno.openKv();

Deno.serve(async (req: Request) => {
  const url = new URL(req.url);

  // --- API: SIGN UP ---
  if (req.method === "POST" && url.pathname === "/signup") {
    const { username, password } = await req.json();
    const userCheck = await kv.get(["users", username]);
    if (userCheck.value) return new Response("User exists", { status: 400 });
    
    await kv.set(["users", username], { password }); // In production, hash this!
    return new Response(JSON.stringify({ success: true }));
  }

  // --- API: LOGIN ---
  if (req.method === "POST" && url.pathname === "/auth") {
    const { username, password } = await req.json();
    const user = await kv.get(["users", username]);
    if (user.value && user.value.password === password) {
      return new Response(JSON.stringify({ success: true }));
    }
    return new Response("Invalid credentials", { status: 401 });
  }

  // --- API: SAVE ENTRY (User Specific) ---
  if (req.method === "POST" && url.pathname === "/save") {
    const { currentUser, entry } = await req.json();
    await kv.set(["users", currentUser, "vault", entry.domain.toLowerCase()], entry);
    return new Response(JSON.stringify({ success: true }));
  }

  // --- API: DELETE ENTRY ---
  if (req.method === "POST" && url.pathname === "/delete") {
    const { currentUser, domain } = await req.json();
    await kv.delete(["users", currentUser, "vault", domain]);
    return new Response(JSON.stringify({ success: true }));
  }

  // --- API: LIST ENTRIES ---
  if (req.method === "POST" && url.pathname === "/list") {
    const { currentUser } = await req.json();
    const items = [];
    for await (const entry of kv.list({ prefix: ["users", currentUser, "vault"] })) {
      items.push(entry.value);
    }
    return new Response(JSON.stringify(items));
  }

  // --- UI ---
  const html = `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Password Keychain | Kinetic Logic Labs</title>
      <script src="https://cdn.tailwindcss.com"></script>
      <script>
        tailwind.config = {
          theme: {
            extend: {
              colors: {
                brand: { bg: '#0a0a0a', card: '#171717', border: '#262626', primary: '#3b82f6', accent: '#60a5fa' }
              }
            }
          }
        }
      </script>
      <style>
        .modal-bg { background: rgba(0,0,0,0.85); backdrop-filter: blur(4px); }
        input:focus { border-color: #3b82f6 !important; }
        .hide-scroll::-webkit-scrollbar { display: none; }
      </style>
    </head>
    <body class="bg-brand-bg text-gray-200 min-h-screen flex flex-col items-center p-6">

      <div id="auth-container" class="w-full max-w-md mt-20">
        <div class="text-center mb-8">
          <h1 class="text-3xl font-bold text-white tracking-tight">Password Keychain</h1>
          <p class="text-brand-accent text-sm font-medium uppercase tracking-widest mt-1">By Kinetic Logic Labs</p>
        </div>
        
        <div class="bg-brand-card border border-brand-border p-8 rounded-2xl shadow-2xl">
          <div class="flex gap-4 mb-6 border-b border-brand-border pb-4">
            <button id="tab-login" onclick="switchAuth('login')" class="text-white font-bold opacity-100 transition">Log In</button>
            <button id="tab-signup" onclick="switchAuth('signup')" class="text-gray-500 font-bold opacity-50 hover:opacity-100 transition">Sign Up</button>
          </div>
          
          <input id="auth-user" placeholder="Username" class="w-full bg-brand-bg border border-brand-border p-3 rounded-lg mb-3 outline-none transition">
          <input id="auth-pw" type="password" placeholder="Master Password" class="w-full bg-brand-bg border border-brand-border p-3 rounded-lg mb-6 outline-none transition">
          
          <button id="auth-btn" onclick="handleAuth()" class="w-full bg-brand-primary hover:bg-blue-600 text-white font-bold py-3 rounded-lg transition shadow-lg shadow-blue-900/20">
            Access Vault
          </button>
        </div>
      </div>

      <div id="vault-screen" class="hidden w-full max-w-2xl">
        <div class="flex justify-between items-center mb-8">
          <div>
            <h1 class="text-2xl font-bold text-white">My Vault</h1>
            <p id="user-display" class="text-sm text-gray-500"></p>
          </div>
          <button onclick="location.reload()" class="text-xs bg-brand-card border border-brand-border px-4 py-2 rounded-lg hover:bg-brand-border transition">Lock Vault</button>
        </div>

        <div class="bg-brand-card border border-brand-border p-6 rounded-2xl mb-8">
          <div class="grid grid-cols-2 gap-3 mb-3">
            <input id="dom" placeholder="Domain (google.com)" class="bg-brand-bg border border-brand-border p-2 rounded-lg outline-none text-sm">
            <input id="usr" placeholder="Username" class="bg-brand-bg border border-brand-border p-2 rounded-lg outline-none text-sm">
          </div>
          <input id="pwd" placeholder="Password" class="w-full bg-brand-bg border border-brand-border p-2 rounded-lg mb-3 outline-none text-sm">
          <textarea id="nts" placeholder="Recovery codes or notes..." class="w-full bg-brand-bg border border-brand-border p-2 rounded-lg mb-4 outline-none text-sm" rows="2"></textarea>
          <button onclick="saveEntry()" class="w-full bg-brand-primary hover:bg-blue-600 font-bold py-2 rounded-lg transition text-sm">Add New Entry</button>
        </div>

        <div id="vault-list" class="space-y-3"></div>
      </div>

      <div id="delete-modal" class="hidden fixed inset-0 modal-bg flex items-center justify-center z-50 p-4">
        <div class="bg-brand-card border border-brand-border p-8 rounded-2xl max-w-sm w-full text-center shadow-2xl">
          <div class="w-16 h-16 bg-red-900/20 text-red-500 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg class="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"></path></svg>
          </div>
          <h3 class="text-xl font-bold text-white mb-2">Delete Entry?</h3>
          <p class="text-gray-400 text-sm mb-6">This action cannot be undone. Your credentials for <span id="modal-site-name" class="text-white font-bold"></span> will be permanently erased.</p>
          <div class="flex gap-3">
            <button onclick="closeModal()" class="flex-1 bg-brand-border py-2 rounded-lg font-bold text-sm">Cancel</button>
            <button id="confirm-delete-btn" class="flex-1 bg-red-600 hover:bg-red-700 py-2 rounded-lg font-bold text-sm">Delete</button>
          </div>
        </div>
      </div>

      <div id="toast" class="fixed bottom-10 bg-brand-primary text-white px-6 py-3 rounded-full font-bold shadow-xl transform translate-y-20 transition duration-300 opacity-0 pointer-events-none">Copied to Clipboard!</div>

      <script>
        let currentUser = "";
        let authMode = "login";

        function switchAuth(mode) {
          authMode = mode;
          document.getElementById('tab-login').style.opacity = mode === 'login' ? '1' : '0.5';
          document.getElementById('tab-signup').style.opacity = mode === 'signup' ? '1' : '0.5';
          document.getElementById('auth-btn').innerText = mode === 'login' ? 'Access Vault' : 'Create Account';
        }

        async function handleAuth() {
          const username = document.getElementById('auth-user').value;
          const password = document.getElementById('auth-pw').value;
          if(!username || !password) return alert("Enter credentials");

          const endpoint = authMode === 'login' ? '/auth' : '/signup';
          const res = await fetch(endpoint, { method: 'POST', body: JSON.stringify({ username, password }) });
          
          if(res.ok) {
            currentUser = username;
            document.getElementById('auth-container').classList.add('hidden');
            document.getElementById('vault-screen').classList.remove('hidden');
            document.getElementById('user-display').innerText = "Logged in as " + username;
            loadVault();
          } else {
            alert(authMode === 'login' ? "Invalid Login" : "Username already taken");
          }
        }

        async function saveEntry() {
          const entry = {
            domain: document.getElementById('dom').value.trim(),
            username: document.getElementById('usr').value.trim(),
            password: document.getElementById('pwd').value,
            notes: document.getElementById('nts').value
          };
          await fetch('/save', { method: 'POST', body: JSON.stringify({ currentUser, entry }) });
          ['dom','usr','pwd','nts'].forEach(id => document.getElementById(id).value = '');
          loadVault();
        }

        async function loadVault() {
          const res = await fetch('/list', { method: 'POST', body: JSON.stringify({ currentUser }) });
          const data = await res.json();
          const list = document.getElementById('vault-list');
          list.innerHTML = data.length ? "" : "<p class='text-center text-gray-600 mt-10'>Vault is empty</p>";
          
          data.forEach(item => {
            list.innerHTML += \`
              <div class="bg-brand-card border border-brand-border p-4 rounded-xl flex items-center gap-4 hover:border-brand-primary transition group">
                <img src="https://logo.clearbit.com/\${item.domain}" onerror="this.src='https://ui-avatars.com/api/?name=\${item.domain}&background=262626&color=fff'" class="w-10 h-10 rounded-lg">
                <div class="flex-grow min-w-0">
                  <div class="text-white font-bold truncate">\${item.domain}</div>
                  <div class="text-gray-500 text-xs truncate">\${item.username}</div>
                  <div onclick="copyToClipboard('\${item.password}')" class="mt-1 text-xs font-mono text-brand-accent cursor-pointer hover:text-white transition truncate">
                    •••••••• <span class="text-[10px] ml-2 opacity-0 group-hover:opacity-100 bg-brand-border px-1 rounded">Click to Copy</span>
                  </div>
                </div>
                <button onclick="openDeleteModal('\${item.domain}')" class="opacity-0 group-hover:opacity-100 text-xs text-red-500 font-bold p-2 transition">Delete</button>
              </div>
            \`;
          });
        }

        function copyToClipboard(text) {
          navigator.clipboard.writeText(text);
          const toast = document.getElementById('toast');
          toast.classList.remove('translate-y-20', 'opacity-0');
          setTimeout(() => toast.classList.add('translate-y-20', 'opacity-0'), 2000);
        }

        function openDeleteModal(domain) {
          document.getElementById('modal-site-name').innerText = domain;
          document.getElementById('delete-modal').classList.remove('hidden');
          document.getElementById('confirm-delete-btn').onclick = async () => {
            await fetch('/delete', { method: 'POST', body: JSON.stringify({ currentUser, domain }) });
            closeModal();
            loadVault();
          };
        }

        function closeModal() { document.getElementById('delete-modal').classList.add('hidden'); }
      </script>
    </body>
    </html>
  `;

  return new Response(html, { headers: { "Content-Type": "text/html" } });
});
