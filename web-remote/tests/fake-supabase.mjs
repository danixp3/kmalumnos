// Supabase simulado en memoria: solo lo que usan los endpoints de web-remote/api.
export const BD = { tablas: {}, columnasInexistentes: {}, rpc: [] };
export function reiniciar(tablas = {}, columnasInexistentes = {}) { BD.tablas = JSON.parse(JSON.stringify(tablas)); BD.columnasInexistentes = columnasInexistentes; BD.rpc = []; }

const FK = { alumnos: 'alumno_id', vehiculos: 'vehiculo_id' };
const errCol = c => ({ code: 'PGRST204', message: `Could not find the '${c}' column of 'practicas' in the schema cache` });
const errColSel = c => ({ code: '42703', message: `column practicas.${c} does not exist` });

class Consulta {
  constructor(tabla) { this.t = tabla; this.filtros = []; this.ordenes = []; this.lim = null; this.modo = 'select'; this.cols = '*'; this.opts = {}; this.payload = null; this.unico = null; }
  select(cols = '*', opts = {}) { if (this.modo === 'select') { this.cols = cols; this.opts = opts; } else { this.retorna = cols; } return this; }
  insert(p) { this.modo = 'insert'; this.payload = p; return this; }
  update(p) { this.modo = 'update'; this.payload = p; return this; }
  eq(c, v) { this.filtros.push(r => r[c] === v); return this; }
  neq(c, v) { this.filtros.push(r => r[c] !== v); return this; }
  gt(c, v) { this.filtros.push(r => r[c] > v); return this; }
  gte(c, v) { this.filtros.push(r => r[c] >= v); return this; }
  lt(c, v) { this.filtros.push(r => r[c] < v); return this; }
  in(c, vs) { this.filtros.push(r => vs.includes(r[c])); return this; }
  order(c, o = {}) { this.ordenes.push([c, o.ascending === false ? -1 : 1]); return this; }
  limit(n) { this.lim = n; return this; }
  single() { this.unico = 'single'; return this; }
  maybeSingle() { this.unico = 'maybe'; return this; }
  then(res, rej) { return Promise.resolve(this.ejecutar()).then(res, rej); }
  filas() { return (BD.tablas[this.t] ||= []); }
  ejecutar() {
    const faltan = (BD.columnasInexistentes[this.t] || []);
    if (this.modo === 'insert') {
      const c = faltan.find(k => k in this.payload); if (c) return { data: null, error: errCol(c) };
      const fila = { ...this.payload }; if (fila.id == null) fila.id = Math.max(0, ...this.filas().map(r => r.id || 0)) + 1;
      if (this.filas().some(r => r.id === fila.id)) return { data: null, error: { code: '23505', message: 'duplicate key' } };
      this.filas().push(fila); return { data: this.unico ? { id: fila.id } : [{ id: fila.id }], error: null };
    }
    if (this.modo === 'update') {
      const c = faltan.find(k => k in this.payload); if (c) return { data: null, error: errCol(c) };
      this.filas().filter(r => this.filtros.every(f => f(r))).forEach(r => Object.assign(r, this.payload)); return { data: null, error: null };
    }
    const c = faltan.find(k => new RegExp(`\\b${k}\\b`).test(this.cols)); if (c) return { data: null, error: errColSel(c) };
    let filas = this.filas().filter(r => this.filtros.every(f => f(r)));
    for (const [col, dir] of [...this.ordenes].reverse()) filas.sort((a, b) => ((a[col] > b[col]) - (a[col] < b[col])) * dir);
    if (this.opts.count && this.opts.head) return { data: null, count: filas.length, error: null };
    if (this.lim != null) filas = filas.slice(0, this.lim);
    const emb = [...this.cols.matchAll(/(\w+)\(([^)]*)\)/g)];
    filas = filas.map(r => { const o = { ...r }; for (const [, tabla] of emb) { const rel = (BD.tablas[tabla] || []).find(x => x.id === r[FK[tabla]]); o[tabla] = rel || null; } return o; });
    if (this.unico) return { data: filas[0] || null, error: this.unico === 'single' && !filas[0] ? { code: 'PGRST116', message: 'no rows' } : null };
    return { data: filas, error: null };
  }
}
export function createClient() { return { from: t => new Consulta(t), rpc: async n => { BD.rpc.push(n); return { data: null, error: null }; }, auth: {} }; }
