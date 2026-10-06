// ─── MENÚ LATERAL PERSONALIZABLE ─────────────────────────────────────────────
// El propietario elige qué funciones se ven en el menú (Ajustes → Menú lateral o
// el botón «Personalizar menú» del propio menú). Ocultar NO borra ni desactiva
// nada: la sección sigue funcionando y se puede volver a mostrar. Preferencia
// de este PC (localStorage), como el resto de preferencias de interfaz.
// También: las páginas "hermanas" (Agenda semanal, Generar km) no tienen
// entrada propia; al abrirlas se ilumina la de su sección (data-hermano-de).

const MENU_OCULTO_KEY = 'kmalumnos_menu_oculto';
const MENU_FIJOS = ['dashboard', 'alumnos', 'ajustes']; // siempre visibles
const MENU_BASICO = ['dashboard', 'practicas-global', 'alumnos', 'vehiculos', 'kilometros', 'registro-rapido', 'reservas', 'profesores', 'puesta-en-marcha', 'migracion', 'datos', 'ajustes'];
const MENU_DESCRIPCIONES = {
  'dashboard': 'Resumen del día, avisos y gráficos',
  'practicas-global': 'Todas las prácticas con filtros',
  'alumnos': 'Fichas, progreso y documentos',
  'vehiculos': 'Flota, cuentakilómetros y consumo',
  'kilometros': 'Mapa de km, conflictos, cuadrar y generar km',
  'registro-rapido': 'Apuntar las prácticas del día desde el PC',
  'reservas': 'Citas y solicitudes (lista y semana)',
  'examenes': 'Convocatorias, resultados y tasas',
  'pagos': 'Deudas, tarifas y cobros por alumno',
  'bonos': 'Packs de clases prepagadas',
  'caja': 'Arqueo diario y formas de pago',
  'profesores': 'Equipo y sus estadísticas',
  'jornada': 'Fichaje de entrada y salida',
  'vencimientos': 'ITV, seguros, psicotécnicos, DNI…',
  'crm': 'Interesados y captación de alumnos',
  'puesta-en-marcha': 'Primeros pasos con los datos reales',
  'migracion': 'Alumnos y clases desde el programa anterior',
  'informes': 'Informes en PDF/CSV y libro de ventas',
  'datos': 'Importar, exportar y comparar CSV',
  'logs': 'Operaciones automáticas y conflictos',
  'ajustes': 'Configuración de la app'
};

function getMenuOculto() {
  try { const v = JSON.parse(localStorage.getItem(MENU_OCULTO_KEY) || '[]'); return Array.isArray(v) ? v : []; } catch (e) { return []; }
}
function setMenuOculto(lista) {
  try { localStorage.setItem(MENU_OCULTO_KEY, JSON.stringify([...new Set(lista)].filter(p => !MENU_FIJOS.includes(p)))); } catch (e) {}
  aplicarMenu();
}
// ¿Se ve esta página en el menú? (las hermanas siguen a su sección)
function paginaVisibleEnMenu(page) {
  const link = document.querySelector(`#sidebar nav a[data-page="${page}"]`);
  const propia = link && link.dataset.hermanoDe ? link.dataset.hermanoDe : page;
  return MENU_FIJOS.includes(propia) || !getMenuOculto().includes(propia);
}

function aplicarMenu() {
  const ocultas = new Set(getMenuOculto());
  document.querySelectorAll('#sidebar nav a[data-page]').forEach(a => {
    const propia = a.dataset.hermanoDe || a.dataset.page;
    a.classList.toggle('nav-oculto', ocultas.has(propia) && !MENU_FIJOS.includes(propia));
  });
  // Un grupo sin nada visible no enseña ni su cabecera.
  document.querySelectorAll('#sidebar .nav-group').forEach(g => {
    const hay = [...g.querySelectorAll('a[data-page]:not(.nav-hermano)')].some(a => !a.classList.contains('nav-oculto'));
    g.classList.toggle('nav-vacio', !hay);
    const cab = document.querySelector(`#sidebar .nav-section[data-grupo="${g.dataset.grupo}"]`);
    if (cab) cab.classList.toggle('nav-vacio', !hay);
  });
}

// Estructura del menú tal cual está en el HTML (título de grupo → páginas).
function estructuraMenu() {
  const grupos = [{ titulo: 'Accesos principales', paginas: [] }];
  for (const el of document.querySelectorAll('#sidebar nav > a[data-page]:not(.nav-hermano), #sidebar nav > .nav-section')) {
    if (el.classList.contains('nav-section')) {
      const grupo = document.querySelector(`#sidebar .nav-group[data-grupo="${el.dataset.grupo}"]`);
      grupos.push({
        titulo: el.textContent.trim(),
        paginas: [...grupo.querySelectorAll('a[data-page]:not(.nav-hermano)')].map(a => ({ page: a.dataset.page, nombre: a.textContent.trim() }))
      });
    } else {
      grupos[0].paginas.push({ page: el.dataset.page, nombre: el.textContent.trim() });
    }
  }
  return grupos;
}

function renderPersonalizarMenu() {
  const cont = document.getElementById('menu-opciones');
  if (!cont) return;
  const cajon = document.getElementById('pref-cajon-barra');
  if (cajon && typeof cajonActivado === 'function') cajon.checked = cajonActivado();
  const ocultas = new Set(getMenuOculto());
  cont.innerHTML = estructuraMenu().map(g => `
    <div class="menu-grupo">
      <div class="menu-grupo-tit">${esc(g.titulo)}</div>
      ${g.paginas.map(p => {
        const fijo = MENU_FIJOS.includes(p.page);
        const on = fijo || !ocultas.has(p.page);
        return `<label class="menu-op${fijo ? ' fijo' : ''}">
          <span class="menu-op-txt"><b>${esc(p.nombre)}</b><small>${esc(MENU_DESCRIPCIONES[p.page] || '')}</small></span>
          ${fijo ? '<span class="pill pill-line">Siempre</span>'
                 : `<span class="interruptor"><input type="checkbox" ${on ? 'checked' : ''} onchange="alternarPaginaMenu('${p.page}', this.checked)" aria-label="Mostrar ${esc(p.nombre)}"><i></i></span>`}
        </label>`;
      }).join('')}
    </div>`).join('');
}

function alternarPaginaMenu(page, visible) {
  const lista = getMenuOculto().filter(p => p !== page);
  if (!visible) lista.push(page);
  setMenuOculto(lista);
}

function aplicarPresetMenu(preset) {
  const todas = estructuraMenu().flatMap(g => g.paginas.map(p => p.page));
  setMenuOculto(preset === 'basico' ? todas.filter(p => !MENU_BASICO.includes(p)) : []);
  renderPersonalizarMenu();
}

function abrirPersonalizarMenu() {
  navegarA('ajustes');
  if (typeof ajustesAbrir === 'function') ajustesAbrir('menu');
}

// Al abrir una página hermana se marca también la entrada de su sección.
function marcarHermanoActivo(link) {
  if (link && link.dataset.hermanoDe) {
    document.querySelector(`#sidebar nav a[data-page="${link.dataset.hermanoDe}"]`)?.classList.add('active');
  }
}

aplicarMenu();
