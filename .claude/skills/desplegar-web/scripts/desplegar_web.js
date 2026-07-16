// Despliega web-remote a producción en Vercel vía API (equivalente a `vercel --prod`).
// Uso: node desplegar_web.js [--dry-run]
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..', '..', '..', '..'); // raíz del repo
const WEB = path.join(ROOT, 'web-remote');
const DRY = process.argv.includes('--dry-run');

// Token del MCP de Vercel y datos del proyecto (ambos git-ignored, nunca imprimirlos)
const auth = JSON.parse(fs.readFileSync(path.join(ROOT, '.mcp.json'), 'utf-8'))
  .mcpServers.vercel.headers.Authorization;
const proj = JSON.parse(fs.readFileSync(path.join(WEB, '.vercel', 'project.json'), 'utf-8'));

// Archivos a subir: los trackeados por git en web-remote (sin .gitignore)
const fileList = execSync('git ls-files', { cwd: WEB, encoding: 'utf-8' })
  .split('\n').map(s => s.trim()).filter(f => f && f !== '.gitignore');

async function main() {
  console.log(`proyecto: ${proj.projectName} | archivos: ${fileList.length}`);
  if (DRY) { fileList.forEach(f => console.log('  ' + f)); return; }

  const files = fileList.map(f => ({
    file: f,
    data: fs.readFileSync(path.join(WEB, f)).toString('base64'),
    encoding: 'base64'
  }));

  const res = await fetch(`https://api.vercel.com/v13/deployments?teamId=${proj.orgId}`, {
    method: 'POST',
    headers: { Authorization: auth, 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: proj.projectName, project: proj.projectName, target: 'production', files })
  });
  const dep = await res.json();
  if (!res.ok) { console.error('ERROR al crear deployment:', JSON.stringify(dep)); process.exit(1); }
  console.log('deployment creado:', dep.id);

  for (let i = 0; i < 48; i++) { // máx ~4 min
    await new Promise(r => setTimeout(r, 5000));
    const st = await fetch(`https://api.vercel.com/v13/deployments/${dep.id}?teamId=${proj.orgId}`, {
      headers: { Authorization: auth }
    }).then(r => r.json());
    console.log('estado:', st.readyState);
    if (st.readyState === 'READY') { console.log('DEPLOY-OK', st.url); return; }
    if (st.readyState === 'ERROR' || st.readyState === 'CANCELED') {
      console.error('DEPLOY-FALLIDO — revisar logs del build en Vercel'); process.exit(1);
    }
  }
  console.error('TIMEOUT esperando el deploy'); process.exit(1);
}

main().catch(e => { console.error(e); process.exit(1); });
