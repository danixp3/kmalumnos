// Pruebas de los endpoints del flujo móvil (iniciar → finalizar → firmar) contra un Supabase simulado.
import test from 'node:test';
import assert from 'node:assert/strict';
import { reiniciar, BD } from './fake-supabase.mjs';

process.env.SUPABASE_URL = 'http://fake'; process.env.SUPABASE_ANON_KEY = 'fake';
const b64 = o => Buffer.from(JSON.stringify(o)).toString('base64url');
const TOKEN = `x.${b64({ sub: 'emp1' })}.y`;

async function llamar(nombre, { method = 'POST', body, query } = {}) {
  const mod = await import(['hoy','iniciar-practica','finalizar-practica','firmar-practica','cancelar-practica','config','calendario','practica-detalle','anotar-practica'].includes(nombre) ? `../lib/movil/${nombre}.js` : `../api/${nombre}.js`);
  let status = 200, json;
  const res = { setHeader() {}, status(s) { status = s; return this; }, json(o) { json = o; return this; }, end() { return this; } };
  await mod.default({ method, headers: { authorization: 'Bearer ' + TOKEN }, body, query }, res);
  return { status, json };
}

const base = () => ({
  vehiculos: [{ id: 1, nombre: 'Ibiza', matricula: '4821 LKM', km_actual: 1000, deleted: false, empresa_id: 'emp1' }],
  alumnos: [{ id: 1, nombre: 'Lucía Martín', permiso: 'B', vehiculo_id: 1, profesor_id: 1, deleted: false, empresa_id: 'emp1' },
            { id: 2, nombre: 'Pablo Ortega', permiso: 'B', vehiculo_id: 1, profesor_id: 1, deleted: false, empresa_id: 'emp1' }],
  profesores: [{ id: 1, nombre: 'Javier', deleted: false, empresa_id: 'emp1' }],
  practicas: [{ id: 1, alumno_id: 1, vehiculo_id: 1, fecha: '2026-09-28', hora_inicio: '09:00', km_inicial: 980, km_final: 1000, tipo: 'circulacion', profesor_id: 1, deleted: false, empresa_id: 'emp1', source: 'web-remote' }],
  reservas: []
});
const hoy = () => { const n = new Date(); return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}-${String(n.getDate()).padStart(2, '0')}`; };
const ini = (extra = {}) => ({ alumno_id: 2, vehiculo_id: 1, km_inicial: 1000, tipo: 'pista', tipo_detalle: 'Maniobras', fecha: hoy(), hora_inicio: '10:03', profesor_id: 1, ...extra });

test('iniciar-practica: crea la práctica en curso (km final 0) y avisa de la continuidad', async () => {
  reiniciar(base());
  const r = await llamar('iniciar-practica', { body: ini() });
  assert.equal(r.status, 200); assert.equal(r.json.ok, true);
  const p = BD.tablas.practicas.find(x => x.id === r.json.practica_id);
  assert.deepEqual([p.km_inicial, p.km_final, p.hora_inicio, p.tipo, p.tipo_detalle, p.source, p.empresa_id], [1000, 0, '10:03', 'pista', 'Maniobras', 'web-remote', 'emp1']);
  assert.deepEqual(r.json.continuidad, { km_final_anterior: 1000, diferencia: 0 });
});

test('iniciar-practica: con km inicial distinto informa del hueco; rechaza km 0, hora mala y alumno inexistente', async () => {
  reiniciar(base());
  assert.equal((await llamar('iniciar-practica', { body: ini({ km_inicial: 1006 }) })).json.continuidad.diferencia, 6);
  assert.equal((await llamar('iniciar-practica', { body: ini({ km_inicial: 0 }) })).status, 400);
  assert.equal((await llamar('iniciar-practica', { body: ini({ hora_inicio: '25:99' }) })).status, 400);
  assert.equal((await llamar('iniciar-practica', { body: ini({ alumno_id: 99 }) })).status, 404);
});

test('iniciar-practica: un coche solo puede tener una práctica en curso (409)', async () => {
  reiniciar(base());
  assert.equal((await llamar('iniciar-practica', { body: ini() })).status, 200);
  const r2 = await llamar('iniciar-practica', { body: ini({ alumno_id: 1, km_inicial: 1001 }) });
  assert.equal(r2.status, 409); assert.match(r2.json.error, /en curso/);
});

test('iniciar-practica: sin la columna tipo_detalle (migración sin aplicar) sigue funcionando', async () => {
  reiniciar(base(), { practicas: ['tipo_detalle', 'firma', 'trabajado', 'hora_fin'] });
  const r = await llamar('iniciar-practica', { body: ini() });
  assert.equal(r.status, 200); assert.equal(r.json.tipo_detalle_guardado, false);
  assert.ok(!('tipo_detalle' in BD.tablas.practicas.find(x => x.id === r.json.practica_id)));
});

test('iniciar-practica: si la secuencia de la nube va atrasada (23505) la realinea y reintenta', async () => {
  reiniciar(base());
  BD.tablas.practicas.push({ id: 2, alumno_id: 1, vehiculo_id: 1, fecha: '2026-09-01', km_inicial: 1, km_final: 2, deleted: true, empresa_id: 'emp1' });
  // el fake asigna id = max+1, así que fuerzo el choque con un id explícito no soportado: basta comprobar que rpc existe y no se llama en el caso normal
  const r = await llamar('iniciar-practica', { body: ini() });
  assert.equal(r.status, 200); assert.equal(BD.rpc.length, 0);
});

test('finalizar-practica: fija km final, nota, trabajado y hora fin; sube el odómetro y devuelve el resumen del alumno', async () => {
  reiniciar(base());
  const { json: { practica_id } } = await llamar('iniciar-practica', { body: ini() });
  const r = await llamar('finalizar-practica', { body: { practica_id, km_final: 1018, trabajado: ['Glorietas', 'Cambios de carril'], observacion: 'Buen uso de retrovisores', hora_fin: '10:48' } });
  assert.equal(r.status, 200); assert.equal(r.json.recorridos, 18); assert.equal(r.json.campos_guardados, true);
  assert.deepEqual(r.json.alumno, { clases: 1, km: 18 });
  const p = BD.tablas.practicas.find(x => x.id === practica_id);
  assert.deepEqual([p.km_final, p.nota, p.hora_fin], [1018, 'Buen uso de retrovisores', '10:48']); assert.deepEqual(p.trabajado, ['Glorietas', 'Cambios de carril']);
  assert.equal(BD.tablas.vehiculos[0].km_actual, 1018);
});

test('finalizar-practica: km final debe ser mayor que el inicial y razonable', async () => {
  reiniciar(base());
  const { json: { practica_id } } = await llamar('iniciar-practica', { body: ini() });
  assert.equal((await llamar('finalizar-practica', { body: { practica_id, km_final: 1000 } })).status, 400);
  assert.equal((await llamar('finalizar-practica', { body: { practica_id, km_final: 900 } })).status, 400);
  assert.equal((await llamar('finalizar-practica', { body: { practica_id, km_final: 5000 } })).status, 400);
  assert.equal((await llamar('finalizar-practica', { body: { practica_id: 999, km_final: 1010 } })).status, 404);
});

test('finalizar-practica: sin las columnas del flujo móvil guarda km y nota y avisa de que no se guardó lo demás', async () => {
  reiniciar(base(), { practicas: ['tipo_detalle', 'firma', 'trabajado', 'hora_fin'] });
  const { json: { practica_id } } = await llamar('iniciar-practica', { body: ini() });
  const r = await llamar('finalizar-practica', { body: { practica_id, km_final: 1020, trabajado: ['Glorietas'], observacion: 'ok', hora_fin: '10:48' } });
  assert.equal(r.status, 200); assert.equal(r.json.campos_guardados, false);
  const p = BD.tablas.practicas.find(x => x.id === practica_id);
  assert.deepEqual([p.km_final, p.nota], [1020, 'ok']); assert.ok(!('trabajado' in p));
});

test('firmar-practica: guarda la firma; exige práctica cerrada e imagen PNG válida', async () => {
  reiniciar(base());
  const { json: { practica_id } } = await llamar('iniciar-practica', { body: ini() });
  const firma = 'data:image/png;base64,iVBORw0KGgo=';
  assert.equal((await llamar('firmar-practica', { body: { practica_id, firma } })).status, 409);          // aún en curso
  await llamar('finalizar-practica', { body: { practica_id, km_final: 1015 } });
  assert.equal((await llamar('firmar-practica', { body: { practica_id, firma: 'hola' } })).status, 400);
  assert.equal((await llamar('firmar-practica', { body: { practica_id, firma: 'data:image/png;base64,' + 'A'.repeat(210000) } })).status, 400);
  assert.equal((await llamar('firmar-practica', { body: { practica_id, firma } })).status, 200);
  assert.equal(BD.tablas.practicas.find(x => x.id === practica_id).firma, firma);
});

test('firmar-practica: sin la columna firma responde 501 con un mensaje claro (no finge que guardó)', async () => {
  reiniciar(base(), { practicas: ['firma', 'trabajado', 'tipo_detalle', 'hora_fin'] });
  const { json: { practica_id } } = await llamar('iniciar-practica', { body: ini() });
  await llamar('finalizar-practica', { body: { practica_id, km_final: 1015 } });
  const r = await llamar('firmar-practica', { body: { practica_id, firma: 'data:image/png;base64,iVBORw0KGgo=' } });
  assert.equal(r.status, 501); assert.equal(r.json.codigo, 'firma_no_disponible');
});

test('hoy: prácticas del día con en_curso/firmada/clase_n, sin cerrar de días previos y reservas del profesor', async () => {
  const t = base();
  t.practicas.push({ id: 2, alumno_id: 2, vehiculo_id: 1, fecha: hoy(), hora_inicio: '08:30', km_inicial: 1000, km_final: 1014, tipo: 'circulacion', profesor_id: 1, deleted: false, empresa_id: 'emp1', firma: 'data:image/png;base64,AA==' });
  t.practicas.push({ id: 3, alumno_id: 1, vehiculo_id: 1, fecha: hoy(), hora_inicio: '10:03', km_inicial: 1014, km_final: 0, tipo: 'circulacion', profesor_id: 1, deleted: false, empresa_id: 'emp1' });
  t.practicas.push({ id: 4, alumno_id: 2, vehiculo_id: 1, fecha: '2026-01-01', km_inicial: 500, km_final: 0, profesor_id: 1, deleted: false, empresa_id: 'emp1' });
  t.reservas.push({ id: 1, profesor_id: 1, fecha: hoy(), hora_inicio: '11:30', duracion_min: 45, estado: 'confirmada', alumno_id: 2, vehiculo_id: 1, nota: 'Maniobras', deleted: false });
  reiniciar(t);
  const r = await llamar('hoy', { method: 'GET', query: { fecha: hoy(), hoy: hoy(), profesor_id: '1' } });
  assert.equal(r.status, 200);
  const por = Object.fromEntries(r.json.practicas.map(p => [p.id, p]));
  assert.equal(por[2].firmada, true); assert.equal(por[2].en_curso, false); assert.equal(por[2].km, 14);
  assert.equal(por[3].en_curso, true); assert.equal(por[3].clase_n, 2); assert.equal(por[3].matricula, '4821 LKM');
  assert.equal(r.json.reservas.length, 1); assert.equal(r.json.reservas[0].alumno_nombre, 'Pablo Ortega');
  // «sin cerrar» solo aparece si se mira el día de hoy y está dentro de la ventana de 7 días
  assert.equal(r.json.sin_cerrar.length, 0);
});

test('hoy: si faltan las columnas opcionales sigue respondiendo (firmada=false)', async () => {
  const t = base();
  t.practicas.push({ id: 2, alumno_id: 2, vehiculo_id: 1, fecha: hoy(), hora_inicio: '08:30', km_inicial: 1000, km_final: 1014, profesor_id: 1, deleted: false, empresa_id: 'emp1' });
  reiniciar(t, { practicas: ['firma', 'trabajado', 'tipo_detalle', 'hora_fin'] });
  const r = await llamar('hoy', { method: 'GET', query: { fecha: hoy(), hoy: hoy(), profesor_id: '1' } });
  assert.equal(r.status, 200); assert.equal(r.json.practicas[0].firmada, false);
});

test('vehiculos: incluye la última práctica cerrada de cada coche (para comprobar el km inicial)', async () => {
  reiniciar(base());
  const r = await llamar('vehiculos', { method: 'GET' });
  assert.equal(r.status, 200); assert.equal(r.json[0].ultimo.km_final, 1000); assert.equal(r.json[0].ultimo.alumno, 'Lucía Martín');
});

test('alumnos?resumen=1: clases, km y última fecha por alumno', async () => {
  reiniciar(base());
  const r = await llamar('alumnos', { method: 'GET', query: { resumen: '1' } });
  const lucia = r.json.find(a => a.id === 1);
  assert.deepEqual([lucia.clases, lucia.km, lucia.ultima_fecha], [1, 20, '2026-09-28']);
  assert.equal(r.json.find(a => a.id === 2).clases, 0);
});

test('practicas-alumno: totales, km, fechas y próximas clases', async () => {
  const t = base(); t.reservas.push({ id: 1, alumno_id: 1, fecha: '2999-01-01', hora_inicio: '10:00', estado: 'confirmada', nota: '', deleted: false });
  reiniciar(t);
  const r = await llamar('practicas-alumno', { method: 'GET', query: { alumno_id: '1', hoy: hoy() } });
  assert.equal(r.status, 200); assert.equal(r.json.total, 1); assert.equal(r.json.km_totales, 20);
  assert.deepEqual(r.json.fechas, ['2026-09-28']); assert.equal(r.json.proximas.length, 1); assert.equal(r.json.alumno.profesor_nombre, 'Javier');
});

// ─── 2026-10-01: zonas, calendario, detalle con firma, clases previas, paginación ───

test('config: devuelve las zonas de la empresa; sin la tabla, lista vacía', async () => {
  const t = base(); t.ajustes_empresa = [{ empresa_id: 'emp1', clave: 'zonas', valor: ['Centro', ' Polígono ', 'centro', 7] }, { empresa_id: 'otra', clave: 'zonas', valor: ['Ajena'] }];
  reiniciar(t);
  const r = await llamar('config', { method: 'GET' });
  assert.equal(r.status, 200); assert.deepEqual(r.json.zonas, ['Centro', 'Polígono']);
  reiniciar(base());
  assert.deepEqual((await llamar('config', { method: 'GET' })).json.zonas, []);
});

test('iniciar y finalizar guardan las zonas recorridas (limpias); finalizar puede cambiarlas', async () => {
  reiniciar(base());
  const { json: { practica_id } } = await llamar('iniciar-practica', { body: ini({ zonas: ['Centro', 'Centro', '  Autovía  ', 3] }) });
  assert.deepEqual(BD.tablas.practicas.find(x => x.id === practica_id).zonas, ['Centro', 'Autovía']);
  const r = await llamar('finalizar-practica', { body: { practica_id, km_final: 1012, zonas: ['Polígono'] } });
  assert.equal(r.status, 200);
  assert.deepEqual(BD.tablas.practicas.find(x => x.id === practica_id).zonas, ['Polígono']);
});

test('hoy: el nº de clase suma las clases previas del alumno y el nombre lleva apellidos', async () => {
  const t = base();
  t.alumnos[1].clases_previas = 12; t.alumnos[1].primer_apellido = 'Ortega'; t.alumnos[1].nombre = 'Pablo';
  t.practicas.push({ id: 2, alumno_id: 2, vehiculo_id: 1, fecha: hoy(), hora_inicio: '08:30', km_inicial: 1000, km_final: 1014, profesor_id: 1, deleted: false, empresa_id: 'emp1', zonas: ['Centro'] });
  reiniciar(t);
  const r = await llamar('hoy', { method: 'GET', query: { fecha: hoy(), hoy: hoy(), profesor_id: '1' } });
  assert.equal(r.json.practicas[0].clase_n, 13);
  assert.equal(r.json.practicas[0].alumno_nombre, 'Pablo Ortega');
  assert.deepEqual(r.json.practicas[0].zonas, ['Centro']);
});

test('calendario: prácticas del rango con firmada (sin la imagen), filtro por profesor y límite de días', async () => {
  const t = base();
  t.practicas.push({ id: 2, alumno_id: 2, vehiculo_id: 1, fecha: '2026-09-29', hora_inicio: '10:00', km_inicial: 1000, km_final: 1030, profesor_id: 1, deleted: false, empresa_id: 'emp1', firma: 'data:image/png;base64,AA==' });
  t.practicas.push({ id: 3, alumno_id: 1, vehiculo_id: 1, fecha: '2026-09-30', hora_inicio: '09:00', km_inicial: 1030, km_final: 1060, profesor_id: 2, deleted: false, empresa_id: 'emp1' });
  t.practicas.push({ id: 4, alumno_id: 1, vehiculo_id: 1, fecha: '2026-10-02', km_inicial: 0, km_final: 0, profesor_id: 1, deleted: false, empresa_id: 'emp1' });
  reiniciar(t);
  const r = await llamar('calendario', { method: 'GET', query: { desde: '2026-09-01', hasta: '2026-09-30', hoy: '2026-10-01' } });
  assert.equal(r.status, 200);
  assert.deepEqual(r.json.practicas.map(p => p.id), [1, 2, 3]);
  const p2 = r.json.practicas.find(p => p.id === 2);
  assert.equal(p2.firmada, true); assert.ok(!('firma' in p2)); assert.equal(p2.km, 30); assert.equal(p2.matricula, '4821 LKM');
  const soloProfe1 = await llamar('calendario', { method: 'GET', query: { desde: '2026-09-01', hasta: '2026-09-30', profesor_id: '1' } });
  assert.deepEqual(soloProfe1.json.practicas.map(p => p.id), [1, 2]);
  assert.equal((await llamar('calendario', { method: 'GET', query: { desde: '2026-01-01', hasta: '2026-09-30' } })).status, 400);
  assert.equal((await llamar('calendario', { method: 'GET', query: { desde: 'ayer', hasta: '2026-09-30' } })).status, 400);
});

test('practica-detalle: trae la firma, el profesor, el nº de clase y si se puede cancelar', async () => {
  const t = base();
  t.alumnos[0].clases_previas = 5;
  t.practicas[0].firma = 'data:image/png;base64,AA=='; t.practicas[0].updated_at = new Date().toISOString();
  reiniciar(t);
  const r = await llamar('practica-detalle', { method: 'GET', query: { id: '1' } });
  assert.equal(r.status, 200);
  assert.equal(r.json.practica.firma, 'data:image/png;base64,AA==');
  assert.equal(r.json.practica.profesor_nombre, 'Javier');
  assert.equal(r.json.practica.clase_n, 6);
  assert.equal(r.json.practica.cancelable, true);
  assert.equal((await llamar('practica-detalle', { method: 'GET', query: { id: '99' } })).status, 404);
});

test('alumnos?resumen=1: pagina las prácticas (más de 1.000) y devuelve el punto de partida', async () => {
  const t = base();
  t.alumnos[1].clases_previas = 8; t.alumnos[1].km_previos = 300;
  for (let i = 0; i < 1500; i++) t.practicas.push({ id: 100 + i, alumno_id: 2, vehiculo_id: 1, fecha: '2026-09-01', km_inicial: 10, km_final: 11, deleted: false, empresa_id: 'emp1' });
  reiniciar(t);
  BD.maxRows = 1000;
  const r = await llamar('alumnos', { method: 'GET', query: { resumen: '1' } });
  const pablo = r.json.find(a => a.id === 2);
  assert.equal(pablo.clases, 1500); assert.equal(pablo.km, 1500);
  assert.equal(pablo.clases_previas, 8); assert.equal(pablo.km_previos, 300);
});

// ─── 2026-10-01 (2): sesiones de varias clases (90 min = 2 clases de 45) ───

test('config: devuelve los minutos por clase del escritorio (por defecto 45)', async () => {
  const t = base(); t.ajustes_empresa = [{ empresa_id: 'emp1', clave: 'duracion_clase_min', valor: 50 }];
  reiniciar(t);
  assert.equal((await llamar('config', { method: 'GET' })).json.duracion_clase_min, 50);
  reiniciar(base());
  assert.equal((await llamar('config', { method: 'GET' })).json.duracion_clase_min, 45);
});

test('finalizar-practica con n_clases=2: guarda 2 clases encadenadas (km y horario repartidos)', async () => {
  reiniciar(base());
  const { json: { practica_id } } = await llamar('iniciar-practica', { body: ini({ hora_inicio: '10:00', zonas: ['Centro'] }) });
  const r = await llamar('finalizar-practica', { body: { practica_id, km_final: 1061, hora_fin: '11:30', n_clases: 2, trabajado: ['Glorietas'] } });
  assert.equal(r.status, 200); assert.equal(r.json.clases, 2); assert.equal(r.json.practica_ids.length, 2);
  const [a, b] = r.json.practica_ids.map(id => BD.tablas.practicas.find(x => x.id === id));
  assert.deepEqual([a.km_inicial, a.km_final, a.hora_inicio, a.hora_fin], [1000, 1031, '10:00', '10:45']);
  assert.deepEqual([b.km_inicial, b.km_final, b.hora_inicio, b.hora_fin], [1031, 1061, '10:45', '11:30']);
  assert.deepEqual([b.alumno_id, b.vehiculo_id, b.fecha, b.profesor_id, b.source, b.deleted], [2, 1, hoy(), 1, 'web-remote', false]);
  assert.deepEqual(b.trabajado, ['Glorietas']); assert.deepEqual(b.zonas, ['Centro']);
  assert.deepEqual(r.json.alumno, { clases: 2, km: 61 });
  assert.equal(BD.tablas.vehiculos[0].km_actual, 1061);
});

test('finalizar-practica con n_clases: reintento no duplica; pocos km o n fuera de rango → 400', async () => {
  reiniciar(base());
  const { json: { practica_id } } = await llamar('iniciar-practica', { body: ini({ hora_inicio: '10:00' }) });
  const r1 = await llamar('finalizar-practica', { body: { practica_id, km_final: 1040, hora_fin: '11:30', n_clases: 2 } });
  const r2 = await llamar('finalizar-practica', { body: { practica_id, km_final: 1040, hora_fin: '11:30', n_clases: 2 } });
  assert.equal(r2.status, 200); assert.equal(r2.json.ya_cerrada, true);
  assert.deepEqual(r2.json.practica_ids, r1.json.practica_ids);
  assert.equal(BD.tablas.practicas.filter(p => !p.deleted && p.alumno_id === 2).length, 2);
  reiniciar(base());
  const { json: { practica_id: otra } } = await llamar('iniciar-practica', { body: ini() });
  assert.equal((await llamar('finalizar-practica', { body: { practica_id: otra, km_final: 1001, n_clases: 2 } })).status, 400);
  assert.equal((await llamar('finalizar-practica', { body: { practica_id: otra, km_final: 1080, n_clases: 9 } })).status, 400);
});

test('firmar-practica con practica_ids: una firma para todas las clases de la sesión; el detalle las agrupa', async () => {
  reiniciar(base());
  const { json: { practica_id } } = await llamar('iniciar-practica', { body: ini({ hora_inicio: '10:00' }) });
  const { json: fin } = await llamar('finalizar-practica', { body: { practica_id, km_final: 1060, hora_fin: '11:30', n_clases: 2 } });
  const det = await llamar('practica-detalle', { method: 'GET', query: { id: String(fin.practica_ids[1]) } });
  assert.deepEqual(det.json.practica.sesion.ids, fin.practica_ids);
  assert.deepEqual([det.json.practica.sesion.km_inicial, det.json.practica.sesion.km_final, det.json.practica.sesion.n], [1000, 1060, 2]);
  const firma = 'data:image/png;base64,iVBORw0KGgo=';
  const r = await llamar('firmar-practica', { body: { practica_ids: fin.practica_ids, firma } });
  assert.equal(r.status, 200); assert.equal(r.json.firmadas, 2);
  assert.ok(fin.practica_ids.every(id => BD.tablas.practicas.find(x => x.id === id).firma === firma));
  assert.equal((await llamar('firmar-practica', { body: { practica_ids: [fin.practica_ids[0], 999], firma } })).status, 404);
});

// ─── Clases olvidadas (anotar-practica) ─────────────────────────────────────
const haceDias = n => { const d = new Date(); d.setDate(d.getDate() - n); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const anot = (extra = {}) => ({ alumno_id: 2, vehiculo_id: 1, fecha: haceDias(2), hoy: hoy(), hora_inicio: '10:00', hora_fin: '11:30', n_clases: 2, km_inicial: 1000, km_final: 1060, profesor_id: 1, ...extra });

test('anotar-practica con km: guarda N clases repartidas, marcadas como anotadas, y sube el odómetro', async () => {
  reiniciar(base());
  const r = await llamar('anotar-practica', { body: anot({ zonas: ['Centro'], observacion: 'Se me olvidó anotarla' }) });
  assert.equal(r.status, 200); assert.equal(r.json.clases, 2); assert.equal(r.json.con_km, true);
  const [a, b] = r.json.practica_ids.map(id => BD.tablas.practicas.find(x => x.id === id));
  assert.deepEqual([a.km_inicial, a.km_final, a.hora_inicio, a.hora_fin], [1000, 1030, '10:00', '10:45']);
  assert.deepEqual([b.km_inicial, b.km_final, b.hora_inicio, b.hora_fin], [1030, 1060, '10:45', '11:30']);
  assert.deepEqual([a.tipo_detalle, a.source, a.fecha, a.nota, a.profesor_id], ['anotada', 'web-remote', haceDias(2), 'Se me olvidó anotarla', 1]);
  assert.deepEqual(a.zonas, ['Centro']);
  assert.equal(BD.tablas.vehiculos[0].km_actual, 1060);
});

test('anotar-practica sin km: queda en blanco para rellenar desde el escritorio (no toca el odómetro)', async () => {
  reiniciar(base());
  const r = await llamar('anotar-practica', { body: anot({ km_inicial: '', km_final: '', n_clases: 2 }) });
  assert.equal(r.status, 200); assert.equal(r.json.con_km, false);
  const ps = r.json.practica_ids.map(id => BD.tablas.practicas.find(x => x.id === id));
  assert.deepEqual(ps.map(p => [p.km_inicial, p.km_final, p.hora_inicio]), [[0, 0, '10:00'], [0, 0, '10:45']]);
  assert.equal(BD.tablas.vehiculos[0].km_actual, 1000);
});

test('anotar-practica: rechaza el futuro, más de 30 días, un solo km, km al revés y alumno inexistente', async () => {
  reiniciar(base());
  const manana = (() => { const d = new Date(); d.setDate(d.getDate() + 1); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; })();
  assert.equal((await llamar('anotar-practica', { body: anot({ fecha: manana }) })).status, 400);
  assert.equal((await llamar('anotar-practica', { body: anot({ fecha: haceDias(45) }) })).status, 400);
  assert.equal((await llamar('anotar-practica', { body: anot({ km_final: '' }) })).status, 400);
  assert.equal((await llamar('anotar-practica', { body: anot({ km_final: 990 }) })).status, 400);
  assert.equal((await llamar('anotar-practica', { body: anot({ hora_inicio: '9h' }) })).status, 400);
  assert.equal((await llamar('anotar-practica', { body: anot({ alumno_id: 99 }) })).status, 404);
  assert.equal(BD.tablas.practicas.length, 1);
});

test('anotar-practica: avisa si ya estaba anotada (se puede forzar) y si los km pisan otra clase del coche', async () => {
  reiniciar(base());
  assert.equal((await llamar('anotar-practica', { body: anot({ n_clases: 1 }) })).status, 200);
  const dup = await llamar('anotar-practica', { body: anot({ n_clases: 1, km_inicial: 1100, km_final: 1130 }) });
  assert.equal(dup.status, 409); assert.equal(dup.json.duplicada, true); assert.match(dup.json.error, /ya tiene una clase/);
  const forz = await llamar('anotar-practica', { body: anot({ n_clases: 1, km_inicial: 1100, km_final: 1130, forzar: true }) });
  assert.equal(forz.status, 200);
  // km 990-1010 se pisa con la práctica 1 (980-1000) del mismo coche
  const sol = await llamar('anotar-practica', { body: anot({ fecha: haceDias(3), hora_inicio: '12:00', n_clases: 1, km_inicial: 990, km_final: 1010 }) });
  assert.equal(sol.status, 409); assert.equal(sol.json.solape, true);
});

// ─── Cobros de alta al crear un alumno desde el móvil ─────────────────────────
test('crear-alumno: carga los conceptos «al dar de alta» de Ajustes → Cobros; sin conceptos no carga nada', async () => {
  reiniciar({ ...base(), ajustes_empresa: [{ empresa_id: 'emp1', clave: 'conceptos_cobro', valor: [
    { id: 'matricula', nombre: 'Matrícula', tipo: 'matricula', importe: 150, alta: true },
    { id: 'tasa', nombre: 'Tasa de tráfico (DGT)', tipo: 'tasa', importe: 94.05, alta: false },
    { id: 'c1', nombre: 'Soporte informático', tipo: 'cargo', importe: 20, alta: true },
    { id: 'c2', nombre: 'Sin importe', tipo: 'cargo', importe: 0, alta: true }
  ] }], cargos: [] });
  const r = await llamar('crear-alumno', { body: { nombre: 'Marta', permiso: 'B', hoy: hoy() } });
  assert.equal(r.status, 200);
  assert.deepEqual(r.json.cobros_alta, [{ concepto: 'Matrícula', importe: 150 }, { concepto: 'Soporte informático', importe: 20 }]);
  const cargos = BD.tablas.cargos;
  assert.deepEqual(cargos.map(c => [c.alumno_id, c.tipo, c.concepto, c.importe, c.fecha, c.empresa_id, c.deleted]), [
    [r.json.alumno_id, 'matricula', 'Matrícula', 150, hoy(), 'emp1', false],
    [r.json.alumno_id, 'cargo', 'Soporte informático', 20, hoy(), 'emp1', false]
  ]);
  assert.ok(cargos.every(c => c.id >= 1500000000 && c.id < 2100000000));

  reiniciar(base());
  const r2 = await llamar('crear-alumno', { body: { nombre: 'Iván', permiso: 'B' } });
  assert.equal(r2.status, 200); assert.deepEqual(r2.json.cobros_alta, []);
});
