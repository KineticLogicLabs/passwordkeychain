// 1. Initialize the Database
const kv = await Deno.openKv();

Deno.serve(async (req: Request) => {
  const url = new URL(req.url);

  // --- API: Save a Password ---
  if (req.method === "POST" && url.pathname === "/save") {
    const { site, encryptedData } = await req.json();
    await kv.set(["passwords", site], encryptedData);
    return new Response(JSON.stringify({ success: true }));
  }

  // --- API: Delete a Password ---
  if (req.method === "POST" && url.pathname === "/delete") {
    const { site } = await req.json();
    await kv.delete(["passwords", site]);
    return new Response(JSON.stringify({ success: true }));
  }

  // --- API: List all Passwords ---
  if (req.method === "GET" && url.pathname === "/list") {
    const passwords = [];
    const entries = kv.list({ prefix: ["passwords"] });
    for await (const entry of entries) {
      passwords.push({ site: entry.key[1], data: entry.value });
    }
    return new Response(JSON.stringify(passwords));
  }

  // --- Frontend UI ---
  const html = `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>PasswordKeychain</title>
      <style>
        body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif; max-width: 500px; margin: 40px auto; padding: 20px; background: #0d1117; color: #c9d1d9; }
        .card { background: #161b22; padding: 20px; border-radius: 8px; border: 1px solid #30363d; margin-bottom: 20px; }
        input { width: 100%; padding: 10px; margin: 8px 0; background: #0d1117; border: 1px solid #30363d; color: white; border-radius: 6px; box-sizing: border-box; }
        button { width: 100%; background: #238636; color: white; border: none; padding: 10px; border-radius: 6px; cursor: pointer; font-weight: bold; margin-top: 10px; }
        button.delete { background: #da3633; width: auto; padding: 5px 10px; font-size: 12px; }
        .pw-item { display: flex; justify-content: space-between; align-items: center; background: #21262d; padding: 12px; margin-top: 8px; border-radius: 6px; border: 1px solid #30363d; }
        .site-name { font-weight: bold; color: #58a6ff; }
      </style>
    </head>
    <body>
      <h2>🔐 PasswordKeychain</h2>
      <div class="card">
        <input id="site" placeholder="Website (e.g. GitHub)">
        <input id="pw" placeholder="Password">
        <button onclick="savePassword()">Add to Vault</button>
      </div>

      <div id="display">Loading vault...</div>

      <script>
        async function savePassword() {
          const site = document.getElementById('site').value;
          const pw = document.getElementById('pw').value;
          if(!site || !pw) return alert("Fill in both fields");
          
          await fetch('/save', {
            method: 'POST',
            body: JSON.stringify({ site, encryptedData: pw })
          });
          location.reload();
        }

        async function deletePw(site) {
          if(!confirm("Delete " + site + "?")) return;
          await fetch('/delete', {
            method: 'POST',
            body: JSON.stringify({ site })
          });
          location.reload();
        }

        async function load() {
          const res = await fetch('/list');
          const data = await res.json();
          const div = document.getElementById('display');
          div.innerHTML = data.length ? "" : "Vault is empty.";
          data.forEach(item => {
            div.innerHTML += \`
              <div class="pw-item">
                <div>
                  <div class="site-name">\${item.site}</div>
                  <div style="font-size: 14px; opacity: 0.8;">\${item.data}</div>
                </div>
                <button class="delete" onclick="deletePw('\${item.site}')">Delete</button>
              </div>
            \`;
          });
        }
        load();
      </script>
    </body>
    </html>
  `;

  return new Response(html, { headers: { "Content-Type": "text/html" } });
});
