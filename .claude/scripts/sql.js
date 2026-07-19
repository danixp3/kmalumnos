#!/usr/bin/env node
'use strict';

// Ejecuta SQL contra el proyecto de Supabase de KMAlumnos usando la Management
// API (https://api.supabase.com), sin pasar por el MCP de Supabase.
//
// Lee el token y el project-ref desde .mcp.json (raíz del repo). No requiere
// dependencias externas (usa fetch global de Node >= 18).
//
// Uso:
//   node .claude/scripts/sql.js "select 1 as ok"
//   node .claude/scripts/sql.js --file consulta.sql
//   echo "select count(*) from alumnos" | node .claude/scripts/sql.js
//   node .claude/scripts/sql.js --json "select * from vehiculos limit 5"

const fs = require('fs');
const path = require('path');

function fail(msg) {
  console.error(msg);
  process.exit(1);
}

function loadConfig() {
  const mcpPath = path.join(__dirname, '..', '..', '.mcp.json');

  let raw;
  try {
    raw = fs.readFileSync(mcpPath, 'utf8');
  } catch (e) {
    fail(`No se pudo leer .mcp.json en "${mcpPath}". Comprueba que el archivo existe.`);
    return;
  }

  let data;
  try {
    data = JSON.parse(raw);
  } catch (e) {
    fail(`.mcp.json no contiene JSON válido: ${e.message}`);
    return;
  }

  const supabase = data && data.mcpServers && data.mcpServers.supabase;
  if (!supabase) {
    fail('No se encontró "mcpServers.supabase" en .mcp.json.');
    return;
  }

  const token = supabase.env && supabase.env.SUPABASE_ACCESS_TOKEN;
  if (!token) {
    fail('No se encontró "SUPABASE_ACCESS_TOKEN" en mcpServers.supabase.env de .mcp.json.');
    return;
  }

  const args = Array.isArray(supabase.args) ? supabase.args : [];
  let ref = null;
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (typeof a === 'string' && a.startsWith('--project-ref=')) {
      ref = a.slice('--project-ref='.length);
      break;
    }
    if (a === '--project-ref' && args[i + 1]) {
      ref = args[i + 1];
      break;
    }
  }
  if (!ref) {
    fail('No se encontró "--project-ref" en mcpServers.supabase.args de .mcp.json.');
    return;
  }

  return { token, ref };
}

function parseArgs(argv) {
  let file = null;
  let json = false;
  const positional = [];

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--json') {
      json = true;
    } else if (a === '--file') {
      file = argv[++i];
    } else {
      positional.push(a);
    }
  }

  return { sql: positional.length > 0 ? positional.join(' ') : null, file, json };
}

function readStdin() {
  return new Promise((resolve, reject) => {
    if (process.stdin.isTTY) {
      resolve('');
      return;
    }
    let data = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (chunk) => {
      data += chunk;
    });
    process.stdin.on('end', () => resolve(data));
    process.stdin.on('error', reject);
  });
}

function formatTable(rows) {
  if (!Array.isArray(rows) || rows.length === 0) {
    return '(sin filas)';
  }

  const headers = Object.keys(rows[0]);
  const cellStr = (v) => (v === null || v === undefined ? '—' : String(v));
  const widths = headers.map((h) => Math.max(h.length, ...rows.map((r) => cellStr(r[h]).length)));

  const line = (cells) => cells.map((c, i) => c.padEnd(widths[i])).join('  ');

  const out = [line(headers), line(widths.map((w) => '-'.repeat(w)))];
  for (const r of rows) {
    out.push(line(headers.map((h) => cellStr(r[h]))));
  }
  return out.join('\n');
}

async function main() {
  const config = loadConfig();
  const { token, ref } = config;

  const { sql: sqlArg, file, json } = parseArgs(process.argv.slice(2));

  let sql = sqlArg;

  if (!sql && file) {
    try {
      sql = fs.readFileSync(file, 'utf8');
    } catch (e) {
      fail(`No se pudo leer el archivo SQL "${file}": ${e.message}`);
      return;
    }
  }

  if (!sql) {
    sql = await readStdin();
  }

  if (!sql || !sql.trim()) {
    fail(
      'No se ha proporcionado SQL. Pásalo como argumento, con --file <ruta> o por stdin.\n' +
        'Ejemplo: node .claude/scripts/sql.js "select 1 as ok"'
    );
    return;
  }

  let res;
  try {
    res = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ query: sql }),
    });
  } catch (e) {
    fail(`Error de red al llamar a la Management API de Supabase: ${e.message}`);
    return;
  }

  const text = await res.text();
  let body;
  try {
    body = text ? JSON.parse(text) : null;
  } catch (e) {
    body = text;
  }

  if (!res.ok) {
    console.error(`Error HTTP ${res.status} ${res.statusText}`);
    console.error(typeof body === 'string' ? body : JSON.stringify(body, null, 2));
    process.exit(1);
    return;
  }

  if (json) {
    console.log(JSON.stringify(body, null, 2));
    return;
  }

  if (Array.isArray(body)) {
    console.log(formatTable(body));
  } else {
    console.log(JSON.stringify(body, null, 2));
  }
}

main().catch((e) => {
  fail(`Error inesperado: ${e && e.message ? e.message : e}`);
});
