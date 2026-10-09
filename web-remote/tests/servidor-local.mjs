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
            // Traído de otro programa (procedencia, 2026-10-08): sale con su etiqueta en las listas y la ficha
            { id: 3, nombre: 'HUGO', primer_apellido: 'CERDEIRA', permiso: 'B', vehiculo_id: 2, profesor_id: 1, deleted: false, empresa_id: e, estado: 'activo', procedencia: 'Ariauto' }],
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

// Enlace de firma del alumno (2026-10-09): las funciones de la base de datos, simuladas (la de verdad: migraciones/2026-10-09_enlaces_firma.sql)
process.env.AVISOS_SECRETO = 'local';
BD.tablas.enlaces_firma = [];
const firmableBD = p => !p.deleted && p.firma == null && (p.km_final > 0 || (p.tipo === 'pista' && !p.km_inicial));
BD.funciones.crear_enlace_firma = p => {
  const ids = BD.tablas.practicas.filter(x => x.alumno_id === p.p_alumno_id && firmableBD(x) && (p.p_practica_ids ? p.p_practica_ids.includes(x.id) : x.source === 'web-remote')).map(x => x.id);
  if (BD.tablas.enlaces_firma.some(x => x.token_hash === p.p_token_hash)) return { data: null, error: { code: '23505', message: 'duplicate key' } };
  if (!ids.length) return { data: { ok: false, codigo: 'nada_que_firmar', faltan: [] }, error: null };
  const caduca = new Date(Date.now() + (p.p_dias || 7) * 864e5).toISOString();
  BD.tablas.enlaces_firma.push({ empresa_id: e, token_hash: p.p_token_hash, alumno_id: p.p_alumno_id, practica_ids: ids, creado_por: p.p_creado_por, caduca, firmadas: [] });
  return { data: { ok: true, id: BD.tablas.enlaces_firma.length, practica_ids: ids, n: ids.length, caduca, faltan: [] }, error: null };
};
BD.funciones.firma_enlace_ver = p => {
  const en = BD.tablas.enlaces_firma.find(x => x.token_hash === p.p_token_hash);
  if (!en) return { data: { estado: 'no_existe' }, error: null };
  const a = BD.tablas.alumnos.find(x => x.id === en.alumno_id);
  const todas = BD.tablas.practicas.filter(x => x.alumno_id === en.alumno_id && !x.deleted).sort((x, y) => x.fecha.localeCompare(y.fecha) || (x.hora_inicio || '').localeCompare(y.hora_inicio || '') || x.id - y.id);
  let acum = a.clases_previas || 0;
  const n = new Map(todas.map(x => { acum += x.fraccion > 0 && x.fraccion < 1 ? x.fraccion : 1; return [x.id, Math.ceil(acum - 1e-6)]; }));
  const practicas = todas.filter(x => en.practica_ids.includes(x.id)).map(x => {
    const v = BD.tablas.vehiculos.find(q => q.id === x.vehiculo_id) || {}, pr = BD.tablas.profesores.find(q => q.id === x.profesor_id) || {};
    return { id: x.id, fecha: x.fecha, hora_inicio: x.hora_inicio, hora_fin: x.hora_fin, km_inicial: x.km_inicial, km_final: x.km_final, fraccion: x.fraccion || null, tipo: x.tipo || 'circulacion', km_auto: x.tipo_detalle === 'km_auto', zonas: x.zonas || null, trabajado: x.trabajado || null, vehiculo_id: x.vehiculo_id, vehiculo: v.nombre, matricula: v.matricula, profesor: pr.nombre, clase_n: n.get(x.id), firmada: x.firma != null, firmable: firmableBD(x) };
  });
  return { data: { estado: 'ok', alumno: { nombre: a.nombre, primer_apellido: a.primer_apellido }, centro: { nombre: 'Autoescuela de prueba S.L.', comercial: 'Autoescuela Prueba' }, creado_por: en.creado_por, caduca: en.caduca, practicas }, error: null };
};
BD.funciones.firma_enlace_firmar = p => {
  const en = BD.tablas.enlaces_firma.find(x => x.token_hash === p.p_token_hash);
  if (!en) return { data: { ok: false, codigo: 'no_existe' }, error: null };
  const firmadas = [], ya = [];
  for (const id of p.p_ids || []) {
    const x = BD.tablas.practicas.find(q => q.id === id && en.practica_ids.includes(q.id));
    if (!x) continue;
    if (firmableBD(x)) { x.firma = p.p_firma; x.updated_at = new Date().toISOString(); firmadas.push(id); } else if (x.firma) ya.push(id);
  }
  Object.assign(en, { comentario: p.p_comentario || en.comentario, no_confirmadas: p.p_no_confirmadas || [] });
  en.firmadas.push(...firmadas);
  return { data: { ok: true, firmadas, ya_firmadas: ya, no_confirmadas: p.p_no_confirmadas || [] }, error: null };
};

const MOVIL = ['hoy', 'iniciar-practica', 'finalizar-practica', 'firmar-practica', 'cancelar-practica', 'config', 'calendario', 'practica-detalle', 'anotar-practica', 'registrar-clase', 'firma-profesor', 'coche-profesor', 'km-coche', 'estado-practica', 'corregir-clases', 'avisos', 'enlace-firma', 'firma-alumno'];
const TIPOS = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.json': 'application/json', '.woff2': 'font/woff2', '.png': 'image/png', '.webmanifest': 'application/manifest+json' };
let desconectado = false;   // simula «sin cobertura» desde el servidor: corta /api con 503

http.createServer(async (req, res0) => {
  const url = new URL(req.url, 'http://x');
  if (url.pathname === '/__estado') { res0.setHeader('content-type', 'application/json'); return res0.end(JSON.stringify({ practicas: BD.tablas.practicas, vehiculos: BD.tablas.vehiculos, enlaces_firma: BD.tablas.enlaces_firma })); }
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
      await mod.default({ method: req.method, headers: { authorization: req.headers.authorization || '', 'user-agent': req.headers['user-agent'] || '' }, body: body ? JSON.parse(body) : undefined, query }, res);
    } catch (err) { status = 500; json = { error: String(err && err.message || err) }; }
    res0.statusCode = status; res0.setHeader('content-type', 'application/json'); return res0.end(JSON.stringify(json || {}));
  }
  // Página del alumno para firmar (en Vercel: rewrite /f/:codigo → /firmar.html)
  let f = url.pathname === '/' ? '/index.html' : /^\/f\/[^/]+\/?$/.test(url.pathname) ? '/firmar.html' : url.pathname;
  const ruta = path.join(path.resolve(RAIZ), f);
  if (!ruta.startsWith(path.resolve(RAIZ)) || !fs.existsSync(ruta) || fs.statSync(ruta).isDirectory()) { res0.statusCode = 404; return res0.end('no'); }
  res0.setHeader('content-type', TIPOS[path.extname(ruta)] || 'application/octet-stream');
  res0.setHeader('cache-control', 'no-store');
  res0.end(fs.readFileSync(ruta));
}).listen(8123, () => console.log('listo http://localhost:8123'));
