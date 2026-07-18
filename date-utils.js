// ─── UTILIDADES DE FECHA (puras, sin dependencias) ─────────────────────────
// Las fechas del proyecto son strings 'YYYY-MM-DD' sin zona horaria (ver
// CLAUDE.md). `new Date('YYYY-MM-DD')` interpreta el string en UTC y puede
// desplazar el día al convertir a hora local, así que aquí se parsean los
// componentes a mano y se opera con una fecha local.
//
// Se carga como <script> normal en index.html (antes de renderer.js, sin
// bundler) para tener `sumarDiasFecha` como función global en el renderer,
// y también se puede `require()` desde Node (tests, u otros módulos) gracias
// al guard de module.exports de abajo.

function sumarDiasFecha(fechaStr, dias) {
  const [y, m, d] = fechaStr.split('-').map(Number);
  const fecha = new Date(y, m - 1, d);
  fecha.setDate(fecha.getDate() + dias);
  const yy = fecha.getFullYear();
  const mm = String(fecha.getMonth() + 1).padStart(2, '0');
  const dd = String(fecha.getDate()).padStart(2, '0');
  return `${yy}-${mm}-${dd}`;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { sumarDiasFecha };
}
