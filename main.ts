const kv = await Deno.openKv();

// --- AUTO-SETUP ---
const initialUser = await kv.get(["users", "admin"]);
if (!initialUser.value) {
  await kv.set(["users", "admin"], { password: "password" });
}

Deno.serve(async (req: Request) => {
  const url = new URL(req.url);

  // API Routes
  if (req.method === "POST" && url.pathname === "/auth") {
    const { username, password } = await req.json();
    const user = await kv.get(["users", username]);
    if (user.value && user.value.password === password) {
      return new Response(JSON.stringify({ success: true }));
    }
    return new Response("Unauthorized", { status: 401 });
  }

  if (req.method === "POST" && url.pathname === "/update-account") {
    const { oldUser, newUser, newPassword } = await req.json();
    const oldEntries = [];
    for await (const entry of kv.list({ prefix: ["users", oldUser, "vault"] })) {
      oldEntries.push(entry);
    }
    await kv.set(["users", newUser], { password: newPassword });
    for (const entry of oldEntries) {
      const domain = entry.key[3];
      await kv.set(["users", newUser, "vault", domain], entry.value);
      await kv.delete(["users", oldUser, "vault", domain]);
    }
    if (oldUser !== newUser) await kv.delete(["users", oldUser]);
    return new Response(JSON.stringify({ success: true }));
  }

  if (req.method === "POST" && url.pathname === "/save") {
    const { currentUser, entry } = await req.json();
    await kv.set(["users", currentUser, "vault", entry.domain.toLowerCase()], entry);
    return new Response(JSON.stringify({ success: true }));
  }

  if (req.method === "POST" && url.pathname === "/delete") {
    const { currentUser, domain } = await req.json();
    await kv.delete(["users", currentUser, "vault", domain]);
    return new Response(JSON.stringify({ success: true }));
  }

  if (req.method === "POST" && url.pathname === "/list") {
    const { currentUser } = await req.json();
    const items = [];
    for await (const entry of kv.list({ prefix: ["users", currentUser, "vault"] })) {
      items.push(entry.value);
    }
    return new Response(JSON.stringify(items));
  }

  // --- THE UI ---
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
          theme: { extend: { colors: { brand: { bg: '#0a0a0a', card: '#171717', border: '#262626', primary: '#3b82f6', accent: '#60a5fa' } } } }
        }
      </script>
      <style>
        .modal-bg { background: rgba(0,0,0,0.85); backdrop-filter: blur(4px); }
        .hidden { display: none !important; }
        @keyframes shake {
          0%, 100% { transform: translateX(0); }
          25% { transform: translateX(-8px); }
          50% { transform: translateX(8px); }
          75% { transform: translateX(-8px); }
        }
        .shake { animation: shake 0.4s ease-in-out; border-color: #ef4444 !important; }
      </style>
    </head>
    <body class="bg-brand-bg text-gray-200 min-h-screen flex flex-col items-center p-6 selection:bg-brand-primary/30">

      <div id="auth-container" class="w-full max-w-md mt-20 transition-all duration-500">
        <div class="text-center mb-8">
          <h1 class="text-3xl font-bold text-white tracking-tight">Password Keychain</h1>
          <p class="text-brand-accent text-sm font-medium uppercase tracking-widest mt-1">By Kinetic Logic Labs</p>
        </div>
        <div id="login-card" class="bg-brand-card border border-brand-border p-8 rounded-2xl shadow-2xl">
          <h2 class="text-white font-bold mb-6 text-xl">Log In</h2>
          <input id="auth-user" placeholder="Username" class="w-full bg-brand-bg border border-brand-border p-3 rounded-lg mb-3 outline-none focus:border-brand-primary transition text-white">
          
          <div class="relative mb-6">
            <input id="auth-pw" type="password" placeholder="Master Password" class="w-full bg-brand-bg border border-brand-border p-3 rounded-lg outline-none focus:border-brand-primary transition text-white pr-12">
            <button onclick="toggleLoginVisibility()" class="absolute right-3 top-3 text-gray-500 hover:text-brand-accent transition">
              <svg id="eye-icon" class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"></path><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"></path></svg>
            </button>
          </div>
          
          <button id="login-btn" onclick="handleLogin()" class="w-full bg-brand-primary hover:bg-blue-600 text-white font-bold py-3 rounded-lg transition duration-200">Access Vault</button>
          <p id="login-error" class="text-red-500 text-sm font-medium text-center mt-4 transition-opacity duration-300 opacity-0 pointer-events-none">Invalid Username or Password</p>
        </div>
      </div>

      <div id="vault-screen" class="hidden w-full max-w-2xl">
        <div class="flex justify-between items-center mb-8">
          <div>
            <h1 class="text-2xl font-bold text-white">My Vault</h1>
            <p id="user-display" class="text-sm text-gray-500"></p>
          </div>
          <div class="flex gap-2">
            <button onclick="toggleSettings()" class="text-xs bg-brand-card border border-brand-border px-4 py-2 rounded-lg hover:bg-brand-border transition">Settings</button>
            <button onclick="location.reload()" class="text-xs bg-brand-card border border-brand-border px-4 py-2 rounded-lg hover:bg-brand-border transition">Lock</button>
          </div>
        </div>

        <div id="settings-panel" class="hidden bg-brand-card border border-brand-primary/30 p-6 rounded-2xl mb-8">
          <h3 class="text-white font-bold mb-4">Account Settings</h3>
          <div class="grid grid-cols-2 gap-3 mb-4">
            <input id="new-username" placeholder="New Username" class="bg-brand-bg border border-brand-border p-2 rounded-lg outline-none text-sm text-white">
            <input id="new-password" type="password" placeholder="New Password" class="bg-brand-bg border border-brand-border p-2 rounded-lg outline-none text-sm text-white">
          </div>
          <button onclick="updateAccount()" class="w-full bg-slate-700 hover:bg-slate-600 text-white py-2 rounded-lg text-sm font-bold transition">Update & Re-login</button>
        </div>

        <div class="mb-6">
          <input id="vault-search" oninput="filterVault()" placeholder="Search domain or username..." class="w-full bg-brand-card border border-brand-border p-3 rounded-xl outline-none focus:border-brand-primary/50 text-sm transition text-white">
        </div>

        <div id="add-form" class="bg-brand-card border border-brand-border p-6 rounded-2xl mb-8 shadow-lg">
          <div class="grid grid-cols-2 gap-3 mb-3">
            <input id="dom" placeholder="Domain (google.com)" class="bg-brand-bg border border-brand-border p-2 rounded-lg outline-none text-sm text-white">
            <input id="usr" placeholder="Username" class="bg-brand-bg border border-brand-border p-2 rounded-lg outline-none text-sm text-white">
          </div>
          <input id="pwd" placeholder="Password" class="w-full bg-brand-bg border border-brand-border p-2 rounded-lg mb-3 outline-none text-sm text-white">
          <textarea id="nts" placeholder="Notes..." class="w-full bg-brand-bg border border-brand-border p-2 rounded-lg mb-4 outline-none text-sm text-white" rows="2"></textarea>
          <button onclick="saveEntry()" class="w-full bg-brand-primary hover:bg-blue-600 font-bold py-2 rounded-lg transition text-sm">Add New Entry</button>
        </div>

        <div id="vault-list" class="space-y-3"></div>
      </div>

      <div id="custom-modal" class="hidden fixed inset-0 modal-bg flex items-center justify-center z-50 p-4">
        <div class="bg-brand-card border border-brand-border p-8 rounded-2xl max-w-sm w-full text-center shadow-2xl">
          <h3 id="modal-title" class="text-xl font-bold text-white mb-2"></h3>
          <p id="modal-desc" class="text-gray-400 text-sm mb-6"></p>
          <div class="flex gap-3">
            <button onclick="closeModal()" class="flex-1 bg-brand-border py-2 rounded-lg font-bold text-sm">Cancel</button>
            <button id="modal-confirm-btn" class="flex-1 bg-brand-primary py-2 rounded-lg font-bold text-sm">Confirm</button>
          </div>
        </div>
      </div>

      <div id="toast" class="fixed top-10 right-10 bg-brand-card border border-brand-primary text-white px-6 py-3 rounded-xl font-bold shadow-2xl transform translate-x-80 transition duration-300 opacity-0 z-[100]"></div>

      <script>
        let currentUser = "";
        let vaultData = [];

        document.addEventListener('keydown', (e) => {
          if (e.key === 'Enter' && !document.getElementById('auth-container').classList.contains('hidden')) {
            handleLogin();
          }
        });

        function toggleLoginVisibility() {
          const pw = document.getElementById('auth-pw');
          const icon = document.getElementById('eye-icon');
          if (pw.type === 'password') {
            pw.type = 'text';
            icon.innerHTML = '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l18 18"></path>';
          } else {
            pw.type = 'password';
            icon.innerHTML = '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"></path><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"></path>';
          }
        }

        async function handleLogin() {
          const card = document.getElementById('login-card');
          const errorMsg = document.getElementById('login-error');
          const username = document.getElementById('auth-user').value;
          const password = document.getElementById('auth-pw').value;
          const res = await fetch('/auth', { method: 'POST', body: JSON.stringify({ username, password }) });
          if(res.ok) {
            currentUser = username;
            document.getElementById('auth-container').classList.add('hidden');
            document.getElementById('vault-screen').classList.remove('hidden');
            document.getElementById('user-display').innerText = "Logged in as " + username;
            document.getElementById('new-username').value = username;
            loadVault();
          } else {
            card.classList.add('shake');
            errorMsg.classList.replace('opacity-0', 'opacity-100');
            setTimeout(() => {
              card.classList.remove('shake');
              errorMsg.classList.replace('opacity-100', 'opacity-0');
            }, 3000);
          }
        }

        function toggleSettings() {
          document.getElementById('settings-panel').classList.toggle('hidden');
          document.getElementById('add-form').classList.toggle('hidden');
        }

        async function updateAccount() {
          const newUser = document.getElementById('new-username').value.trim();
          const newPassword = document.getElementById('new-password').value;
          if(!newUser || !newPassword) return showToast("Fields cannot be empty", true);
          await fetch('/update-account', { method: 'POST', body: JSON.stringify({ oldUser: currentUser, newUser, newPassword }) });
          showToast("Account Updated. Re-login required.");
          setTimeout(() => location.reload(), 1500);
        }

        async function saveEntry() {
          const entry = {
            domain: document.getElementById('dom').value.trim(),
            username: document.getElementById('usr').value.trim(),
            password: document.getElementById('pwd').value,
            notes: document.getElementById('nts').value
          };
          if(!entry.domain || !entry.password) return showToast("Required fields missing", true);
          await fetch('/save', { method: 'POST', body: JSON.stringify({ currentUser, entry }) });
          ['dom','usr','pwd','nts'].forEach(id => document.getElementById(id).value = '');
          showToast("Entry Saved");
          loadVault();
        }

        async function loadVault() {
          const res = await fetch('/list', { method: 'POST', body: JSON.stringify({ currentUser }) });
          vaultData = await res.json();
          renderVault(vaultData);
        }

        function filterVault() {
          const query = document.getElementById('vault-search').value.toLowerCase();
          const filtered = vaultData.filter(item => item.domain.toLowerCase().includes(query) || item.username.toLowerCase().includes(query));
          renderVault(filtered);
        }

        function renderVault(data) {
          const list = document.getElementById('vault-list');
          list.innerHTML = data.length ? "" : "<p class='text-center text-gray-600 mt-10'>Vault is empty</p>";
          data.forEach(item => {
            list.innerHTML += \`
              <div class="bg-brand-card border border-brand-border p-4 rounded-xl flex items-center gap-4 hover:border-brand-primary/50 transition group">
                <img src="https://logo.clearbit.com/\${item.domain}" onerror="this.src='https://ui-avatars.com/api/?name=\${item.domain}&background=262626&color=fff'" class="w-10 h-10 rounded-lg">
                <div class="flex-grow min-w-0">
                  <div class="text-white font-bold truncate">\${item.domain}</div>
                  <div class="text-gray-500 text-xs truncate">\${item.username}</div>
                  <div onclick="copyToClipboard('\${item.password}')" class="mt-1 text-xs font-mono text-brand-accent cursor-pointer hover:text-white transition truncate">
                    •••••••• <span class="text-[10px] ml-2 opacity-0 group-hover:opacity-100 bg-brand-border px-1 rounded">Copy</span>
                  </div>
                </div>
                <button onclick="confirmDelete('\${item.domain}')" class="opacity-0 group-hover:opacity-100 text-xs text-red-500 font-bold p-2 hover:bg-red-500/10 rounded-lg transition">Delete</button>
              </div>
            \`;
          });
        }

        function copyToClipboard(text) {
          navigator.clipboard.writeText(text);
          showToast("Copied to Clipboard");
        }

        function showToast(msg, isError = false) {
          const toast = document.getElementById('toast');
          toast.innerText = msg;
          toast.style.borderColor = isError ? '#ef4444' : '#3b82f6';
          toast.classList.remove('translate-x-80', 'opacity-0');
          setTimeout(() => toast.classList.add('translate-x-80', 'opacity-0'), 2000);
        }

        function confirmDelete(domain) {
          const modal = document.getElementById('custom-modal');
          document.getElementById('modal-title').innerText = "Delete Entry?";
          document.getElementById('modal-desc').innerText = "Permanently erase " + domain + "?";
          const btn = document.getElementById('modal-confirm-btn');
          modal.classList.remove('hidden');
          btn.onclick = async () => {
            await fetch('/delete', { method: 'POST', body: JSON.stringify({ currentUser, domain }) });
            closeModal();
            showToast("Entry Deleted");
            loadVault();
          };
        }
        function closeModal() { document.getElementById('custom-modal').classList.add('hidden'); }
      </script>
    </body>
    </html>
  \`;

  return new Response(html, { headers: { "Content-Type": "text/html" } });
});
