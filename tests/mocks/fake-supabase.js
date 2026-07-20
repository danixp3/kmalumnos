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
        // Hook opcional para los tests: simula que "mientras tanto" otro
        // dispositivo escribió también sobre esta fila (la ventana de red real
        // entre nuestra subida y nuestra bajada, dentro del mismo sync()).
        if (typeof remote._onUpsert === 'function') remote._onUpsert(state.table, item);
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
      // remote.authUserId simula el uid de la cuenta (empresa) que inicia sesión;
      // los tests que no lo necesitan usan un valor por defecto estable.
      return { data: { user: { id: remote.authUserId || 'uid-test', email } }, error: null };
    },
    async signUp({ email, password, options }) {
      remote.lastSignUpRedirectTo = options && options.emailRedirectTo;
      if (!remote.online) return { data: null, error: { message: 'Fallo de red (simulado)' } };
      if (remote.signUpError) return { data: null, error: { message: remote.signUpError } };
      const uid = remote.authUserId || 'uid-nueva-empresa';
      if (remote.signUpExists) {
        // Simula el comportamiento real de Supabase: email ya registrado + confirmaciones
        // activas → usuario con identities vacío, sin error (no filtra qué emails existen).
        return { data: { user: { id: uid, email, identities: [] }, session: null }, error: null };
      }
      if (remote.signUpPending) {
        return { data: { user: { id: uid, email, identities: [{}] }, session: null }, error: null };
      }
      return { data: { user: { id: uid, email, identities: [{}] }, session: { access_token: 'tok-test' } }, error: null };
    },
    async resetPasswordForEmail(email, options) {
      if (!remote.online) return { data: null, error: { message: 'Fallo de red (simulado)' } };
      if (remote.resetPasswordError) return { data: null, error: { message: remote.resetPasswordError } };
      // No se distingue email existente/inexistente (igual que Supabase real):
      // el mock solo registra la llamada para que el test compruebe el redirectTo.
      remote.lastResetPasswordEmail = email;
      remote.lastResetPasswordRedirectTo = options && options.redirectTo;
      return { data: {}, error: null };
    }
  };

  return { from: builder, auth };
};
