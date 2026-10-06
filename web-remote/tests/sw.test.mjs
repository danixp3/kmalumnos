// Pruebas del service worker (sw.js): la app tiene que abrirse sin cobertura.
// Se ejecuta el archivo real en un contexto con `caches`, `fetch` y `self` simulados.
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';

const codigo = fs.readFileSync(new URL('../sw.js', import.meta.url), 'utf8');

function crearEntorno({ servidor }) {
  const manejadores = {}, almacenes = new Map();
  let conRed = true;
  const clave = r => (typeof r === 'string' ? new URL(r, 'https://app.test') : new URL(r.url)).pathname;
  const cache = nombre => {
    if (!almacenes.has(nombre)) almacenes.set(nombre, new Map());
    const m = almacenes.get(nombre);
    return {
      add: async u => { const res = await entorno.fetch(u); if (!res.ok) throw new Error('fallo ' + u); m.set(clave(u), res.clone()); },
      put: async (r, res) => { m.set(clave(r), res); },
      match: async r => { const x = m.get(clave(r)); return x ? x.clone() : undefined; },
      keys: async () => [...m.keys()].map(p => ({ url: 'https://app.test' + p }))
    };
  };
  const entorno = {
    URL, Response, console,
    self: { location: { origin: 'https://app.test' }, addEventListener: (t, f) => { manejadores[t] = f; }, skipWaiting: async () => {}, clients: { claim: async () => {}, matchAll: async () => [] }, registration: { showNotification: async () => {} } },
    caches: {
      open: async n => cache(n),
      keys: async () => [...almacenes.keys()],
      delete: async n => almacenes.delete(n),
      match: async r => { for (const m of almacenes.values()) { const x = m.get(clave(r)); if (x) return x.clone(); } return undefined; }
    },
    fetch: async r => {
      const ruta = clave(r);
      if (!conRed) throw new TypeError('Failed to fetch');
      return ruta in servidor ? new Response(servidor[ruta], { status: 200 }) : new Response('no', { status: 404 });
    }
  };
  vm.runInNewContext(codigo, entorno);
  const peticion = (ruta, extra = {}) => ({ method: 'GET', url: 'https://app.test' + ruta, mode: 'cors', ...extra });
  return {
    manejadores, almacenes,
    cortarRed: () => { conRed = false; },
    ponerRed: () => { conRed = true; },
    instalar: () => new Promise(ok => manejadores.install({ waitUntil: p => p.then(ok) })),
    pedir: async (ruta, extra) => {
      let respuesta;
      manejadores.fetch({ request: peticion(ruta, extra), respondWith: p => { respuesta = p; } });
      return respuesta ? await respuesta : null; // null = el service worker no interviene
    }
  };
}

const FUENTES = ['barlow-400', 'barlow-500', 'barlow-600', 'barlow-700', 'barlow-condensed-600', 'barlow-condensed-700', 'ibm-plex-mono-500', 'ibm-plex-mono-600']
  .flatMap(f => [`/fonts/${f}-latin.woff2`, `/fonts/${f}-latin-ext.woff2`]);
const servidor = () => ({
  '/': '<html>app v1</html>', '/offline.js': 'window.Offline=1', '/manifest.webmanifest': '{}', '/logo.png': 'png',
  '/icons/icon-192.png': 'png', '/icons/maskable-192.png': 'png', '/icons/apple-touch-icon.png': 'png',
  ...Object.fromEntries(FUENTES.map(f => [f, 'woff2']))
});

test('al instalarse guarda todo lo que la app necesita para abrirse sin cobertura', async () => {
  const e = crearEntorno({ servidor: servidor() });
  await e.instalar();
  const guardado = [...e.almacenes.values()][0];
  for (const ruta of ['/', '/offline.js', '/manifest.webmanifest', '/logo.png', '/icons/icon-192.png', ...FUENTES]) assert.ok(guardado.has(ruta), 'falta ' + ruta);
});

test('si un archivo no se puede guardar, el resto sí (y se instala igualmente)', async () => {
  const s = servidor(); delete s['/icons/apple-touch-icon.png'];
  const e = crearEntorno({ servidor: s });
  await e.instalar();
  const guardado = [...e.almacenes.values()][0];
  assert.ok(guardado.has('/offline.js') && guardado.has('/'));
  assert.ok(!guardado.has('/icons/apple-touch-icon.png'));
});

test('sin cobertura: la página y offline.js salen de la copia guardada; con cobertura se usa la última versión', async () => {
  const s = servidor();
  const e = crearEntorno({ servidor: s });
  await e.instalar();
  s['/'] = '<html>app v2</html>';
  assert.equal(await (await e.pedir('/', { mode: 'navigate' })).text(), '<html>app v2</html>');
  e.cortarRed();
  assert.equal(await (await e.pedir('/', { mode: 'navigate' })).text(), '<html>app v2</html>');
  assert.equal(await (await e.pedir('/offline.js')).text(), 'window.Offline=1');
  assert.equal(await (await e.pedir('/fonts/barlow-400-latin.woff2')).text(), 'woff2');
});

test('las llamadas a /api no las toca el service worker (los datos los guarda la propia web)', async () => {
  const e = crearEntorno({ servidor: servidor() });
  await e.instalar();
  assert.equal(await e.pedir('/api/vehiculos'), null);
  assert.equal(await e.pedir('/api/hoy?fecha=2026-10-06'), null);
});

test('una versión nueva borra las cachés antiguas', async () => {
  const e = crearEntorno({ servidor: servidor() });
  e.almacenes.set('aulamovil-v2', new Map());
  await e.instalar();
  await new Promise(ok => e.manejadores.activate({ waitUntil: p => p.then(ok) }));
  assert.ok(!e.almacenes.has('aulamovil-v2'));
  assert.ok([...e.almacenes.keys()].some(k => k === 'aulamovil-v3'));
});
