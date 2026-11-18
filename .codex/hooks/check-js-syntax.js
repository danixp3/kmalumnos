#!/usr/bin/env node
// Hook PostToolUse de Codex: verifica con Node la sintaxis de los .js editados por apply_patch.
// - Solo mira sintaxis (no resuelve referencias), así vale para renderer/ (scripts de navegador),
//   db/, main.js, sync.js, preload.js (CommonJS).
// - La web se verifica con sus propias pruebas. Se excluyen también las dependencias.
// - Fail-safe: ante cualquier fallo del propio hook, sale 0 y NO bloquea el trabajo.
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

let raw = '';
try { raw = fs.readFileSync(0, 'utf8'); } catch { process.exit(0); }

let data;
try { data = JSON.parse(raw); } catch { process.exit(0); }

const patch = data?.tool_input?.command;
if (data?.tool_name !== 'apply_patch' || typeof patch !== 'string') process.exit(0);

const root = path.resolve(__dirname, '..', '..');
const cwd = typeof data.cwd === 'string' ? data.cwd : root;
const files = new Set();
for (const [, file] of patch.matchAll(/^\*\*\* (?:Add File|Update File|Move to): (.+)\r?$/gm)) {
  const absolute = path.resolve(cwd, file);
  const relative = path.relative(root, absolute);
  if (path.isAbsolute(relative) || relative.startsWith('..' + path.sep)) continue;
  const folders = relative.split(path.sep);
  if (folders[0] === 'web-remote' || folders.includes('node_modules')) continue;
  if (/\.js$/i.test(relative)) files.add(absolute);
}

const errors = [];
for (const f of files) {
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
