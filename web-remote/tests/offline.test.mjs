// Pruebas del modo sin conexión (web-remote/offline.js): almacén, caché de lecturas,
// cola de envíos con dependencias y reintentos. Sin red ni navegador.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const Offline = createRequire(import.meta.url)('../offline.js');

const nueva = () => { let n = 0, t = 1000; return Offline.crear({ almacen: Offline.almacenMemoria(), nuevoId: () => 'op' + (++n), ahora: () => ++t }); };
const ok = (json = {}) => ({ status: 200, json: { ok: true, ...json } });

test('claveCache: solo cachea las lecturas necesarias y no depende de «hoy»', () => {
  assert.equal(Offline.claveCache('/api/vehiculos'), '/api/vehiculos');
  assert.equal(Offline.claveCache('/api/alumnos?resumen=1'), '/api/alumnos?resumen=1');
  assert.equal(Offline.claveCache('/api/hoy?fecha=2026-10-06&hoy=2026-10-06&profesor_id=3'), '/api/hoy?fecha=2026-10-06&profesor_id=3');
  assert.equal(Offline.claveCache('/api/hoy?profesor_id=3&hoy=2026-10-07&fecha=2026-10-06'), '/api/hoy?fecha=2026-10-06&profesor_id=3');
  assert.equal(Offline.claveCache('/api/practica-detalle?id=5'), null);
  assert.equal(Offline.claveCache('/api/practicas-alumno?alumno_id=2'), null);
});

test('caché: guarda y devuelve la última respuesta; se queda con las más recientes', async () => {
  const o = nueva();
  assert.equal(await o.cache.leer('/api/vehiculos'), null);
  await o.cache.guardar('/api/vehiculos', '[{"id":1}]');
  assert.equal((await o.cache.leer('/api/vehiculos')).texto, '[{"id":1}]');
  await o.cache.guardar('/api/vehiculos', '[{"id":2}]');
  assert.equal((await o.cache.leer('/api/vehiculos')).texto, '[{"id":2}]');
  assert.equal(await o.cache.guardar('/api/practica-detalle?id=1', 'x'), false);
  for (let i = 0; i < 60; i++) await o.cache.guardar(`/api/calendario?desde=2026-01-${i}`, String(i));
  assert.equal((await o.almacen.todos('cache')).length, 40);
  assert.ok(await o.cache.leer('/api/calendario?desde=2026-01-59'));
  assert.equal(await o.cache.leer('/api/calendario?desde=2026-01-0'), null);
});

test('cola: se guarda en orden, por cuenta, y quitar una op quita las que dependen de ella', async () => {
  const o = nueva();
  const a = await o.cola.agregar({ uid: 'u1', tipo: 'finalizar', url: '/api/finalizar-practica', cuerpo: { practica_id: 5 } });
  const b = await o.cola.agregar({ uid: 'u1', tipo: 'firmar', url: '/api/firmar-practica', cuerpo: { firma: 'x' }, depende: a.id });
  await o.cola.agregar({ uid: 'u2', tipo: 'registrar', url: '/api/registrar-clase', cuerpo: {} });
  assert.deepEqual((await o.cola.listar('u1')).map(x => x.tipo), ['finalizar', 'firmar']);
  assert.equal(await o.cola.contar('u2'), 1);
  assert.equal(await o.cola.contar(), 3);
  await o.cola.quitar(a.id);
  assert.equal(await o.cola.obtener(b.id), null);
  assert.equal(await o.cola.contar('u1'), 0);
  assert.equal(await o.cola.contar('u2'), 1);
});

test('vaciar: envía en orden y quita lo enviado; la firma usa los ids que devolvió el cierre', async () => {
  const o = nueva();
  const fin = await o.cola.agregar({ uid: 'u1', tipo: 'finalizar', url: '/api/finalizar-practica', cuerpo: { practica_id: 7, km_final: 1030 } });
  await o.cola.agregar({ uid: 'u1', tipo: 'firmar', url: '/api/firmar-practica', cuerpo: { firma: 'F' }, depende: fin.id });
  const enviados = [];
  const r = await o.vaciar({ uid: 'u1', enviar: async op => { enviados.push([op.tipo, JSON.stringify(op.cuerpo)]); return op.tipo === 'finalizar' ? ok({ practica_ids: [7, 8] }) : ok(); } });
  assert.deepEqual(r, { enviadas: 2, fallidas: 0, pendientes: 0, parado: null });
  assert.deepEqual(enviados.map(x => x[0]), ['finalizar', 'firmar']);
  assert.deepEqual(JSON.parse(enviados[1][1]), { firma: 'F', practica_ids: [7, 8], practica_id: 7 });
});

test('vaciar: sin red se para y NO pierde nada; al volver la red lo manda todo', async () => {
  const o = nueva();
  await o.cola.agregar({ uid: 'u1', tipo: 'registrar', url: '/api/registrar-clase', cuerpo: { cid: 'a' } });
  await o.cola.agregar({ uid: 'u1', tipo: 'registrar', url: '/api/registrar-clase', cuerpo: { cid: 'b' } });
  let r = await o.vaciar({ uid: 'u1', enviar: async () => { throw new Offline.ErrorRed(); } });
  assert.deepEqual(r, { enviadas: 0, fallidas: 0, pendientes: 2, parado: 'red' });
  const vistos = [];
  r = await o.vaciar({ uid: 'u1', enviar: async op => { vistos.push(op.cuerpo.cid); return ok(); } });
  assert.deepEqual(vistos, ['a', 'b']); assert.equal(r.pendientes, 0);
});

test('vaciar: se queda donde falló la red (la primera enviada no se repite)', async () => {
  const o = nueva();
  for (const c of ['a', 'b', 'c']) await o.cola.agregar({ uid: 'u1', tipo: 'registrar', url: '/x', cuerpo: { cid: c } });
  let n = 0;
  let r = await o.vaciar({ uid: 'u1', enviar: async () => { if (++n === 2) throw new Offline.ErrorRed(); return ok(); } });
  assert.deepEqual([r.enviadas, r.pendientes, r.parado], [1, 2, 'red']);
  assert.deepEqual((await o.cola.listar('u1')).map(x => x.cuerpo.cid), ['b', 'c']);
});

test('vaciar: un error «de verdad» (datos no válidos) marca esa clase como fallida y sigue con las demás', async () => {
  const o = nueva();
  const mala = await o.cola.agregar({ uid: 'u1', tipo: 'registrar', url: '/x', cuerpo: { cid: 'mala' } });
  await o.cola.agregar({ uid: 'u1', tipo: 'registrar', url: '/x', cuerpo: { cid: 'buena' } });
  const r = await o.vaciar({ uid: 'u1', enviar: async op => op.cuerpo.cid === 'mala' ? { status: 400, json: { error: 'Alumno no encontrado' } } : ok() });
  assert.deepEqual([r.enviadas, r.fallidas, r.pendientes, r.parado], [1, 1, 1, null]);
  const fallida = await o.cola.obtener(mala.id);
  assert.equal(fallida.fallida, true); assert.equal(fallida.error, 'Alumno no encontrado');
  // una fallida no se vuelve a enviar sola
  let llamadas = 0;
  await o.vaciar({ uid: 'u1', enviar: async () => { llamadas++; return ok(); } });
  assert.equal(llamadas, 0);
});

test('vaciar: si falla el cierre, la firma que dependía de él también se marca fallida', async () => {
  const o = nueva();
  const fin = await o.cola.agregar({ uid: 'u1', tipo: 'finalizar', url: '/x', cuerpo: { practica_id: 1 } });
  const fir = await o.cola.agregar({ uid: 'u1', tipo: 'firmar', url: '/y', cuerpo: {}, depende: fin.id });
  const r = await o.vaciar({ uid: 'u1', enviar: async () => ({ status: 404, json: { error: 'Práctica no encontrada' } }) });
  assert.equal(r.fallidas, 2);
  assert.equal((await o.cola.obtener(fir.id)).fallida, true);
});

test('vaciar: sesión caducada (401) y servidor caído (5xx) paran y conservan todo; 5xx cuenta el intento', async () => {
  const o = nueva();
  const op = await o.cola.agregar({ uid: 'u1', tipo: 'registrar', url: '/x', cuerpo: {} });
  assert.equal((await o.vaciar({ uid: 'u1', enviar: async () => ({ status: 401, json: {} }) })).parado, 'sesion');
  assert.equal((await o.vaciar({ uid: 'u1', enviar: async () => ({ status: 503, json: {} }) })).parado, 'servidor');
  const guardada = await o.cola.obtener(op.id);
  assert.equal(guardada.intentos, 1); assert.equal(guardada.fallida, false);
});

test('vaciar: solo manda lo de la cuenta que está dentro y no se pisa a sí mismo', async () => {
  const o = nueva();
  await o.cola.agregar({ uid: 'otra', tipo: 'registrar', url: '/x', cuerpo: { cid: 'ajena' } });
  await o.cola.agregar({ uid: 'u1', tipo: 'registrar', url: '/x', cuerpo: { cid: 'mia' } });
  const vistos = [];
  let dentro;
  const larga = o.vaciar({ uid: 'u1', enviar: async op => { vistos.push(op.cuerpo.cid); await new Promise(r => setTimeout(r, 20)); return ok(); } });
  dentro = await o.vaciar({ uid: 'u1', enviar: async () => ok() });
  assert.equal(dentro.parado, 'ocupado');
  await larga;
  assert.deepEqual(vistos, ['mia']);
  assert.equal(await o.cola.contar('otra'), 1);
});

test('fetchConTope: convierte fallo de red y tiempo agotado en ErrorRed', async () => {
  await assert.rejects(Offline.fetchConTope(async () => { throw new TypeError('Failed to fetch'); }, '/x', {}, 50), e => e.red === true && /Sin conexión/.test(e.message));
  await assert.rejects(Offline.fetchConTope((u, o) => new Promise((_, rej) => o.signal.addEventListener('abort', () => rej(Object.assign(new Error('abort'), { name: 'AbortError' })))), '/x', {}, 30), e => e.red === true && /tiempo/.test(e.message));
  const r = await Offline.fetchConTope(async () => ({ ok: true, status: 200 }), '/x', {}, 50);
  assert.equal(r.status, 200);
  assert.equal(Offline.esErrorRed(new TypeError('x')), true);
  assert.equal(Offline.esErrorRed(new Error('Sesión expirada')), false);
});

test('el almacén con respaldo sigue funcionando aunque IndexedDB falle', async () => {
  const roto = { nombre: 'roto', get: async () => { throw new Error('boom'); }, set: async () => { throw new Error('boom'); }, del: async () => { throw new Error('boom'); }, todos: async () => { throw new Error('boom'); } };
  const a = Offline.almacenConRespaldo(roto, Offline.almacenMemoria());
  await a.set('cola', 'k', { v: 1 });
  assert.deepEqual(await a.get('cola', 'k'), { v: 1 });
  assert.equal(a.nombre, 'memoria');
  const ls = new Map();
  const falsoLS = { getItem: k => ls.has(k) ? ls.get(k) : null, setItem: (k, v) => ls.set(k, v), removeItem: k => ls.delete(k), get length() { return ls.size; }, key: i => [...ls.keys()][i] };
  const b = Offline.almacenLocalStorage(falsoLS);
  await b.set('cola', 'z', { ok: true });
  assert.deepEqual(await b.todos('cola'), [['z', { ok: true }]]);
  await b.del('cola', 'z');
  assert.deepEqual(await b.todos('cola'), []);
});
