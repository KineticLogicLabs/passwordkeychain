// 1. Initialize the Database
const kv = await Deno.openKv();

Deno.serve(async (req: Request) => {
  const url = new URL(req.url);

  // --- HANDLER: Saving a New Password ---
  if (req.method === "POST" && url.pathname === "/save") {
    try {
      const { site, encryptedData } = await req.json();
      
      // Save to Deno KV using the site name as the key
      await kv.set(["passwords", site], encryptedData);
      
      return new Response(JSON.stringify({ success: true }), {
        headers: { "Content-Type": "application/json" },
      });
    } catch (err) {
      return new Response("Error saving data", { status: 400 });
    }
  }

  // --- HANDLER: Fetching All Passwords ---
  if (req.method === "GET" && url.pathname === "/list") {
    const passwords = [];
    const entries = kv.list({ prefix: ["passwords"] });
    for await (const entry of entries) {
      passwords.push({ site: entry.key[1], data: entry.value });
    }
    return new Response(JSON.stringify(passwords), {
      headers: { "Content-Type": "application/json" },
    });
  }

  // --- UI: Simple HTML Front-end ---
  const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <title>PasswordKeychain</title>
        <style>
          body { font-family: sans-serif; max-width: 500px; margin: 50px auto; padding: 20px; background: #f4f4f9; }
          input { width: 100%; padding: 10px; margin: 10px 0; border: 1px solid #ccc; border-radius: 5px; }
          button { background: #007bff; color: white; border: none; padding: 10px 20px; border-radius: 5px; cursor: pointer; }
          .item { background: white; padding: 10px; margin-top: 10px; border-radius: 5px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
        </style>
      </head>
      <body>
        <h2>PasswordKeychain</h2>
        <input id="site" placeholder="Website Name (e.g. Netflix)">
        <input id="pw" placeholder="Password (In a real app, encrypt this first!)">
        <button onclick="savePassword()">Save Password</button>

        <div id="display"></div>

        <script>
          async function savePassword() {
            const site = document.getElementById('site').value;
            const pw = document.getElementById('pw').value;
            
            await fetch('/save', {
              method: 'POST',
              body: JSON.stringify({ site, encryptedData: pw })
            });
            location.reload();
          }

          async function loadPasswords() {
            const res = await fetch('/list');
            const data = await res.json();
            const div = document.getElementById('display');
            data.forEach(item => {
              div.innerHTML += '<div class="item"><strong>' + item.site + ':</strong> ' + item.data + '</div>';
            });
          }
          loadPasswords();
        </script>
      </body>
    </html>
  `;

  return new Response(html, {
    headers: { "Content-Type": "text/html" },
  });
});
