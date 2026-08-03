#!/usr/bin/env node
// Hook PostToolUse (Write|Edit): verifica la SINTAXIS de los .js editados con `node --check`.
// - Solo mira sintaxis (no resuelve referencias), así vale para renderer/ (scripts de navegador),
//   db/, main.js, sync.js, preload.js (CommonJS).
// - Excluye web-remote/ (son ES modules → import/export darían falso positivo) y node_modules.
// - Fail-safe: ante cualquier fallo del propio hook, sale 0 y NO bloquea el trabajo.
const { execFileSync } = require('child_process');
const fs = require('fs');

let raw = '';
try { raw = fs.readFileSync(0, 'utf8'); } catch { process.exit(0); }

let data;
try { data = JSON.parse(raw); } catch { process.exit(0); }

const input = data.tool_input || {};
const paths = [];
if (typeof input.file_path === 'string') paths.push(input.file_path);

const jsFiles = paths.filter(
  (p) => /\.js$/i.test(p) && !/web-remote/.test(p) && !/node_modules/.test(p)
);
if (jsFiles.length === 0) process.exit(0);

const errors = [];
for (const f of jsFiles) {
  if (!fs.existsSync(f)) continue;
  try {
    execFileSync(process.execPath, ['--check', f], { stdio: ['ignore', 'ignore', 'pipe'] });
  } catch (e) {
    const msg = (e.stderr ? e.stderr.toString() : e.message).trim();
    errors.push(`${f}:\n${msg}`);
  }
}

if (errors.length) {
  process.stderr.write(
    'Error de sintaxis JS detectado (node --check) — corrígelo antes de seguir:\n' +
      errors.join('\n\n') +
      '\n'
  );
  process.exit(2);
}
process.exit(0);
