const fs = require('fs');

let html = fs.readFileSync('index.html', 'utf8');

// CSS updates
html = html.replace(
  '::-webkit-scrollbar-track { background: #0a0a0a; }',
  '::-webkit-scrollbar-track { background: #f8fafc; }'
);
html = html.replace(
  '::-webkit-scrollbar-thumb { background: #262626; border-radius: 10px; }',
  '::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 10px; }'
);
html = html.replace(
  '.cat-btn-inactive { @apply border-white/10 bg-white/5 text-gray-500 hover:text-white hover:border-white/40; }',
  '.cat-btn-inactive { @apply border-transparent bg-transparent text-slate-500 hover:bg-slate-100 hover:text-slate-900; }'
);
html = html.replace(
  '.cat-btn-active { @apply border-blue-500 bg-blue-500/10 text-blue-500 shadow-[0_0_15px_rgba(59,130,246,0.2)]; }',
  '.cat-btn-active { @apply border-slate-200 bg-white text-slate-900 shadow-sm shadow-slate-200; }'
);
html = html.replace(
  'background: rgba(0,0,0,0.8);',
  'background: rgba(15, 23, 42, 0.4);'
);


// Global text color
html = html.replace('text-gray-200', 'text-slate-900');
// Global bg color
html = html.replace('bg-[#0a0a0a]', 'bg-slate-50');
html = html.replace('bg-black/60', 'bg-slate-900/50');
html = html.replace('text-white', 'text-slate-900');

// Modal border and bg (which is bg-[#171717] border border-[#262626])
// But we need to use a function to safely replace all classes
function multiReplace(str, replacements) {
    let result = str;
    for (let r of replacements) {
        result = result.split(r[0]).join(r[1]);
    }
    return result;
}

html = multiReplace(html, [
    ['bg-[#171717]', 'bg-white'],
    ['border-[#262626]', 'border-slate-200'],
    ['text-white', 'text-slate-900'],
    ['text-gray-200', 'text-slate-900'],
    ['text-gray-400', 'text-slate-500'],
    ['text-gray-500', 'text-slate-500'],
    ['text-gray-600', 'text-slate-400'],
    ['bg-[#0a0a0a]', 'bg-slate-50'],
    ['border-white/5', 'border-slate-100'],
    ['border-white/10', 'border-slate-200'],
    ['bg-black/40', 'bg-slate-50'],
    ['text-blue-500', 'text-slate-900'],
    ['bg-[#262626]', 'bg-slate-200 text-slate-700 hover:bg-slate-300'],
    ['bg-gray-800', 'bg-slate-100 text-slate-600'],
    ['hover:bg-gray-700', 'hover:bg-slate-200'],
    ['hover:text-white', 'hover:text-slate-900'],
    ['bg-blue-900/40', 'bg-indigo-50'],
    ['text-blue-400', 'text-slate-700'],
    ['bg-blue-600', 'bg-slate-900 text-white'],
    ['hover:bg-blue-500', 'hover:bg-slate-800 text-white'],
    ['shadow-blue-600/10', 'shadow-slate-300'],
    ['shadow-[0_0_15px_rgba(59,130,246,0.2)]', 'shadow-sm'],
    ['border-blue-400', 'border-slate-200'],
    ['border-blue-500', 'border-slate-300'],
    ['bg-red-950/20', 'bg-red-50'],
    ['border-red-900/30', 'border-red-200'],
    ['border-red-900/40', 'border-red-200'],
    ['text-red-500', 'text-red-600'],
    ['hover:bg-red-600', 'hover:bg-red-600 hover:text-white'],
    ['bg-red-600', 'bg-red-600 text-white'],
    ['border-red-400', 'border-red-200'],
    // specific focus states and hovers
    ['focus:border-blue-500', 'focus:border-slate-400 focus:ring-1 focus:ring-slate-300'],
    ['focus:text-blue-400', 'focus:text-slate-500'],
    ['group-hover:text-blue-400', 'group-hover:text-slate-700'],
    ['group-hover:bg-blue-600', 'group-hover:bg-slate-900 group-hover:text-white'],
    ['bg-black', 'bg-slate-100'],
    ['hover:border-blue-500/50', 'hover:border-slate-300 hover:bg-white'],
    ['bg-blue-500/10', 'bg-slate-100'],
    ['border-red-500/30', 'border-red-200'],
    ['bg-red-950/30', 'bg-red-100'],
    // clean up large roundings
    ['rounded-[2.5rem]', 'rounded-xl'],
    ['rounded-[2rem]', 'rounded-xl'],
    // some texts should just be white because the buttons are slate-900
    ['bg-slate-900 text-white font-black', 'bg-slate-900 text-white font-bold'],
    ['text-white text-white', 'text-white']
]);

// Let's refine the toast to look good
html = html.replace("bg-slate-900 text-white border-slate-200 text-slate-900 px-8 py-4 rounded-xl shadow-2xl font-black uppercase tracking-widest border pointer-events-auto mb-2 text-xs text-center", "bg-white border-slate-200 text-slate-900 px-8 py-4 rounded-xl shadow-xl font-bold uppercase tracking-widest border pointer-events-auto mb-2 text-xs text-center");

// For active entry badge
html = html.replace('text-slate-900 bg-slate-100 px-3 py-1', 'text-slate-700 bg-slate-100 px-3 py-1 font-bold border border-slate-200');

// Fix toast logic in JS
// Actually let's just make it simpler
html = html.replace("bg-slate-900 text-white border-slate-800", "bg-white text-slate-900 border-slate-200");
html = html.replace("bg-red-600 text-white border-red-200", "bg-white text-red-600 border-red-200");

// Fix some weird "bg-slate-200 text-slate-700 hover:bg-slate-300" that might have gotten duplicated text colors
html = html.replace(/text-slate-900 text-slate-700/g, 'text-slate-700')
           .replace(/text-slate-900 font-black/g, 'text-slate-900 font-bold')
           .replace(/font-black/g, 'font-bold');

fs.writeFileSync('index.html', html);
console.log("Updated index.html");
