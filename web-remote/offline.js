// AulaMovil · modo sin conexión.
// Las tablets de los profesores no tienen datos móviles dentro del coche: la web
// guarda en la propia tablet (IndexedDB) lo que hay que enviar y lo manda sola
// cuando vuelve la cobertura. Este archivo no sabe nada de pantallas:
//   · Almacén  – IndexedDB con respaldo en localStorage (y en memoria para pruebas).
//   · Caché    – la última respuesta de las lecturas que hacen falta sin red
//                (coches, alumnos, profesores, ajustes, jornada, calendario).
//   · Cola     – lo pendiente de enviar, en orden, con dependencias (la firma
//                espera a que se cierre la clase).
//   · vaciar() – envía la cola: lo que sale bien se quita, un error de red o del
//                servidor para y se reintenta luego, un error «de verdad» (datos
//                no válidos) marca esa clase como fallida sin bloquear las demás.
// Se carga como <script> clásico (window.Offline) y como módulo en las pruebas.
(function (raiz) {
  'use strict';

  // ─── Almacenes ──────────────────────────────────────────────────────────────
  const TIENDAS = ['cola', 'cache', 'meta'];

  function almacenMemoria() {
    const t = {}; for (const s of TIENDAS) t[s] = new Map();
    return {
      nombre: 'memoria',
      get: async (s, k) => (t[s].has(k) ? JSON.parse(t[s].get(k)) : undefined),
      set: async (s, k, v) => { t[s].set(k, JSON.stringify(v)); },
      del: async (s, k) => { t[s].delete(k); },
      todos: async s => [...t[s].entries()].map(([k, v]) => [k, JSON.parse(v)])
    };
  }

  function almacenLocalStorage(ls) {
    const pref = s => 'km_off:' + s + ':';
    return {
      nombre: 'localStorage',
      get: async (s, k) => { const v = ls.getItem(pref(s) + k); return v == null ? undefined : JSON.parse(v); },
      set: async (s, k, v) => { ls.setItem(pref(s) + k, JSON.stringify(v)); },
      del: async (s, k) => { ls.removeItem(pref(s) + k); },
      todos: async s => {
        const out = [], p = pref(s);
        for (let i = 0; i < ls.length; i++) { const c = ls.key(i); if (c && c.startsWith(p)) out.push([c.slice(p.length), JSON.parse(ls.getItem(c))]); }
        return out;
      }
    };
  }

  function almacenIndexedDB(idb) {
    let abierta = null;
    const abrir = () => abierta || (abierta = new Promise((ok, mal) => {
      const r = idb.open('aulamovil-offline', 1);
      r.onupgradeneeded = () => { for (const s of TIENDAS) if (!r.result.objectStoreNames.contains(s)) r.result.createObjectStore(s); };
      r.onsuccess = () => ok(r.result);
      r.onerror = () => mal(r.error || new Error('indexedDB'));
      r.onblocked = () => mal(new Error('indexedDB bloqueada'));
    }));
    const pedir = (s, modo, fn) => abrir().then(db => new Promise((ok, mal) => {
      const t = db.transaction(s, modo);
      const rq = fn(t.objectStore(s));
      t.oncomplete = () => ok(rq ? rq.result : undefined);
      t.onabort = t.onerror = () => mal(t.error || new Error('indexedDB'));
    }));
    return {
      nombre: 'indexedDB',
      get: (s, k) => pedir(s, 'readonly', st => st.get(k)),
      set: (s, k, v) => pedir(s, 'readwrite', st => st.put(v, k)),
      del: (s, k) => pedir(s, 'readwrite', st => st.delete(k)),
      todos: s => abrir().then(db => new Promise((ok, mal) => {
        const out = [], t = db.transaction(s, 'readonly'), rq = t.objectStore(s).openCursor();
        rq.onsuccess = () => { const c = rq.result; if (c) { out.push([c.key, c.value]); c.continue(); } };
        t.oncomplete = () => ok(out);
        t.onabort = t.onerror = () => mal(t.error || new Error('indexedDB'));
      }))
    };
  }

  // IndexedDB; si falla (modo privado, sin espacio...) se pasa al respaldo y se sigue.
  function almacenConRespaldo(principal, respaldo) {
    let actual = principal;
    const llamar = async (m, ...a) => {
      try { return await actual[m](...a); }
      catch (e) { if (actual === respaldo) throw e; actual = respaldo; return actual[m](...a); }
    };
    return { get nombre() { return actual.nombre; }, get: (...a) => llamar('get', ...a), set: (...a) => llamar('set', ...a), del: (...a) => llamar('del', ...a), todos: (...a) => llamar('todos', ...a) };
  }

  function almacenDelNavegador(entorno) {
    const e = entorno || raiz;
    const ls = (() => { try { return e.localStorage || null; } catch { return null; } })();
    const respaldo = ls ? almacenLocalStorage(ls) : almacenMemoria();
    return e.indexedDB ? almacenConRespaldo(almacenIndexedDB(e.indexedDB), respaldo) : respaldo;
  }

  // ─── Utilidades ─────────────────────────────────────────────────────────────
  function nuevoId() {
    const c = raiz.crypto;
    if (c && c.randomUUID) return c.randomUUID();
    const b = new Uint8Array(16);
    if (c && c.getRandomValues) c.getRandomValues(b); else for (let i = 0; i < 16; i++) b[i] = Math.floor(Math.random() * 256);
    return Array.from(b, x => x.toString(16).padStart(2, '0')).join('');
  }

  // Error de red = no hay conexión, se agotó el tiempo o el servidor no contesta.
  class ErrorRed extends Error { constructor(m) { super(m || 'Sin conexión'); this.red = true; } }
  const esErrorRed = e => !!e && (e.red === true || e instanceof TypeError || (e.name === 'AbortError'));

  async function fetchConTope(fetchFn, url, opciones, ms) {
    const ctl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const reloj = ctl ? setTimeout(() => ctl.abort(), ms || 10000) : null;
    try { return await fetchFn(url, ctl ? { ...opciones, signal: ctl.signal } : opciones); }
    catch (e) { throw new ErrorRed(e && e.name === 'AbortError' ? 'Sin conexión (tiempo agotado)' : 'Sin conexión'); }
    finally { if (reloj) clearTimeout(reloj); }
  }

  // ─── Caché de lecturas ──────────────────────────────────────────────────────
  // Solo lo necesario para trabajar sin red; `hoy` es volátil y no entra en la clave.
  const CACHEABLES = ['/api/vehiculos', '/api/alumnos', '/api/profesores', '/api/config', '/api/hoy', '/api/calendario', '/api/firma-profesor'];
  const MAX_CACHE = 40;

  function claveCache(url) {
    let u; try { u = new URL(url, 'https://x.invalid'); } catch { return null; }
    if (!CACHEABLES.includes(u.pathname)) return null;
    const q = new URLSearchParams(u.search); q.delete('hoy');
    q.sort();
    const s = q.toString();
    return u.pathname + (s ? '?' + s : '');
  }

  // ─── Instancia: caché + cola + envío ────────────────────────────────────────
  function crear(opciones) {
    const o = opciones || {};
    const almacen = o.almacen || almacenDelNavegador();
    const ahora = o.ahora || (() => Date.now());
    const id = o.nuevoId || nuevoId;
    const bloqueo = o.bloqueo || (fn => fn());
    let _vaciando = false;

    const cache = {
      async guardar(url, texto) {
        const k = claveCache(url); if (!k) return false;
        await almacen.set('cache', k, { texto, ts: ahora() });
        const todas = await almacen.todos('cache');
        if (todas.length > MAX_CACHE) {
          todas.sort((a, b) => (a[1].ts || 0) - (b[1].ts || 0));
          for (const [k2] of todas.slice(0, todas.length - MAX_CACHE)) await almacen.del('cache', k2);
        }
        return true;
      },
      async leer(url) { const k = claveCache(url); return k ? (await almacen.get('cache', k)) || null : null; },
      // Borra la copia de lecturas (alumnos, coches, jornada…): al cerrar sesión o al entrar otra cuenta
      async vaciar() { for (const [k] of await almacen.todos('cache')) await almacen.del('cache', k); return true; }
    };

    const cola = {
      // op: { uid, tipo, url, cuerpo, depende?, etiqueta? }
      async agregar(op) {
        const nueva = { id: id(), creado: ahora(), intentos: 0, fallida: false, error: null, depende: null, etiqueta: null, ...op };
        await almacen.set('cola', nueva.id, nueva);
        return nueva;
      },
      async obtener(i) { return (await almacen.get('cola', i)) || null; },
      async listar(uid) {
        const todas = (await almacen.todos('cola')).map(x => x[1]);
        return todas.filter(x => uid == null || x.uid === uid).sort((a, b) => a.creado - b.creado || String(a.id).localeCompare(String(b.id)));
      },
      async actualizar(i, parche) { const x = await almacen.get('cola', i); if (!x) return null; const n = { ...x, ...parche }; await almacen.set('cola', i, n); return n; },
      // Quita la op y todo lo que dependa de ella
      async quitar(i) {
        await almacen.del('cola', i);
        for (const x of await cola.listar()) if (x.depende === i) await cola.quitar(x.id);
      },
      async contar(uid) { return (await cola.listar(uid)).length; }
    };

    // Lo que devuelve una op al enviarse (p. ej. los ids de las clases creadas al cerrar) lo necesitan las que esperan
    async function propagar(op, json) {
      for (const x of await cola.listar()) {
        if (x.depende !== op.id) continue;
        const cuerpo = { ...x.cuerpo };
        if (Array.isArray(json.practica_ids) && json.practica_ids.length) { cuerpo.practica_ids = json.practica_ids; cuerpo.practica_id = json.practica_ids[0]; }
        await cola.actualizar(x.id, { cuerpo, depende: null });
      }
    }

    /**
     * Envía en orden lo pendiente de `uid`. `enviar(op)` hace la petición y devuelve
     * { status, json } o lanza ErrorRed. Devuelve { enviadas, fallidas, pendientes, parado }
     * (parado: null | 'red' | 'sesion' | 'servidor').
     */
    async function vaciar({ uid, enviar, alCambiar }) {
      if (_vaciando) return { enviadas: 0, fallidas: 0, pendientes: await cola.contar(uid), parado: 'ocupado' };
      return bloqueo(async () => {
        _vaciando = true;
        let enviadas = 0, fallidas = 0, parado = null;
        try {
          for (const op0 of await cola.listar(uid)) {
            const op = await cola.obtener(op0.id);
            if (!op || op.fallida) continue;
            if (op.depende) {
              const dep = await cola.obtener(op.depende);
              if (dep) {
                if (dep.fallida) { await cola.actualizar(op.id, { fallida: true, error: 'Depende de una clase que no se pudo enviar.' }); fallidas++; }
                continue;
              }
            }
            let r;
            try { r = await enviar(op); } catch (e) { parado = 'red'; break; }
            const st = r.status || 0, json = r.json || {};
            if (st >= 200 && st < 300 && json.ok !== false) {
              await propagar(op, json);          // primero las que esperaban esta (dejan de depender)…
              await cola.quitar(op.id).catch(() => {}); // …y luego se quita, sin arrastrarlas
              enviadas++;
              if (alCambiar) alCambiar({ op, json });
            } else if (st === 401 || st === 403 || st === 0) { parado = 'sesion'; break; }
            else if (st >= 500 || st === 429 || st === 408) { await cola.actualizar(op.id, { intentos: (op.intentos || 0) + 1 }); parado = 'servidor'; break; }
            else { await cola.actualizar(op.id, { fallida: true, error: json.error || ('Error ' + st), intentos: (op.intentos || 0) + 1 }); fallidas++; }
          }
        } finally { _vaciando = false; }
        return { enviadas, fallidas, pendientes: await cola.contar(uid), parado };
      });
    }

    return { almacen, cache, cola, vaciar, nuevoId: id };
  }

  const api = { crear, almacenMemoria, almacenLocalStorage, almacenIndexedDB, almacenConRespaldo, almacenDelNavegador, claveCache, nuevoId, ErrorRed, esErrorRed, fetchConTope };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else raiz.Offline = api;
})(typeof self !== 'undefined' ? self : this);
