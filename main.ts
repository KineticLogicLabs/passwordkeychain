const kv = await Deno.openKv();

// --- ⚠️ SECURITY WARNING ---
// Change this to your secret master password!
// In a production app, we would use environment variables.
const MASTER_PASSWORD = "ChangeMe123"; 

Deno.serve(async (req: Request) => {
  const url = new URL(req.url);

  // --- API: Authentication Check ---
  if (req.method === "POST" && url.pathname === "/auth") {
    const { password } = await req.json();
    if (password === MASTER_PASSWORD) {
      return new Response(JSON.stringify({ success: true }));
    }
    return new Response(JSON.stringify({ success: false }), { status: 401 });
  }

  // --- API: Save/Update Entry ---
  if (req.method === "POST" && url.pathname === "/save") {
    const entry = await req.json(); // { domain, username, password, notes }
    if (!entry.domain || !entry.password) return new Response("Missing fields", { status: 400 });
    
    // Save to KV using the domain as the key
    await kv.set(["vault", entry.domain.toLowerCase().trim()], entry);
    return new Response(JSON.stringify({ success: true }));
  }

  // --- API: Delete Entry ---
  if (req.method === "POST" && url.pathname === "/delete") {
    const { domain } = await req.json();
    await kv.delete(["vault", domain.toLowerCase().trim()]);
    return new Response(JSON.stringify({ success: true }));
  }

  // --- API: List All Entries ---
  if (req.method === "GET" && url.pathname === "/list") {
    const items = [];
    const entries = kv.list({ prefix: ["vault"] });
    for await (const entry of entries) {
      items.push(entry.value);
    }
    return new Response(JSON.stringify(items));
  }

  // --- THE UI (HTML/Tailwind) ---
  const html = `
    <!DOCTYPE html>
    <html lang="en" class="dark">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Kinetic Logic Vault</title>
      <script src="https://cdn.tailwindcss.com"></script>
      <script>
        tailwind.config = {
          darkMode: 'class',
          theme: {
            extend: {
              colors: {
                brand: {
                  bg: '#0f172a',    // slate-900
                  card: '#1e293b',  // slate-800
                  border: '#334155',// slate-700
                  text: '#f1f5f9',  // slate-100
                  primary: '#4f46e5',// indigo-600
                  hover: '#4338ca',  // indigo-700
                  danger: '#ef4444', // red-500
                }
              }
            }
          }
        }
      </script>
      <style>
        /* Modern Scrollbar */
        ::-webkit-scrollbar { width: 8px; }
        ::-webkit-scrollbar-track { background: #0f172a; }
        ::-webkit-scrollbar-thumb { background: #334155; border-radius: 4px; }
        ::-webkit-scrollbar-thumb:hover { background: #475569; }
        .hidden { display: none !important; }
      </style>
    </head>
    <body class="bg-brand-bg text-brand-text font-sans antialiased min-h-screen p-4 md:p-8 flex flex-col items-center">
      <div class="w-full max-w-2xl">
        
        <div id="login-screen" class="bg-brand-card p-8 rounded-2xl border border-brand-border shadow-2xl flex flex-col items-center gap-6 mt-16">
          <h1 class="text-3xl font-extrabold tracking-tight text-white">Kinetic Logic Labs</h1>
          <p class="text-slate-400 text-sm text-center">Secure Password Keychain</p>
          <input type="password" id="master-pw" placeholder="Enter Master Password" 
            class="w-full bg-brand-bg p-3 rounded-lg border border-brand-border text-white placeholder:text-slate-500 focus:ring-2 focus:ring-brand-primary focus:border-brand-primary outline-none transition">
          <button onclick="login()" 
            class="w-full bg-brand-primary hover:bg-brand-hover text-white font-semibold p-3 rounded-lg transition duration-150">
            Unlock Vault
          </button>
        </div>

        <div id="vault-screen" class="hidden flex flex-col gap-8">
          
          <div class="flex items-center justify-between gap-4 p-4 bg-brand-card rounded-xl border border-brand-border">
            <h2 class="text-2xl font-bold text-white">Your Vault</h2>
            <button onclick="location.reload()" class="bg-slate-700 hover:bg-slate-600 text-sm font-medium text-white px-4 py-2 rounded-lg transition">
              Log Out
            </button>
          </div>

          <div class="bg-brand-card p-6 rounded-2xl border border-brand-border shadow-xl">
            <h3 class="text-xl font-semibold text-white mb-6">Add New Credential</h3>
            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
              <input id="domain" placeholder="Domain (e.g., github.com)" class="w-full bg-brand-bg p-3 rounded-lg border border-brand-border text-white placeholder:text-slate-500 focus:ring-2 focus:ring-indigo-500 outline-none">
              <input id="username" placeholder="Username / Email" class="w-full bg-brand-bg p-3 rounded-lg border border-brand-border text-white placeholder:text-slate-500 focus:ring-2 focus:ring-indigo-500 outline-none">
              <input id="password" type="text" placeholder="Password" class="w-full bg-brand-bg p-3 rounded-lg border border-brand-border text-white placeholder:text-slate-500 focus:ring-2 focus:ring-indigo-500 outline-none col-span-1 md:col-span-2">
              <textarea id="notes" placeholder="Notes (recovery codes, etc.)" rows="3" class="w-full bg-brand-bg p-3 rounded-lg border border-brand-border text-white placeholder:text-slate-500 focus:ring-2 focus:ring-indigo-500 outline-none col-span-1 md:col-span-2"></textarea>
            </div>
            <button onclick="saveEntry()" class="w-full bg-brand-primary hover:bg-brand-hover text-white font-semibold p-3 rounded-lg transition duration-150 mt-6">
              Save to Keychain
            </button>
          </div>

          <div class="flex gap-3 justify-center">
            <button onclick="exportData()" class="bg-slate-800 hover:bg-slate-700 text-xs text-slate-300 font-medium px-4 py-2 rounded-lg border border-brand-border flex items-center gap-2 transition">
              <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path></svg>
              Export JSON
            </button>
            <button onclick="document.getElementById('importFile').click()" class="bg-slate-800 hover:bg-slate-700 text-xs text-slate-300 font-medium px-4 py-2 rounded-lg border border-brand-border flex items-center gap-2 transition">
              <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 8.25H7.5a2.25 2.25 0 00-2.25 2.25v9a2.25 2.25 0 002.25 2.25h9a2.25 2.25 0 002.25-2.25v-9a2.25 2.25 0 00-2.25-2.25H15M9 12l3 3m0 0l3-3m-3 3V2.25"></path></svg>
              Import JSON
            </button>
            <input type="file" id="importFile" class="hidden" onchange="importData(event)">
          </div>

          <div id="vault-list" class="flex flex-col gap-4 mb-16">
            <p class="text-center text-slate-500 py-10">Syncing with database...</p>
          </div>
        </div>
      </div>

      <script>
        let isAuthed = false;

        async function login() {
          const password = document.getElementById('master-pw').value;
          const res = await fetch('/auth', { method: 'POST', body: JSON.stringify({ password }) });
          if (res.ok) {
            isAuthed = true;
            document.getElementById('login-screen').classList.add('hidden');
            document.getElementById('vault-screen').classList.remove('hidden');
            loadVault();
          } else {
            alert("Incorrect Master Password");
            document.getElementById('master-pw').value = '';
          }
        }

        // Add 'Enter' key support for login
        document.getElementById('master-pw').addEventListener('keypress', function (e) {
          if (e.key === 'Enter') login();
        });

        async function saveEntry() {
          const data = {
            domain: document.getElementById('domain').value.toLowerCase().trim(),
            username: document.getElementById('username').value.trim(),
            password: document.getElementById('password').value,
            notes: document.getElementById('notes').value
          };
          if(!data.domain || !data.password) return alert("Domain and Password are required");
          
          await fetch('/save', { method: 'POST', body: JSON.stringify(data) });
          // Clear inputs and reload list
          document.getElementById('domain').value = '';
          document.getElementById('username').value = '';
          document.getElementById('password').value = '';
          document.getElementById('notes').value = '';
          loadVault();
        }

        async function loadVault() {
          if (!isAuthed) return;
          const res = await fetch('/list');
          const data = await res.json();
          const list = document.getElementById('vault-list');
          
          if (data.length === 0) {
            list.innerHTML = \`<p class="text-center text-slate-500 bg-brand-card p-10 rounded-xl border border-brand-border">Vault is empty.</p>\`;
            return;
          }

          list.innerHTML = "";
          // Sort alphabetically by domain
          data.sort((a, b) => a.domain.localeCompare(b.domain));

          data.forEach((item, index) => {
            const logoUrl = \`https://logo.clearbit.com/\${item.domain}\`;
            // Unique IDs for password visibility toggling
            const pwId = \`pw-\${index}\`;
            const toggleId = \`toggle-\${index}\`;

            list.innerHTML += \`
              <div class="bg-brand-card p-5 rounded-xl border border-brand-border flex items-start gap-4 shadow hover:border-slate-600 transition duration-150">
                <div class="w-12 h-12 rounded-lg bg-slate-700 flex items-center justify-center overflow-hidden border border-brand-border mt-1 flex-shrink-0">
                  <img src="\${logoUrl}" onerror="this.src='https://ui-avatars.com/api/?name=\${item.domain}&background=334155&color=fff'" alt="\${item.domain} logo" class="w-10 h-10 rounded-md">
                </div>
                <div class="flex-grow">
                  <div class="text-lg font-semibold text-white truncate">\${item.domain}</div>
                  <div class="text-sm text-indigo-400 font-medium truncate">\${item.username || 'No username'}</div>
                  
                  <div class="flex items-center gap-2 mt-2 bg-brand-bg p-2 rounded-lg border border-brand-border">
                    <input type="password" id="\${pwId}" value="\${item.password}" readonly class="bg-transparent text-slate-100 text-sm font-mono w-full outline-none">
                    <button id="\${toggleId}" onclick="togglePassword('\${pwId}', '\${toggleId}')" class="text-xs text-slate-400 hover:text-white font-medium px-2 py-1 bg-slate-700 rounded transition">
                      Show
                    </button>
                  </div>

                  \${item.notes ? \`<div class="text-xs text-slate-400 bg-slate-900 p-3 mt-3 rounded-md border border-brand-border whitespace-pre-wrap">\${item.notes}</div>\` : ''}
                </div>
                <button onclick="deleteEntry('\${item.domain}')" class="text-xs text-brand-danger hover:text-red-400 font-bold px-2 py-1 mt-1 transition">
                  Delete
                </button>
              </div>
            \`;
          });
        }

        // Feature: Toggle Password Visibility
        function togglePassword(pwId, toggleId) {
          const pwInput = document.getElementById(pwId);
          const toggleBtn = document.getElementById(toggleId);
          if (pwInput.type === "password") {
            pwInput.type = "text";
            toggleBtn.textContent = "Hide";
          } else {
            pwInput.type = "password";
            toggleBtn.textContent = "Show";
          }
        }

        async function deleteEntry(domain) {
          if(!confirm(\`Delete credentials for \${domain}?\`)) return;
          await fetch('/delete', { method: 'POST', body: JSON.stringify({ domain }) });
          loadVault();
        }

        // Feature: Export to JSON file
        async function exportData() {
          const res = await fetch('/list');
          const data = await res.json();
          if (data.length === 0) return alert("Nothing to export.");
          
          const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = \`kinetic_logic_vault_\${new Date().toISOString().slice(0,10)}.json\`;
          a.click();
          URL.revokeObjectURL(url); // Clean up memory
        }

        // Feature: Import from JSON file
        async function importData(event) {
          const file = event.target.files[0];
          if (!file) return;
          if (!confirm("This will add all entries from the JSON file to your current vault. Continue?")) return;
          
          const reader = new FileReader();
          reader.onload = async (e) => {
            try {
              const data = JSON.parse(e.target.result);
              if (!Array.isArray(data)) throw new Error("Invalid JSON format (must be an array)");
              
              // Import each item individually
              for (const item of data) {
                if (item.domain && item.password) {
                  await fetch('/save', { method: 'POST', body: JSON.stringify(item) });
                }
              }
              alert(\`Successfully processed \${data.length} entries. Reloading vault...\`);
              loadVault();
            } catch (err) {
              alert("Error importing file: " + err.message);
            }
          };
          reader.readAsText(file);
          // Clear input so you can re-upload the same file if needed
          event.target.value = '';
        }
      </script>
    </body>
    </html>
  `;

  return new Response(html, { headers: { "Content-Type": "text/html" } });
});
