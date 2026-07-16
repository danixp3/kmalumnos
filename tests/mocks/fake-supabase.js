// Simulador en memoria del cliente de Supabase para testear sync.js
// sin tocar la base de datos real. Soporta las operaciones que usa sync.js:
// select/gt/order/limit, upsert, update().eq(), delete().eq().
module.exports = function makeFakeSupabase(remote) {
  // remote = { online: boolean, tables: { practicas: [], alumnos: [], vehiculos: [], meta: [] } }

  function execute(state) {
    if (!remote.online) {
      return { data: null, error: { message: 'Fallo de red (simulado)' } };
    }
    if (!remote.tables[state.table]) remote.tables[state.table] = [];
    const rows = remote.tables[state.table];

    if (state.op === 'select') {
      let out = rows.filter(r => state.filters.every(f => f(r)));
      if (state.order) {
        const { col, ascending } = state.order;
        out = out.slice().sort((a, b) => {
          if (a[col] === b[col]) return 0;
          return (a[col] < b[col] ? -1 : 1) * (ascending ? 1 : -1);
        });
      }
      return { data: out.map(r => ({ ...r })), error: null };
    }
    if (state.op === 'upsert') {
      const list = Array.isArray(state.payload) ? state.payload : [state.payload];
      for (const item of list) {
        const idx = rows.findIndex(r => r.id === item.id);
        if (idx === -1) rows.push({ ...item });
        else rows[idx] = { ...rows[idx], ...item };
      }
      return { data: null, error: null };
    }
    if (state.op === 'update') {
      rows.forEach((r, i) => {
        if (state.filters.every(f => f(r))) rows[i] = { ...r, ...state.payload };
      });
      return { data: null, error: null };
    }
    if (state.op === 'delete') {
      remote.tables[state.table] = rows.filter(r => !state.filters.every(f => f(r)));
      return { data: null, error: null };
    }
    return { data: null, error: { message: `Operación no soportada: ${state.op}` } };
  }

  function builder(table) {
    const state = { table, op: 'select', filters: [], payload: null, order: null };
    const api = {
      select() { state.op = 'select'; return api; },
      limit() { return api; },
      gt(col, val) { state.filters.push(r => String(r[col] ?? '') > val); return api; },
      eq(col, val) { state.filters.push(r => r[col] === val); return api; },
      order(col, opts = {}) { state.order = { col, ascending: opts.ascending !== false }; return api; },
      upsert(payload) { state.op = 'upsert'; state.payload = payload; return api; },
      update(payload) { state.op = 'update'; state.payload = payload; return api; },
      delete() { state.op = 'delete'; return api; },
      // "thenable": permite hacer await directamente sobre la cadena, como supabase-js
      then(resolve, reject) { return Promise.resolve(execute(state)).then(resolve, reject); }
    };
    return api;
  }

  const auth = {
    async signInWithPassword({ email, password }) {
      if (!remote.online) return { data: null, error: { message: 'Fallo de red (simulado)' } };
      if (remote.authOk === false) return { data: null, error: { message: 'Invalid login credentials' } };
      remote.lastLogin = { email, password };
      return { data: { user: { email } }, error: null };
    }
  };

  return { from: builder, auth };
};
