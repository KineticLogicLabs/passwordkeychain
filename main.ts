const kv = await Deno.openKv();

// Change this to your secret login!
const MASTER_PASSWORD = "YourSecretPassword123"; 

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

  // --- API: Save Entry ---
  if (req.method === "POST" && url.pathname === "/save") {
    const entry = await req.json(); // { domain, username, password, notes }
    await kv.set(["vault", entry.domain], entry);
    return new Response(JSON.stringify({ success: true }));
  }

  // --- API: Delete Entry ---
  if (req.method === "POST" && url.pathname === "/delete") {
    const { domain } = await req.json();
    await kv.delete(["vault", domain]);
    return new Response(JSON.stringify({ success: true }));
  }

  // --- API: List All ---
  if (req.method === "GET" && url.pathname === "/list") {
    const items = [];
    for await (const entry of kv.list({ prefix: ["vault"] })) {
      items.push(entry.value);
    }
    return new Response(JSON.stringify(items));
  }

  // --- UI: The Vault ---
  const html = `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Kinetic Logic Vault</title>
      <style>
        :root { --bg: #0d1117; --card: #161b22; --border: #30363d; --text: #c9d1d9; --primary: #238636; --accent: #58a6ff; }
        body { font-family: -apple-system, sans-serif; background: var(--bg); color: var(--text); margin: 0; display: flex; justify-content: center; padding: 20px; }
        .container { width: 100%; max-width: 600px; }
        .hidden { display: none !important; }
        .card { background: var(--card); border: 1px solid var(--border); border-radius: 12px; padding: 24px; margin-bottom: 20px; box-shadow: 0 8px 24px rgba(0,0,0,0.5); }
        input, textarea { width: 100%; padding: 12px; margin: 8px 0; background: var(--bg); border: 1px solid var(--border); color: white; border-radius: 8px; box-sizing: border-box; font-size: 14px; }
        button { width: 100%; background: var(--primary); color: white; border: none; padding: 12px; border-radius: 8px; cursor: pointer; font-weight: bold; transition: 0.2s; }
        button:hover { opacity: 0.9; }
        .entry { display: flex; align-items: center; gap: 15px; background: var(--card); padding: 15px; border-radius: 10px; border: 1px solid var(--border); margin-top: 10px; }
        .logo { width: 40px; height: 40px; border-radius: 8px; background: #30363d; display: flex; align-items: center; justify-content: center; overflow: hidden; }
        .details { flex-grow: 1; }
        .site-title { font-weight: bold; color: var(--accent); font-size: 16px; }
        .sub-text { font-size: 12px; opacity: 0.7; }
        .actions { display: flex; gap: 10px; margin-top: 15px; }
        .btn-outline { background: transparent; border: 1px solid var(--border); width: auto; font-size: 12px; }
        .btn-danger { background: #da3633; width: auto; font-size: 12px; }
      </style>
    </head>
    <body>
      <div class="container">
        
        <div id="login-screen" class="card">
          <h2 style="text-align:center">🔐 Kinetic Logic Vault</h2>
          <p style="text-align:center; opacity:0.7">Enter Master Password to Unlock</p>
          <input type="password" id="master-pw" placeholder="Master Password">
          <button onclick="login()">Unlock Vault</button>
        </div>

        <div id="vault-screen" class="hidden">
          <div style="display:flex; justify-content: space-between; align-items:center">
            <h2>🛡️ Your Vault</h2>
            <button class="btn-outline" onclick="location.reload()">Lock</button>
          </div>

          <div class="card">
            <h3>Add New Credential</h3>
            <input id="domain" placeholder="Domain (e.g. github.com)">
            <input id="username" placeholder="Username / Email">
            <input id="password" type="text" placeholder="Password">
            <textarea id="notes" placeholder="Recovery codes / Notes" rows="2"></textarea>
            <button onclick="saveEntry()">Save to Keychain</button>
          </div>

          <div class="actions">
            <button class="btn-outline" onclick="exportData()">📤 Export JSON</button>
            <button class="btn-outline" onclick="document.getElementById('importFile').click()">📥 Import JSON</button>
            <input type="file" id="importFile" class="hidden" onchange="importData(event)">
          </div>

          <div id="vault-list" style="margin-top: 20px;"></div>
        </div>
      </div>

      <script>
        let isAuthed = false;

        async function login() {
          const password = document.getElementById('master-pw').value;
          const res = await fetch('/auth', { method: 'POST', body: JSON.stringify({ password }) });
          if (res.ok) {
            document.getElementById('login-screen').classList.add('hidden');
            document.getElementById('vault-screen').classList.remove('hidden');
            loadVault();
          } else {
            alert("Incorrect Master Password");
          }
        }

        async function saveEntry() {
          const data = {
            domain: document.getElementById('domain').value.toLowerCase().trim(),
            username: document.getElementById('username').value,
            password: document.getElementById('password').value,
            notes: document.getElementById('notes').value
          };
          if(!data.domain || !data.password) return alert("Domain and Password required");
          
          await fetch('/save', { method: 'POST', body: JSON.stringify(data) });
          location.reload();
        }

        async function loadVault() {
          const res = await fetch('/list');
          const data = await res.json();
          const list = document.getElementById('vault-list');
          list.innerHTML = data.length ? "" : "<p style='text-align:center; opacity:0.5'>No credentials saved yet.</p>";
          
          data.forEach(item => {
            const logoUrl = \`https://logo.clearbit.com/\${item.domain}\`;
            list.innerHTML += \`
              <div class="entry">
                <div class="logo">
                  <img src="\${logoUrl}" onerror="this.src='https://ui-avatars.com/api/?name=\${item.domain}'" width="40">
                </div>
                <div class="details">
                  <div class="site-title">\${item.domain}</div>
                  <div class="sub-text">User: \${item.username}</div>
                  <div class="sub-text">PW: \${item.password}</div>
                  \${item.notes ? \`<div class="sub-text" style="color:#8b949e">Notes: \${item.notes}</div>\` : ''}
                </div>
                <button class="btn-danger" onclick="deleteEntry('\${item.domain}')">Delete</button>
              </div>
            \`;
          });
        }

        async function deleteEntry(domain) {
          if(!confirm("Delete entry for " + domain + "?")) return;
          await fetch('/delete', { method: 'POST', body: JSON.stringify({ domain }) });
          loadVault();
        }

        async function exportData() {
          const res = await fetch('/list');
          const data = await res.json();
          const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = 'vault_export.json';
          a.click();
        }

        async function importData(event) {
          const file = event.target.files[0];
          const reader = new FileReader();
          reader.onload = async (e) => {
            const data = JSON.parse(e.target.result);
            for(const item of data) {
              await fetch('/save', { method: 'POST', body: JSON.stringify(item) });
            }
            loadVault();
          };
          reader.readAsText(file);
        }
      </script>
    </body>
    </html>
  `;

  return new Response(html, { headers: { "Content-Type": "text/html" } });
});
