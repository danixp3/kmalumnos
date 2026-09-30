# Inventario de estilo de las dos interfaces (rediseño 2026-09-29)

Localizar siempre por **anclas** (cadenas literales) con Grep + Read parcial; los números de línea caducan. Diseño de referencia: carpeta `REDESIGN/` (PDFs + HTML de Claude Design), guardada en la rama `redesign-assets` del repo (no forma parte de la app).

**Sistema común (escritorio y móvil):** paleta cálida + **tinta oscura + ámbar**. Fuentes locales (funcionan sin conexión; carpetas `fonts/` y `web-remote/fonts/`): **Barlow** (texto), **Barlow Condensed** (títulos y cifras grandes) e **IBM Plex Mono** (km, horas, matrículas). Al añadir fuentes, incluirlas en `build.files` de `package.json` (`"fonts/**/*"`).

**Regla de identidad global: NADA de emojis en la UI** (excepto los botones/etiquetas históricos que ya los llevan). Iconografía SVG inline estilo Lucide (`stroke="currentColor"`, trazo 2). Los km y las horas siempre en mono; los kilómetros con separador de miles (`fmtMiles`).

**Tokens (mismos nombres de concepto en ambas):** tinta `#14161B` · ámbar `#FFB81C` (acción principal y "ahora"), ámbar fuerte `#E09A00`, texto sobre ámbar = tinta, ámbar oscuro legible `#8A5800`, suave `#FFF3D1` · fondo `#F3F2EE` · tarjeta `#FFFFFF` · línea `#E3E1DB` · ok `#1D6B4F`/`#E2F1E9` · error `#B42318`/`#FDECEA` · info `#1E4FB8`/`#E7EDFB` · apagado `#5E6068`.

## Escritorio — index.html (solo HTML) + styles.css

**El CSS vive en `styles.css`** con tres bloques de tema: `:root {` (claro), `body[data-theme="oscuro"]` y `body[data-theme="negro"]` (selector de tema en Ajustes, persistencia en `ui-prefs.json`; ver `renderer/utils-ui.js` `TEMA`). **Al crear un componente, definir sus colores como variables en los TRES bloques**; nada de colores duros salvo en la ficha imprimible (`FICHA IMPRIMIBLE DEL ALUMNO`, siempre blanco/negro). Variables clave: `--accent*` (ámbar), `--primary` (tinta; `--on-primary` = texto sobre ella), `--success/--danger/--warn(-light)`, `--nav-*` + `--sidebar-*` (navegación oscura), `--text`, `--text-muted`, `--border`, `--bg`, `--card`, y la paleta de gráficos `--chart-series-1..8`.

**Marco de la app:** barra de título propia `#titlebar` (`frame:false`, 32 px, `-webkit-app-region: drag`, `z-index:300`, con buscador global `.cir-search`) + `#sidebar` **oscuro** con grupos plegables (`.nav-section[data-grupo]`, `.nav-group`, `.nav-sep`; estado en localStorage `kmalumnos_nav_grupos`, `navPlegarGrupo` en `renderer/estado.js`) + `#app` a `calc(100vh - 32px)`. Los hijos directos de `#sidebar nav` no se encogen (`flex-shrink:0`); los grupos se pliegan para que quepa todo.

**Cabecera de página:** `.page-header` (sticky, título en Barlow Condensed + acciones a la derecha). Cada vista = `<div id="page-XXX" class="page">`.

**Componentes globales (styles.css, ancla → uso):**
- `.card` / `.card-title` · `.stat` / `.kpi` (`.kpi-val`, `.kpi-unit`: cifra grande condensada + unidad) · `.toolbar` · `.seg` (pestañas segmentadas; `renderer/*` las pintan con `onclick` de cambio de pestaña).
- `.btn-primary` = **ámbar con texto tinta**; `.btn-secondary` contorno; en tablas `td .btn.btn-sm` contorneado y acciones raras en `details.menu-fila` (`⋯`, se cierra con el manejador global de `utils-ui.js`).
- `.pill` + `-dark/-warn/-ok/-err/-info/-line` y `.pill-dot` (estado); `pillEstadoAlumno` en `renderer/alumnos.js`.
- **`.placa` / `.placa-e` / `.placa-num` / `.placa-lg`** = matrícula europea; helper `placaHTML(matricula)` en `utils-ui.js` (úsalo, no copies el HTML).
- Modales: `.overlay` + `.modal` (`.modal-ancho` para fichas, `max-height:90vh` con scroll). Toasts y diálogos propios (`confirmar/avisar/pedirTexto`, nunca `alert`/`confirm` nativos).
- Helpers de formato compartidos (`renderer/utils-ui.js`): `fmtMiles, fmtDec, fechaCorta, diaMes, hoyISO, diasEntre, fechaRelativa, iniciales, placaHTML, esc`.

**Pantallas rediseñadas (estructura → anclas):**
- **Panel** (`#page-dashboard`): `#panel-kpis` (4 KPIs del día), `#panel-dias-body` (prácticas por día, `panelVista`), `#panel-ruta-lista` ("Ahora en ruta" = prácticas en curso), `#dash-alertas` (avisos), `#panel-examenes`, `#dash-stats-extra`. Datos: `db.getPanel` → IPC `get-panel`. Los 5 gráficos configurables (`renderer/graficos.js`) siguen en el Panel.
- **Alumnos** (`#page-alumnos`): pestañas `#alumnos-tabs` (Activos/…, `PREDICADOS_TAB_ALUMNOS`), filtros, `#tabla-alumnos` con bono y estado, pie `#alumnos-pie`. Alta en modal `#modal-alumno-nuevo` (`abrirNuevoAlumno`). Datos: `getAlumnosLista`.
- **Ficha del alumno** (`#view-practicas`): cabecera `#ficha-cab`, progreso, km por clase `#ficha-kmclase`, calendario `.cal-*`, próximas clases `.prox-*`, observaciones `.obs-*`, tabla de prácticas. Datos: `getFichaAlumno`. Las acciones antiguas (económico, libro, ficha DGT, imprimir…) siguen en la ficha/menú.
- **Prácticas** (`#page-practicas-global`): `#pg-tabs`, filas desplegables `.fila-pg` / `.pg-detalle`, paginación (`PG_TAM_PAGINA=25`), nota editable (`setNotaPractica`).
- **Vehículos** (`#page-vehiculos`): tarjetas con matrícula `#veh-tarjetas` (`.veh-*`), línea de **continuidad del cuentakilómetros** `#veh-continuidad` (`.cont-*`, marca huecos entre el km final de una clase y el inicial de la siguiente), resumen del mes `#veh-resumen`/`#tabla-vehiculos`, relleno masivo `#veh-relleno`, análisis `#veh-analisis`. Datos: `getPanelVehiculos`.
- El resto de secciones (Agenda, Exámenes, Profesores, Bonos, Caja, CRM, Caducidades, Informes, Jornada, Ajustes, Historial…) heredan el sistema visual por los componentes globales; los colores duros antiguos se sustituyeron por variables.

**Modelo "práctica en curso" (aplica a UI y datos):** implícito, sin columna nueva — `km_inicial>0 && km_final==0 && fecha==hoy` (`esPracticaEnCurso` en `db/core.js`); con fecha anterior = "sin cerrar". "Sin km" = ambos 0. Pintar "en curso" con `.pill-dark` + `.pill-dot` ámbar.

**⚠ Acoplamiento con renderer/:** el contenido dinámico se pinta en strings desde `renderer/` (clases y SVG). Si se renombra una clase o cambia la iconografía, `grep` en `renderer/`. Comprobar siempre con `npm run smoke` (arranca la app real) y, si hay entorno gráfico, capturas de las 3 temas.

## Web móvil — web-remote/index.html (CSS, HTML y JS en un archivo)

**Identidad:** misma marca que el escritorio, adaptada a táctil: tinta + ámbar, fondo `#F3F2EE`, tarjetas blancas, botones grandes (mín. 48 px), números en mono, tema oscuro con `setTema()`. Fuentes desde `web-remote/fonts/` (mismo juego que escritorio). Tokens en `:root {` (`--ink --bg --card --line --soft --muted --amber* --ok --err --info --font --font-display --font-mono --tab-h`).

**Layout:** móvil = una columna con barra de pestañas inferior (**Hoy · Alumnos**, `--tab-h:68px`; las vistas de flujo — iniciar, en curso, km final, firma — ocultan la barra: clase `.vista.sin-tab` con relleno inferior para la barra fija de acciones); tablet/horizontal = mismo flujo con **riel lateral** de la jornada (`renderRiel()`).

**Componentes:** `.pill*` (mismas variantes) · `.placa` (matrícula) · `.fila` / `.fila-hora` / `.fila-tit` / `.fila-sub` (filas de lista: hora en mono + título + estado) · `.riel-fila` · **teclado numérico propio** para el km (`tecla(k)`, sin teclado del sistema) · **cronómetro** grande (`tickCrono`) · chips de "lo trabajado" (`TRABAJADO`) · **lienzo de firma** (`iniciarLienzo`, trazo suavizado) · hoja inferior `#capa` (`abrirHoja`) · `toast()`.

**Otras páginas web:** `alumno.html` (portal del alumno, OTP por email), `reset-password.html`, `email-confirmado.html` — restiladas con los mismos tokens y fuentes.

## Nota común

Cambiar "el color de la app" = tocar tokens en `styles.css` (3 bloques de tema) **y** `:root` de `web-remote/index.html` (+ las 3 páginas auxiliares). Logo compartido: volante + birrete + móvil (`icon.png`, `web-remote/logo.png`, generados con `img/generar-iconos.js`).
