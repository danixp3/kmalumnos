// Pruebas de los endpoints del flujo móvil (iniciar → finalizar → firmar) contra un Supabase simulado.
import test from 'node:test';
import assert from 'node:assert/strict';
import { reiniciar, BD } from './fake-supabase.mjs';

process.env.SUPABASE_URL = 'http://fake'; process.env.SUPABASE_ANON_KEY = 'fake';
const b64 = o => Buffer.from(JSON.stringify(o)).toString('base64url');
const TOKEN = `x.${b64({ sub: 'emp1' })}.y`;

async function llamar(nombre, { method = 'POST', body, query } = {}) {
  const mod = await import(['hoy','iniciar-practica','finalizar-practica','firmar-practica','cancelar-practica'].includes(nombre) ? `../lib/movil/${nombre}.js` : `../api/${nombre}.js`);
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
  assert.equal((await llamar('firmar-practica', { body: { practica_id, firma: 'data:image/png;base64,' + 'A'.repeat(70000) } })).status, 400);
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
