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
  { titulo: 'Relleno masivo de km', sub: 'Kilómetros → Asistente', page: 'kilometros', tab: 'asistente', kw: 'relleno masivo kilometros km blanco generar odometro rellenar encadenado' },

  // Profesores
  { titulo: 'Profesores', sub: 'Lista de profesores', page: 'profesores', kw: 'profesores profesor instructores docentes' },
  { titulo: 'Añadir profesor', sub: 'Profesores', page: 'profesores', anchor: 'pf-nombre', kw: 'anadir agregar nuevo profesor crear alta' },
  { titulo: 'Estadísticas de profesores', sub: 'Profesores', page: 'profesores', anchor: 'profesores-stats-card', kw: 'estadisticas profesores rendimiento practicas impartidas' },

  // Pagos
  { titulo: 'Deudas', sub: 'Pagos', page: 'pagos', tab: 'deudas', kw: 'pagos deudas dinero saldo cobrar adeudado alumnos' },
  { titulo: 'Tarifas', sub: 'Pagos', page: 'pagos', tab: 'tarifas', kw: 'tarifas precios permiso circulacion pista coste pagos' },

  // Prácticas
  { titulo: 'Prácticas', sub: 'Todas las prácticas con filtros', page: 'practicas-global', kw: 'practicas todas global filtros buscar clases' },

  // Agenda
  { titulo: 'Agenda', sub: 'Reservas y solicitudes de práctica', page: 'reservas', kw: 'agenda reservas cita citas solicitud solicitudes confirmar practica reserva calendario' },

  // Kilómetros
  { titulo: 'Mapa del vehículo', sub: 'Kilómetros', page: 'kilometros', tab: 'mapa', kw: 'kilometros km mapa vehiculo timeline linea tiempo odometro' },
  { titulo: 'Solapes de km', sub: 'Kilómetros', page: 'kilometros', tab: 'conflictos', kw: 'kilometros conflictos solapamientos solapes errores km incoherencias' },
  { titulo: 'Asistente de km', sub: 'Cuentakilómetros coherente de cada coche', page: 'kilometros', tab: 'asistente', kw: 'asistente cuadrar cuadre km kilometros huecos sin asignar solapan solapamientos incoherentes ordenar repartir faltan clases revisar arreglar modo avanzado planning compañeros fantasma sin registrar aprobaron generar generacion rellenar relleno masivo blanco encadenado maximo rango odometro plan combinar' },
  { titulo: 'Ocultar huecos de km', sub: 'Kilómetros', page: 'kilometros', anchor: 'km-ocultar-huecos', kw: 'ocultar huecos km kilometros ruido visual tramos sin explicar esconder' },
  { titulo: 'Añadir una clase olvidada', sub: 'Kilómetros → se encaja sola entre las otras', page: 'kilometros', tab: 'asistente', kw: 'anadir clase olvidada practica meter entre medio encajar km recalcular insertar' },

  // Historial
  { titulo: 'Historial de cambios', sub: 'Registro de operaciones', page: 'logs', kw: 'historial logs registro operaciones cambios auditoria' },
  { titulo: 'Borrar historial', sub: 'Historial', page: 'logs', kw: 'borrar limpiar vaciar historial logs' },

  // Importar y exportar
  { titulo: 'Importar datos', sub: 'Importar y exportar', page: 'datos', tab: 'importar', kw: 'importar datos csv cargar subir' },
  { titulo: 'Exportar datos', sub: 'Importar y exportar', page: 'datos', tab: 'exportar', kw: 'exportar datos csv excel xlsx json descargar copia alumnos profesores pagos examenes jornada gestoria' },
  { titulo: 'Comparar datos', sub: 'Importar y exportar', page: 'datos', tab: 'comparar', kw: 'comparar datos diferencias' },

  // Ajustes
  { titulo: 'Ajustes', sub: 'Configuración de la app', page: 'ajustes', kw: 'ajustes configuracion opciones preferencias' },
  { titulo: 'Sincronizar ahora', sub: 'Ajustes · Sincronización', page: 'ajustes', anchor: 'aj-sincronizacion', kw: 'sincronizar sync nube ahora subir todo cloud supabase' },
  { titulo: 'Cuenta de empresa', sub: 'Ajustes · Sincronización', page: 'ajustes', anchor: 'cuenta-empresa-estado', kw: 'cuenta empresa iniciar sesion login crear registrarse credenciales' },
  { titulo: 'Guardar copia de seguridad', sub: 'Ajustes', page: 'ajustes', anchor: 'aj-guardar-backup', kw: 'guardar copia seguridad backup exportar json respaldo' },
  { titulo: 'Restaurar último backup', sub: 'Ajustes', page: 'ajustes', anchor: 'aj-restaurar-ultimo', kw: 'restaurar ultimo backup copia seguridad reciente recuperar' },
  { titulo: 'Restaurar copia de seguridad', sub: 'Ajustes', page: 'ajustes', anchor: 'aj-restaurar-backup', kw: 'restaurar copia seguridad backup archivo recuperar cargar' },
  { titulo: 'Buscar actualizaciones', sub: 'Ajustes', page: 'ajustes', anchor: 'aj-actualizaciones', kw: 'actualizaciones actualizar version update buscar' },
  { titulo: 'Clases y kilómetros', sub: 'Ajustes', page: 'ajustes', anchor: 'aj-pref-clases', kw: 'preferencias rango km por defecto minutos clase duracion cancelacion plazo devolucion' },
  { titulo: 'Legal y privacidad', sub: 'Ajustes', page: 'ajustes', anchor: 'aj-legal', kw: 'legal privacidad rgpd lopd proteccion datos condiciones aviso cookies encargo tratamiento licencias' },
  { titulo: 'Contrato de enseñanza', sub: 'Ajustes · Legal y privacidad', page: 'ajustes', anchor: 'aj-legal-docs', kw: 'contrato ensenanza alumno firmar articulo 42 modelo documentos' },
  { titulo: 'Hoja de protección de datos', sub: 'Ajustes · Legal y privacidad', page: 'ajustes', anchor: 'aj-legal-docs', kw: 'proteccion datos rgpd clausula informativa consentimiento alumno firmar' },
  { titulo: 'Registro de actividades de tratamiento', sub: 'Ajustes · Legal y privacidad', page: 'ajustes', anchor: 'aj-legal-docs', kw: 'registro actividades tratamiento rat rgpd articulo 30' },
  { titulo: 'Conservación y anonimización de alumnos', sub: 'Ajustes · Legal y privacidad', page: 'ajustes', anchor: 'aj-legal-conservacion', kw: 'conservacion plazo borrar anonimizar suprimir supresion olvido antiguos alumnos rgpd' },
  { titulo: 'Bloqueo con PIN', sub: 'Ajustes · Seguridad de este PC', page: 'ajustes', anchor: 'aj-seguridad', kw: 'pin bloqueo bloquear contraseña seguridad inactividad cerrar sesion dispositivos tablet perdida' },
  { titulo: 'Panel principal', sub: 'Ajustes', page: 'ajustes', anchor: 'aj-pref-panel', kw: 'tarjetas panel graficos personalizar dashboard inicio' },
  { titulo: 'Cobros (matrícula, conceptos, precio por clase, IVA)', sub: 'Ajustes', page: 'ajustes', anchor: 'aj-pref-cobros', kw: 'matricula tasa iva importe cobros conceptos alta soporte informatico tarifas precio clase permiso' },
  { titulo: 'Combustible', sub: 'Ajustes', page: 'ajustes', anchor: 'aj-pref-combustible', kw: 'combustible precio consumo litros coste gasolina diesel' },
  { titulo: 'Zonas de prácticas', sub: 'Ajustes · la web del móvil', page: 'ajustes', anchor: 'aj-zonas', kw: 'zonas recorridas practica web movil centro poligono autovia circuito' },
  { titulo: 'Personalizar menú', sub: 'Ajustes · qué funciones se ven', page: 'ajustes', anchor: 'aj-menu', kw: 'menu lateral ocultar mostrar funciones personalizar barra simplificar' },
  { titulo: 'Datos del centro (DGT)', sub: 'Ajustes', page: 'ajustes', anchor: 'aj-centro-dgt', kw: 'centro autoescuela dgt numero seccion ficha oficial' },
  { titulo: 'Volver a ver el tutorial', sub: 'Ajustes', page: 'ajustes', anchor: 'aj-ayuda', kw: 'tutorial ayuda guia reiniciar volver ver' },

  // Puesta en marcha
  { titulo: 'Puesta en marcha', sub: 'Empezar con los datos reales', page: 'puesta-en-marcha', kw: 'puesta marcha empezar inicio datos reales cuentakilometros odometro clases previas anteriores km iniciales punto partida borrar prueba' },
  { titulo: 'Clases y km anteriores del alumno', sub: 'Puesta en marcha', page: 'puesta-en-marcha', kw: 'clases previas km previos anteriores punto partida numero clase alumno ya empezado' },

  // Traer datos de otro programa
  { titulo: 'Traer datos de otro programa', sub: 'Importar alumnos y clases', page: 'migracion', kw: 'importar migrar migracion cambiar programa anterior gestion excel xls xlsx csv dbf pegar alumnos lista exportar traer otro software competencia' },
  { titulo: 'Importar historial de clases', sub: 'Traer de otro programa', page: 'migracion', kw: 'historial clases anteriores importar programa anterior excel fechas ficha dgt' },
  { titulo: 'Deshacer una importación', sub: 'Traer de otro programa', page: 'migracion', anchor: 'mg-historial-card', kw: 'deshacer importacion quitar alumnos importados error' },
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
    // Las funciones ocultas en el menú (Ajustes → Menú lateral) tampoco salen aquí.
    if (typeof paginaVisibleEnMenu === 'function' && !paginaVisibleEnMenu(d.page)) return false;
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
        '<div class="cir-res-icon">' + (d.alumno ? ICONO_BUSCADOR_ALUMNO : ICONO_BUSCADOR_RES) + '</div>' +
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

// Alumnos (por nombre, DNI, nº de registro o teléfono): salen primero y
// abren su ficha. Se piden aparte; la respuesta vieja de una tecla anterior
// se descarta.
let buscadorTurno = 0;
const ICONO_BUSCADOR_ALUMNO = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="4"/><path d="M4 21v-1a6 6 0 0 1 6-6h4a6 6 0 0 1 6 6v1"/></svg>';
const ESTADO_BUSCADOR = { apto: 'aprobado', aprobado: 'aprobado', baja: 'de baja', inactivo: 'inactivo', no_apto: 'no apto' };

function abrirBuscador() {
  const input = document.getElementById('cir-search-input');
  const q = input ? input.value : '';
  // Solo mostramos resultados a partir de la primera letra escrita.
  if (!normalizarBuscador(q).trim()) { cerrarBuscador(); return; }
  const turno = ++buscadorTurno;
  buscadorResultados = filtrarDestinos(q);
  buscadorIndiceActivo = -1;
  renderResultadosBuscador();
  if (normalizarBuscador(q).trim().length < 2 || !window.api.buscarAlumnosRapido) return;
  window.api.buscarAlumnosRapido(q, 6).then(alumnos => {
    if (turno !== buscadorTurno || !alumnos || !alumnos.length) return;
    const deAlumnos = alumnos.map(a => ({
      titulo: a.nombre,
      sub: ['Alumno', a.n_registro && 'nº ' + a.n_registro, a.dni, ESTADO_BUSCADOR[a.estado]].filter(Boolean).join(' · '),
      alumno: a
    }));
    buscadorResultados = [...deAlumnos, ...filtrarDestinos(q)];
    renderResultadosBuscador();
  }).catch(() => {});
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
  // Ajustes va por secciones: abrir la que contiene el destino.
  if (typeof ajustesAbrirSeccionDe === 'function') ajustesAbrirSeccionDe(el);
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
  if (d.alumno) {
    verFichaDesdePracticas(d.alumno.id, d.alumno.vehiculo_id, d.alumno.nombre);
    const input = document.getElementById('cir-search-input');
    if (input) { input.value = ''; input.blur(); }
    cerrarBuscador();
    return;
  }
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
