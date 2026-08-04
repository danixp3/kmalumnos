// ─── BUSCADOR GLOBAL DE LA BARRA DE TÍTULO ──────────────────────────────────
// Filtra secciones Y funciones concretas de la app y navega directamente a
// ellas (incluida la pestaña y, si procede, haciendo scroll hasta la tarjeta y
// resaltándola). Reutiliza navegarA() de dashboard.js.

// Catálogo de destinos.
//   page   = data-page de la sidebar (obligatorio)
//   tab    = pestaña dentro de la página (opcional)
//   anchor = id de un elemento al que hacer scroll y resaltar (opcional)
//   kw     = palabras clave/sinónimos para el filtro
const BUSCADOR_DESTINOS = [
  // Inicio
  { titulo: 'Inicio', sub: 'Panel principal', page: 'dashboard', kw: 'inicio panel principal dashboard resumen home graficos accesos rapidos' },

  // Registro rápido
  { titulo: 'Registro Rápido', sub: 'Apuntar prácticas del día', page: 'registro-rapido', kw: 'registro rapido apuntar practicas dia entrada rapida' },

  // Alumnos
  { titulo: 'Alumnos', sub: 'Lista de alumnos', page: 'alumnos', kw: 'alumnos alumno estudiantes fichas listado' },
  { titulo: 'Añadir alumno', sub: 'Alumnos', page: 'alumnos', anchor: 'a-nombre', kw: 'anadir agregar nuevo alumno crear alta' },

  // Vehículos
  { titulo: 'Vehículos', sub: 'Flota y odómetros', page: 'vehiculos', kw: 'vehiculos vehiculo coches coche flota odometro matricula' },
  { titulo: 'Añadir vehículo', sub: 'Vehículos', page: 'vehiculos', anchor: 'v-nombre', kw: 'anadir agregar nuevo vehiculo coche crear alta matricula' },
  { titulo: 'Relleno masivo de km', sub: 'Vehículos', page: 'vehiculos', anchor: 'veh-relleno', kw: 'relleno masivo kilometros km blanco generar odometro rellenar' },

  // Profesores
  { titulo: 'Profesores', sub: 'Lista de profesores', page: 'profesores', kw: 'profesores profesor instructores docentes' },
  { titulo: 'Añadir profesor', sub: 'Profesores', page: 'profesores', anchor: 'pf-nombre', kw: 'anadir agregar nuevo profesor crear alta' },
  { titulo: 'Estadísticas de profesores', sub: 'Profesores', page: 'profesores', anchor: 'profesores-stats-card', kw: 'estadisticas profesores rendimiento practicas impartidas' },

  // Pagos
  { titulo: 'Deudas', sub: 'Pagos', page: 'pagos', tab: 'deudas', kw: 'pagos deudas dinero saldo cobrar adeudado alumnos' },
  { titulo: 'Tarifas', sub: 'Pagos', page: 'pagos', tab: 'tarifas', kw: 'tarifas precios permiso circulacion pista coste pagos' },

  // Prácticas
  { titulo: 'Prácticas', sub: 'Todas las prácticas con filtros', page: 'practicas-global', kw: 'practicas todas global filtros buscar clases' },

  // Kilómetros
  { titulo: 'Mapa del vehículo', sub: 'Kilómetros', page: 'kilometros', tab: 'mapa', kw: 'kilometros km mapa vehiculo timeline linea tiempo odometro' },
  { titulo: 'Conflictos de km', sub: 'Kilómetros', page: 'kilometros', tab: 'conflictos', kw: 'kilometros conflictos solapamientos errores km incoherencias' },

  // Historial
  { titulo: 'Historial', sub: 'Registro de operaciones', page: 'logs', kw: 'historial logs registro operaciones cambios' },
  { titulo: 'Borrar historial', sub: 'Historial', page: 'logs', kw: 'borrar limpiar vaciar historial logs' },

  // Importar y exportar
  { titulo: 'Importar datos', sub: 'Importar y exportar', page: 'datos', tab: 'importar', kw: 'importar datos csv cargar subir' },
  { titulo: 'Exportar datos', sub: 'Importar y exportar', page: 'datos', tab: 'exportar', kw: 'exportar datos csv descargar copia' },
  { titulo: 'Comparar datos', sub: 'Importar y exportar', page: 'datos', tab: 'comparar', kw: 'comparar datos diferencias' },

  // Ajustes
  { titulo: 'Ajustes', sub: 'Configuración de la app', page: 'ajustes', kw: 'ajustes configuracion opciones preferencias' },
  { titulo: 'Sincronizar ahora', sub: 'Ajustes · Sincronización', page: 'ajustes', anchor: 'aj-sincronizacion', kw: 'sincronizar sync nube ahora subir todo cloud supabase' },
  { titulo: 'Cuenta de empresa', sub: 'Ajustes · Sincronización', page: 'ajustes', anchor: 'cuenta-empresa-estado', kw: 'cuenta empresa iniciar sesion login crear registrarse credenciales' },
  { titulo: 'Guardar copia de seguridad', sub: 'Ajustes', page: 'ajustes', anchor: 'aj-guardar-backup', kw: 'guardar copia seguridad backup exportar json respaldo' },
  { titulo: 'Restaurar último backup', sub: 'Ajustes', page: 'ajustes', anchor: 'aj-restaurar-ultimo', kw: 'restaurar ultimo backup copia seguridad reciente recuperar' },
  { titulo: 'Restaurar copia de seguridad', sub: 'Ajustes', page: 'ajustes', anchor: 'aj-restaurar-backup', kw: 'restaurar copia seguridad backup archivo recuperar cargar' },
  { titulo: 'Buscar actualizaciones', sub: 'Ajustes', page: 'ajustes', anchor: 'aj-actualizaciones', kw: 'actualizaciones actualizar version update buscar' },
  { titulo: 'Preferencias', sub: 'Ajustes', page: 'ajustes', anchor: 'aj-preferencias', kw: 'preferencias rango km tarjetas panel graficos personalizar dashboard' },
  { titulo: 'Volver a ver el tutorial', sub: 'Ajustes', page: 'ajustes', anchor: 'aj-preferencias', kw: 'tutorial ayuda guia reiniciar volver ver' },
];

const ICONO_BUSCADOR_RES = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>';

let buscadorIndiceActivo = -1;
let buscadorResultados = [];

function normalizarBuscador(s) {
  return (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
}

function filtrarDestinos(q) {
  const t = normalizarBuscador(q).trim();
  if (!t) return [];                 // sin texto → no se muestra nada
  const terminos = t.split(/\s+/);
  return BUSCADOR_DESTINOS.filter(d => {
    const heno = normalizarBuscador(d.titulo + ' ' + d.sub + ' ' + d.kw);
    return terminos.every(term => heno.includes(term));
  });
}

function renderResultadosBuscador() {
  const cont = document.getElementById('cir-search-results');
  const wrap = document.getElementById('cir-search');
  if (!cont) return;
  if (!buscadorResultados.length) {
    cont.innerHTML = '<div class="cir-res-empty">Sin resultados</div>';
  } else {
    cont.innerHTML = buscadorResultados.map((d, i) => (
      '<div class="cir-res' + (i === buscadorIndiceActivo ? ' active' : '') + '" role="option" data-idx="' + i + '">' +
        '<div class="cir-res-icon">' + ICONO_BUSCADOR_RES + '</div>' +
        '<div class="cir-res-text">' +
          '<span class="cir-res-title">' + esc(d.titulo) + '</span>' +
          '<span class="cir-res-sub">' + esc(d.sub) + '</span>' +
        '</div>' +
      '</div>'
    )).join('');
    cont.querySelectorAll('.cir-res').forEach(el => {
      el.addEventListener('click', () => irADestinoBuscador(buscadorResultados[+el.dataset.idx]));
    });
  }
  cont.classList.remove('hidden');
  if (wrap) wrap.setAttribute('aria-expanded', 'true');
}

function abrirBuscador() {
  const input = document.getElementById('cir-search-input');
  const q = input ? input.value : '';
  // Solo mostramos resultados a partir de la primera letra escrita.
  if (!normalizarBuscador(q).trim()) { cerrarBuscador(); return; }
  buscadorResultados = filtrarDestinos(q);
  buscadorIndiceActivo = -1;
  renderResultadosBuscador();
}

function cerrarBuscador() {
  const cont = document.getElementById('cir-search-results');
  const wrap = document.getElementById('cir-search');
  if (cont) cont.classList.add('hidden');
  if (wrap) wrap.setAttribute('aria-expanded', 'false');
  buscadorIndiceActivo = -1;
}

function resaltarDestino(anchor) {
  if (!anchor) return;
  const el = document.getElementById(anchor);
  if (!el) return;
  requestAnimationFrame(() => {
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    el.classList.remove('cir-flash');
    // reinicia la animación aunque se repita el mismo destino
    void el.offsetWidth;
    el.classList.add('cir-flash');
    setTimeout(() => el.classList.remove('cir-flash'), 1700);
    if (typeof el.focus === 'function' && /^(INPUT|SELECT|TEXTAREA)$/.test(el.tagName)) {
      try { el.focus({ preventScroll: true }); } catch (e) { el.focus(); }
    }
  });
}

function irADestinoBuscador(d) {
  if (!d) return;
  navegarA(d.page, d.tab);
  if (d.page === 'pagos' && d.tab && typeof cambiarTabPagos === 'function') cambiarTabPagos(d.tab);
  resaltarDestino(d.anchor);
  const input = document.getElementById('cir-search-input');
  if (input) { input.value = ''; input.blur(); }
  cerrarBuscador();
}

document.addEventListener('DOMContentLoaded', () => {
  const input = document.getElementById('cir-search-input');
  if (!input) return;

  input.addEventListener('input', abrirBuscador);
  input.addEventListener('focus', abrirBuscador);

  input.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (!buscadorResultados.length) return;
      buscadorIndiceActivo = (buscadorIndiceActivo + 1) % buscadorResultados.length;
      renderResultadosBuscador();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (!buscadorResultados.length) return;
      buscadorIndiceActivo = (buscadorIndiceActivo - 1 + buscadorResultados.length) % buscadorResultados.length;
      renderResultadosBuscador();
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (!buscadorResultados.length) return;
      const idx = buscadorIndiceActivo >= 0 ? buscadorIndiceActivo : 0;
      irADestinoBuscador(buscadorResultados[idx]);
    } else if (e.key === 'Escape') {
      input.value = '';
      input.blur();
      cerrarBuscador();
    }
  });

  // Cerrar al hacer clic fuera
  document.addEventListener('click', (e) => {
    const wrap = document.getElementById('tb-search-wrap');
    if (wrap && !wrap.contains(e.target)) cerrarBuscador();
  });

  // Atajo Ctrl/Cmd+K para enfocar el buscador
  document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && (e.key === 'k' || e.key === 'K')) {
      e.preventDefault();
      input.focus();
      input.select();
    }
  });
});
