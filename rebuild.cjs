const fs = require('fs');
const html = fs.readFileSync('index.html', 'utf8');

const extract = (startStr, endStr) => {
    const start = html.indexOf(startStr);
    if (start === -1) return '';
    const end = html.indexOf(endStr, start);
    return html.substring(start, end + endStr.length);
};

const extractInside = (startStr, endStr) => {
    const start = html.indexOf(startStr);
    if (start === -1) return '';
    const end = html.indexOf(endStr, start + startStr.length);
    return html.substring(start + startStr.length, end);
};

const headAndStyles = extract('<!DOCTYPE html>', '</head>');
const overlayAndModalsStart = html.indexOf('<div id="loading-overlay"');
const overlayAndModalsEnd = html.indexOf('<!-- Auth -->');
const overlaysAndModals = html.substring(overlayAndModalsStart, overlayAndModalsEnd);

const authBlockStart = html.indexOf('<!-- Auth -->');
const authBlockEnd = html.indexOf('<!-- Vault -->');
const authBlock = html.substring(authBlockStart, authBlockEnd).replace('class="w-full max-w-md mx-auto mt-10 md:mt-20 transition-all duration-700 px-4"', 'class="absolute inset-0 z-[500] bg-slate-50 flex flex-col items-center justify-center transition-all duration-700 px-4"');

const settingsCreds = extractInside('<h3 class="text-slate-500 text-[10px] font-bold mb-4 uppercase tracking-widest">Master Credentials</h3>', '</div>\n                        </div>');
const settingsSchema = extractInside('<h3 class="text-slate-500 text-[10px] font-bold mb-4 uppercase tracking-widest">Vault Schema (Categories)</h3>', '</div>\n                    </div>\n                </div>');
const adminSection = extractInside('<div id="admin-section"', '</div>\n                    </div>');
const adminUserList = extractInside('<div id="user-management-panel"', '</div>\n            </div>');

const addEntryConsole = extractInside('<!-- Add Entry Console -->', '<div class="mb-6 pl-1">').trim();
const vaultTable = extractInside('<div class="mb-6 pl-1">', '</div>\n        \n    </div>');

const scriptBlock = extract('<script>', '</script>');

const newBody = `
<body class="bg-slate-50 text-slate-900 font-sans selection:bg-slate-200 overflow-hidden h-screen w-full flex">
    <style>
        .tab-content { display: none; opacity: 0; transition: opacity 0.3s; }
        .tab-content.active { display: block; opacity: 1; }
        .nav-btn.active { background-color: #eff6ff; color: #1d4ed8; }
        .nav-btn:not(.active) { color: #475569; }
        .nav-btn:not(.active):hover { background-color: #f8fafc; color: #0f172a; }
    </style>

    ${overlaysAndModals}
    ${authBlock}

    <!-- Main App Layout -->
    <div id="main-app" class="hidden w-full h-full flex opacity-0 transition-opacity duration-700">
        
        <!-- Sidebar -->
        <aside class="w-64 bg-white border-r border-slate-200 flex flex-col justify-between shrink-0 h-full z-10 shadow-sm relative">
            <div>
                <div class="h-20 flex items-center px-6 border-b border-slate-100 gap-3">
                    <div class="w-8 h-8 bg-blue-600 rounded flex items-center justify-center shadow-md shadow-blue-200 shrink-0">
                        <svg class="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"/></svg>
                    </div>
                    <span class="font-bold text-lg tracking-tight truncate">VAULT_CORE</span>
                </div>
                <div class="p-4 space-y-1">
                    <button onclick="switchTab('vault')" id="nav-vault" class="w-full flex items-center gap-3 px-3 py-2.5 rounded-md font-bold text-sm transition-colors nav-btn active">
                        <svg class="w-5 h-5 opacity-80" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z"/></svg>
                        Vault
                    </button>
                    <button onclick="switchTab('settings')" id="nav-settings" class="w-full flex items-center gap-3 px-3 py-2.5 rounded-md font-bold text-sm transition-colors nav-btn">
                        <svg class="w-5 h-5 opacity-80" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"/><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/></svg>
                        Settings
                    </button>
                    <button onclick="switchTab('admin')" id="nav-admin" class="hidden w-full items-center gap-3 px-3 py-2.5 rounded-md font-bold text-sm transition-colors nav-btn">
                        <svg class="w-5 h-5 opacity-80" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z"/></svg>
                        Admin Dashboard
                    </button>
                </div>
            </div>
            
            <div class="p-4 border-t border-slate-100 mb-4">
                <div class="mb-4 px-3">
                    <p class="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Active Identity</p>
                    <p id="sidebar-user" class="text-xs font-mono text-slate-900 font-bold truncate mt-1.5"></p>
                </div>
                <button onclick="location.reload()" class="w-full flex items-center gap-3 px-3 py-2 rounded-md text-slate-500 hover:bg-slate-50 hover:text-red-600 font-bold text-sm transition-colors">
                    <svg class="w-5 h-5 opacity-80" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"/></svg>
                    Log Out
                </button>
            </div>
        </aside>

        <!-- Main Content Layout -->
        <main class="flex-1 h-full overflow-y-auto bg-slate-50 relative">
            <div class="p-6 md:p-10 max-w-7xl mx-auto">
                <!-- Vault Tab -->
                <div id="tab-vault" class="tab-content active pb-20">
                    <div class="flex flex-col md:flex-row justify-between items-start md:items-end gap-6 mb-8 md:mb-12">
                        <div>
                            <h1 class="text-3xl md:text-4xl font-bold text-slate-900 tracking-tight">Vault Entries</h1>
                            <p id="vault-count" class="text-sm text-slate-500 mt-1">Securely manage credentials and secrets across environments</p>
                        </div>
                        <div class="grid grid-cols-2 md:flex gap-3 w-full md:w-auto">
                            <button onclick="exportVault()" class="btn-interact bg-white hover:bg-slate-50 border border-slate-200 px-4 py-2 rounded-md text-[10px] font-bold uppercase tracking-widest text-slate-600 transition-colors shadow-sm">Export</button>
                            <button onclick="document.getElementById('import-input').click()" class="btn-interact bg-white hover:bg-slate-50 border border-slate-200 px-4 py-2 rounded-md text-[10px] font-bold uppercase tracking-widest text-slate-600 transition-colors shadow-sm">Import</button>
                            <input type="file" id="import-input" class="hidden" accept=".json" onchange="importVault(event)">
                        </div>
                    </div>

                    <!-- Add Entry Console -->
                    <!-- Replaced Add Entry wrapper with cleaner styling -->
                    <div class="bg-white border border-slate-200 p-6 md:p-8 rounded-xl mb-12 shadow-sm">
                        ${addEntryConsole} <!-- The start inner stuff down to the actual end -->

                    <div class="mb-6 pl-1">
                    ${vaultTable}
                </div>
            </div>

                <!-- Settings Tab -->
                <div id="tab-settings" class="tab-content pb-20 max-w-4xl mx-auto">
                    <div class="mb-8 md:mb-12">
                        <h1 class="text-3xl md:text-4xl font-bold text-slate-900 tracking-tight">Settings</h1>
                        <p class="text-sm text-slate-500 mt-1">Manage your vault preferences and schema</p>
                    </div>
                    
                    <div class="space-y-8">
                        <div class="bg-white border border-slate-200 p-6 md:p-8 rounded-xl shadow-sm">
                            <div class="grid grid-cols-1 md:grid-cols-2 gap-10">
                                <div>
                                    <h3 class="text-slate-500 text-[10px] font-bold mb-4 uppercase tracking-widest">Master Credentials</h3>
                                    ${settingsCreds}
                                </div>
                                <div class="border-t md:border-t-0 md:border-l border-slate-100 pt-8 md:pt-0 md:pl-10">
                                    <h3 class="text-slate-500 text-[10px] font-bold mb-4 uppercase tracking-widest">Vault Schema (Categories)</h3>
                                    ${settingsSchema}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- Admin Tab -->
                <div id="tab-admin" class="tab-content pb-20">
                    <div class="mb-8 md:mb-12">
                        <h1 class="text-3xl md:text-4xl font-bold text-slate-900 tracking-tight">Admin Dashboard</h1>
                        <p class="text-sm text-slate-500 mt-1">System-wide user identity and access management</p>
                    </div>

                    <div class="space-y-8 max-w-4xl">
                        <div class="bg-white border border-slate-200 p-6 md:p-8 rounded-xl shadow-sm">
                            <h3 class="text-neutral-500 text-[10px] font-bold mb-4 uppercase tracking-widest">Account Registry</h3>
                            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <input id="reg-user" placeholder="Register New Identity" class="w-full bg-slate-50 border border-slate-200 p-3 rounded-md text-sm text-slate-900 outline-none focus:border-slate-400 font-mono transition-all">
                                <div class="flex gap-4">
                                    <input id="reg-pw" type="password" placeholder="Set Secure Password" class="w-full bg-slate-50 border border-slate-200 p-3 rounded-md text-sm text-slate-900 outline-none focus:border-slate-400 font-mono transition-all">
                                    <button onclick="adminCreateAccount()" class="btn-interact shrink-0 px-6 bg-slate-900 hover:bg-slate-800 text-white rounded-md text-[10px] font-bold uppercase tracking-widest transition-colors">Enroll User</button>
                                </div>
                            </div>
                        </div>

                        <div id="user-management-panel" class="bg-white border border-slate-200 p-6 md:p-8 rounded-xl shadow-sm">
                            <h3 class="text-neutral-500 text-[10px] font-bold mb-6 uppercase tracking-widest">Identity Management</h3>
                            <div id="admin-user-list" class="grid grid-cols-1 md:grid-cols-2 gap-6 w-full"></div>
                        </div>
                    </div>
                </div>
            </div>
        </main>
    </div>

    ${scriptBlock}
</body>
</html>
`;

let resultHtml = headAndStyles + newBody;

// Also I need to add `switchTab` into the JS
let finalHtml = resultHtml.replace('function showLoading', `
        function switchTab(tabId) {
            document.querySelectorAll('.tab-content').forEach(el => el.classList.remove('active'));
            document.querySelectorAll('.nav-btn').forEach(el => el.classList.remove('active'));
            document.getElementById('tab-' + tabId).classList.add('active');
            document.getElementById('nav-' + tabId).classList.add('active');
            if (tabId === 'vault') loadVault();
        }
        function showLoading`);

// Update login flow to set sidebar-user
finalHtml = finalHtml.replace("document.getElementById('vault-screen').classList.remove('hidden')", "document.getElementById('main-app').classList.remove('hidden'); document.getElementById('sidebar-user').innerText = currentUser;");
finalHtml = finalHtml.replace("document.getElementById('vault-screen').classList.remove('opacity-0')", "document.getElementById('main-app').classList.remove('opacity-0'); ");

// Update admin section visibility
finalHtml = finalHtml.replace("document.getElementById('admin-section').classList.remove('hidden'); document.getElementById('user-management-panel').classList.remove('hidden');", "document.getElementById('nav-admin').classList.remove('hidden'); document.getElementById('nav-admin').style.display='flex';");

fs.writeFileSync('index.html', finalHtml);
console.log("Rewrote index.html");
