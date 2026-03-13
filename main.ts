const kv = await Deno.openKv();

// Create initial user if none exists
const initialUser = await kv.get(["users", "admin"]);
if (!initialUser.value) {
  await kv.set(["users", "admin"], { password: "password" });
}

Deno.serve(async (req: Request) => {
  const url = new URL(req.url);

  // Serve the HTML file for the main page
  if (req.method === "GET" && url.pathname === "/") {
    const html = await Deno.readTextFile("./index.html");
    return new Response(html, { headers: { "Content-Type": "text/html" } });
  }

  // --- API ENDPOINTS ---
  if (req.method === "POST") {
    const body = await req.json();

    if (url.pathname === "/auth") {
      const user = await kv.get(["users", body.username]);
      if (user.value && user.value.password === body.password) {
        return new Response(JSON.stringify({ success: true }));
      }
      return new Response("Unauthorized", { status: 401 });
    }

    if (url.pathname === "/list") {
      const items = [];
      for await (const entry of kv.list({ prefix: ["users", body.currentUser, "vault"] })) {
        items.push(entry.value);
      }
      return new Response(JSON.stringify(items));
    }

    if (url.pathname === "/save") {
      await kv.set(["users", body.currentUser, "vault", body.entry.domain.toLowerCase()], body.entry);
      return new Response(JSON.stringify({ success: true }));
    }

    if (url.pathname === "/delete") {
      await kv.set(["users", body.currentUser, "vault", body.domain], null); // Deletes entry
      await kv.delete(["users", body.currentUser, "vault", body.domain]);
      return new Response(JSON.stringify({ success: true }));
    }

    if (url.pathname === "/update-account") {
      // Logic to migrate entries to new username
      const oldEntries = [];
      for await (const entry of kv.list({ prefix: ["users", body.oldUser, "vault"] })) {
        oldEntries.push(entry);
      }
      await kv.set(["users", body.newUser], { password: body.newPassword });
      for (const entry of oldEntries) {
        const domain = entry.key[3];
        await kv.set(["users", body.newUser, "vault", domain], entry.value);
        await kv.delete(["users", body.oldUser, "vault", domain]);
      }
      if (body.oldUser !== body.newUser) await kv.delete(["users", body.oldUser]);
      return new Response(JSON.stringify({ success: true }));
    }
  }

  return new Response("Not Found", { status: 404 });
});
