// Build-time hardening: minify the page's inline JavaScript so the shipped game is small and hard to read, with NO
// runtime cost (it runs once at build; the result loads faster, not slower). It strips every comment and all
// whitespace and renames local variables, but keeps top-level names and object/property names unchanged — the game is
// one shared scope across script tags, the sound worker rebuilds itself from f15js's text and from
// render*.toString(), and the native apps call window.__thermal/__back/__store/__audioSleep/__audioWake by name, so
// renaming top-level names would break it. This is ordinary minification (what Google and Apple both recommend); it
// hides nothing from the stores' own review.
//   node tools/minjs.cjs <file.html> [more.html ...]
const fs = require('fs'), path = require('path');
const { minify } = require(path.join(__dirname, '..', 'node_modules', 'terser'));

const OPTS = {
  // keep_fnames: terser otherwise drops some function names when it inlines, so any name-based lookup (fn.name) would
  // break; keeping them costs a little size but nothing at runtime, and the local-variable mangling still applies.
  compress: { toplevel: false, passes: 2, keep_fnames: true },
  mangle: { toplevel: false, keep_fnames: true },
  format: { comments: false, ascii_only: false },
};

async function doFile(file) {
  let html = fs.readFileSync(file, 'utf8');
  const before = Buffer.byteLength(html);
  const blocks = [];
  // every inline <script> (one without a src attribute); three.js is a src tag and is left alone
  const re = /<script\b([^>]*)>([\s\S]*?)<\/script>/g;
  let m;
  while ((m = re.exec(html))) { if (!/\bsrc\s*=/.test(m[1])) blocks.push({ open: m[0].slice(0, m[0].indexOf('>') + 1), attrs: m[1], body: m[2], whole: m[0] }); }
  for (const b of blocks) {
    if (!b.body.trim()) continue;
    const out = await minify(b.body, OPTS);
    if (out.error) throw out.error;
    html = html.replace(b.whole, b.open + out.code + '</script>');
  }
  fs.writeFileSync(file, html);
  const after = Buffer.byteLength(html);
  console.log(`minjs ${path.basename(file)}: ${(before / 1024).toFixed(0)} -> ${(after / 1024).toFixed(0)} KB`);
}

(async () => {
  for (const f of process.argv.slice(2)) await doFile(f);
})().catch(e => { console.error('minjs failed:', e.message); process.exit(1); });
