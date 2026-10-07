// Servidor de pruebas LOCAL de la web móvil: sirve web-remote/ y ejecuta los endpoints REALES contra el Supabase falso en memoria.
// node --import ./web-remote/tests/register.mjs web-remote/tests/servidor-local.mjs   → http://localhost:8123
// Sesión simulada: localStorage.km_sesion = {access_token:'x.<base64url {"sub":"emp1"}>.y', refresh_token:'r', expires_at:<futuro>, user:{id:'emp1'}} y kmalumnos_profesor:emp1 = {id:1,nombre:'...'}.
// /__corte?v=1 devuelve 503 en /api (simula no tener cobertura; v=0 la devuelve), /__estado vuelca la BD simulada.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { reiniciar, BD } = await import(pathToFileURL(RAIZ + '/tests/fake-supabase.mjs').href);
process.env.SUPABASE_URL = 'http://fake'; process.env.SUPABASE_ANON_KEY = 'fake';

const hoy = () => { const n = new Date(); return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}-${String(n.getDate()).padStart(2, '0')}`; };
const haceDias = k => { const n = new Date(); n.setDate(n.getDate() - k); return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}-${String(n.getDate()).padStart(2, '0')}`; };
const e = 'emp1';
reiniciar({
  vehiculos: [{ id: 1, nombre: 'TAIGO', matricula: '6664NNM', km_actual: 17839, deleted: false, empresa_id: e, activo: true },
              { id: 2, nombre: 'KIA AZUL', matricula: '6643LSC', km_actual: 295250, deleted: false, empresa_id: e, activo: true }],
  alumnos: [{ id: 1, nombre: 'NICOLAS', primer_apellido: 'PEREZ', permiso: 'B', vehiculo_id: 1, profesor_id: 1, deleted: false, empresa_id: e, estado: 'activo', clases_previas: 16 },
            { id: 2, nombre: 'MARICELY', primer_apellido: 'AMIGO', permiso: 'B', vehiculo_id: 1, profesor_id: 1, deleted: false, empresa_id: e, estado: 'activo', clases_previas: 15 },
            { id: 3, nombre: 'HUGO', primer_apellido: 'CERDEIRA', permiso: 'B', vehiculo_id: 2, profesor_id: 1, deleted: false, empresa_id: e, estado: 'activo' }],
  profesores: [{ id: 1, nombre: 'JAVIER PÉREZ ALONSO', vehiculo_id: 1, deleted: false, empresa_id: e },
               { id: 2, nombre: 'MARTA GIL', vehiculo_id: 2, deleted: false, empresa_id: e }],
  practicas: [{ id: 1, alumno_id: 1, vehiculo_id: 1, fecha: hoy(), hora_inicio: '08:43', hora_fin: '09:08', km_inicial: 17793, km_final: 17816, tipo: 'circulacion', profesor_id: 1, deleted: false, empresa_id: e, source: 'web-remote', tipo_detalle: 'km_auto' },
              { id: 2, alumno_id: 1, vehiculo_id: 1, fecha: hoy(), hora_inicio: '09:08', hora_fin: '09:33', km_inicial: 17816, km_final: 17839, tipo: 'circulacion', profesor_id: 1, deleted: false, empresa_id: e, source: 'web-remote', tipo_detalle: 'km_auto' },
              // Clase de MARTA en curso, empezada en SU tablet (para probar que otro teléfono no la adopta)
              { id: 3, alumno_id: 3, vehiculo_id: 2, fecha: hoy(), hora_inicio: '09:30', km_inicial: 295250, km_final: 0, tipo: 'circulacion', profesor_id: 2, deleted: false, empresa_id: e, source: 'web-remote' },
              // Clases de días anteriores del TAIGO (para «Anotar clase pasada»); la de hace 3 días es del móvil y sin firma → sale en «Firmas pendientes»
              { id: 4, alumno_id: 2, vehiculo_id: 1, fecha: haceDias(3), hora_inicio: '17:00', hora_fin: '17:45', km_inicial: 17700, km_final: 17722, tipo: 'circulacion', profesor_id: 1, deleted: false, empresa_id: e, source: 'web-remote' },
              { id: 5, alumno_id: 2, vehiculo_id: 1, fecha: haceDias(1), hora_inicio: '12:00', hora_fin: '12:45', km_inicial: 17770, km_final: 17793, tipo: 'circulacion', profesor_id: 1, deleted: false, empresa_id: e, source: 'desktop' }],
  reservas: [], ajustes_empresa: [{ empresa_id: e, clave: 'duracion_clase_min', valor: 45 }]
});

const MOVIL = ['hoy', 'iniciar-practica', 'finalizar-practica', 'firmar-practica', 'cancelar-practica', 'config', 'calendario', 'practica-detalle', 'anotar-practica', 'registrar-clase', 'firma-profesor', 'coche-profesor', 'km-coche', 'estado-practica', 'corregir-clases', 'avisos'];
const TIPOS = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.json': 'application/json', '.woff2': 'font/woff2', '.png': 'image/png', '.webmanifest': 'application/manifest+json' };
let desconectado = false;   // simula «sin cobertura» desde el servidor: corta /api con 503

http.createServer(async (req, res0) => {
  const url = new URL(req.url, 'http://x');
  if (url.pathname === '/__estado') { res0.setHeader('content-type', 'application/json'); return res0.end(JSON.stringify({ practicas: BD.tablas.practicas, vehiculos: BD.tablas.vehiculos })); }
  if (url.pathname === '/__corte') { desconectado = url.searchParams.get('v') === '1'; return res0.end('ok ' + desconectado); }
  if (url.pathname.startsWith('/api/')) {
    if (desconectado) { res0.statusCode = 503; return res0.end('{"error":"corte"}'); }
    const nombre = url.pathname.slice(5);
    let body = '';
    for await (const c of req) body += c;
    let status = 200, json;
    const res = { setHeader() {}, status(s) { status = s; return this; }, json(o) { json = o; return this; }, end() { return this; } };
    try {
      const mod = await import(pathToFileURL(RAIZ + (MOVIL.includes(nombre) ? `/lib/movil/${nombre}.js` : `/api/${nombre}.js`)).href);
      const query = Object.fromEntries(url.searchParams);
      await mod.default({ method: req.method, headers: { authorization: req.headers.authorization || '' }, body: body ? JSON.parse(body) : undefined, query }, res);
    } catch (err) { status = 500; json = { error: String(err && err.message || err) }; }
    res0.statusCode = status; res0.setHeader('content-type', 'application/json'); return res0.end(JSON.stringify(json || {}));
  }
  let f = url.pathname === '/' ? '/index.html' : url.pathname;
  const ruta = path.join(path.resolve(RAIZ), f);
  if (!ruta.startsWith(path.resolve(RAIZ)) || !fs.existsSync(ruta) || fs.statSync(ruta).isDirectory()) { res0.statusCode = 404; return res0.end('no'); }
  res0.setHeader('content-type', TIPOS[path.extname(ruta)] || 'application/octet-stream');
  res0.setHeader('cache-control', 'no-store');
  res0.end(fs.readFileSync(ruta));
}).listen(8123, () => console.log('listo http://localhost:8123'));
