// Supabase simulado en memoria: solo lo que usan los endpoints de web-remote/api.
export const BD = { tablas: {}, columnasInexistentes: {}, rpc: [], funciones: {} };
export function reiniciar(tablas = {}, columnasInexistentes = {}) { BD.tablas = JSON.parse(JSON.stringify(tablas)); BD.columnasInexistentes = columnasInexistentes; BD.rpc = []; BD.maxRows = 0; BD.funciones = {}; }

const FK = { alumnos: 'alumno_id', vehiculos: 'vehiculo_id' };
const errCol = c => ({ code: 'PGRST204', message: `Could not find the '${c}' column of 'practicas' in the schema cache` });
const errColSel = c => ({ code: '42703', message: `column practicas.${c} does not exist` });

class Consulta {
  constructor(tabla) { this.t = tabla; this.filtros = []; this.ordenes = []; this.lim = null; this.modo = 'select'; this.cols = '*'; this.opts = {}; this.payload = null; this.unico = null; }
  select(cols = '*', opts = {}) { if (this.modo === 'select') { this.cols = cols; this.opts = opts; } else { this.retorna = cols; } return this; }
  insert(p) { this.modo = 'insert'; this.payload = p; return this; }
  update(p) { this.modo = 'update'; this.payload = p; return this; }
  delete() { this.modo = 'delete'; return this; }
  is(c, v) { this.filtros.push(r => (r[c] ?? null) === v); return this; }
  eq(c, v) { this.filtros.push(r => r[c] === v); return this; }
  neq(c, v) { this.filtros.push(r => r[c] !== v); return this; }
  gt(c, v) { this.filtros.push(r => r[c] > v); return this; }
  gte(c, v) { this.filtros.push(r => r[c] >= v); return this; }
  lt(c, v) { this.filtros.push(r => r[c] < v); return this; }
  lte(c, v) { this.filtros.push(r => r[c] <= v); return this; }
  in(c, vs) { this.filtros.push(r => vs.includes(r[c])); return this; }
  order(c, o = {}) { this.ordenes.push([c, o.ascending === false ? -1 : 1]); return this; }
  limit(n) { this.lim = n; return this; }
  range(a, b) { this.rango = [a, b]; return this; }
  upsert(p, o = {}) { this.modo = 'upsert'; this.payload = p; this.onConflict = o.onConflict; return this; }
  single() { this.unico = 'single'; return this; }
  maybeSingle() { this.unico = 'maybe'; return this; }
  then(res, rej) { return Promise.resolve(this.ejecutar()).then(res, rej); }
  filas() { return (BD.tablas[this.t] ||= []); }
  ejecutar() {
    const faltan = (BD.columnasInexistentes[this.t] || []);
    if (this.modo === 'insert') {
      const c = faltan.find(k => k in this.payload); if (c) return { data: null, error: errCol(c) };
      const lote = Array.isArray(this.payload) ? this.payload : [this.payload];
      const ids = [];
      for (const p of lote) {
        const fila = { ...p }; if (fila.id == null) fila.id = Math.max(0, ...this.filas().map(r => r.id || 0)) + 1;
        if (this.filas().some(r => r.id === fila.id)) return { data: null, error: { code: '23505', message: 'duplicate key' } };
        this.filas().push(fila); ids.push({ id: fila.id });
      }
      return { data: this.unico ? ids[0] : ids, error: null };
    }
    if (this.modo === 'upsert') {
      const claves = String(this.onConflict || 'id').split(',').map(c => c.trim());
      const i = this.filas().findIndex(r => claves.every(c => r[c] === this.payload[c]));
      if (i >= 0) Object.assign(this.filas()[i], this.payload); else this.filas().push({ ...this.payload });
      return { data: null, error: null };
    }
    if (this.modo === 'delete') {
      const quedan = this.filas().filter(r => !this.filtros.every(f => f(r)));
      BD.tablas[this.t] = quedan;
      return { data: null, error: null };
    }
    if (this.modo === 'update') {
      const c = faltan.find(k => k in this.payload); if (c) return { data: null, error: errCol(c) };
      const afectadas = this.filas().filter(r => this.filtros.every(f => f(r)));
      afectadas.forEach(r => Object.assign(r, this.payload));
      return { data: this.retorna ? afectadas.map(r => ({ id: r.id })) : null, error: null };
    }
    const c = faltan.find(k => new RegExp(`\\b${k}\\b`).test(this.cols)); if (c) return { data: null, error: errColSel(c) };
    let filas = this.filas().filter(r => this.filtros.every(f => f(r)));
    for (const [col, dir] of [...this.ordenes].reverse()) filas.sort((a, b) => ((a[col] > b[col]) - (a[col] < b[col])) * dir);
    if (this.opts.count && this.opts.head) return { data: null, count: filas.length, error: null };
    if (this.lim != null) filas = filas.slice(0, this.lim);
    if (this.rango) filas = filas.slice(this.rango[0], this.rango[1] + 1);
    if (BD.maxRows) filas = filas.slice(0, BD.maxRows);
    const emb = [...this.cols.matchAll(/(\w+)\(([^)]*)\)/g)];
    filas = filas.map(r => { const o = { ...r }; if (this.t === 'practicas' && !('firmada' in o)) o.firmada = o.firma != null; for (const [, tabla] of emb) { const rel = (BD.tablas[tabla] || []).find(x => x.id === r[FK[tabla]]); o[tabla] = rel || null; } return o; });
    if (this.unico) return { data: filas[0] || null, error: this.unico === 'single' && !filas[0] ? { code: 'PGRST116', message: 'no rows' } : null };
    return { data: filas, error: null };
  }
}
export function createClient() {
  return {
    from: t => new Consulta(t),
    rpc: async (n, params) => { BD.rpc.push(n); const f = BD.funciones[n]; return f ? f(params) : { data: null, error: null }; },
    auth: {}
  };
}
