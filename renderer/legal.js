// ─── LEGAL Y PRIVACIDAD ─────────────────────────────────────────────────────
// · Aceptación de las Condiciones de uso y del Contrato de encargo del
//   tratamiento (cuando cambia VERSION_LEGAL se vuelve a pedir; queda guardada
//   en ajustes_empresa 'legal_aceptacion', sincronizada).
// · Ajustes → Legal y privacidad: textos públicos, documentos para la
//   autoescuela y sus alumnos (hoja de protección de datos, contrato de
//   enseñanza del art. 42 RD 1295/2003, registro de actividades de tratamiento),
//   conservación y anonimización de alumnos, licencias de terceros.
// · Ficha del alumno → Documentos: los mismos documentos con sus datos y
//   «Anonimizar (derecho de supresión)».
// Los PDF los genera main.js (documento-pdf) a partir del HTML de aquí.

const VERSION_LEGAL = '2026-10-07';
const ANIOS_CONSERVACION_KEY = 'km_anios_conservacion';
let legalComprobando = false;

// ── Aceptación de las condiciones ────────────────────────────────────────────
async function comprobarAceptacionLegal() {
  if (legalComprobando) return;
  legalComprobando = true;
  try {
    const estado = await window.api.getEstadoCuenta();
    if (!estado || !estado.conectado) return;
    let ac = await window.api.getAceptacionLegal();
    if (!ac || ac.version !== VERSION_LEGAL) {
      // Puede estar aceptada en otro PC y aún no haber bajado: se sincroniza antes de preguntar
      try { await window.api.syncNow(); } catch (e) { /* sin conexión: se pregunta igual */ }
      ac = await window.api.getAceptacionLegal();
    }
    if (ac && ac.version === VERSION_LEGAL) return;
    await pedirAceptacionLegal(estado.email || '');
  } catch (e) { /* no bloquea la app si algo falla al leer */ } finally { legalComprobando = false; }
}

function pedirAceptacionLegal(email) {
  return new Promise(resolve => {
    let ov = document.getElementById('modal-legal');
    if (!ov) {
      ov = document.createElement('div');
      ov.className = 'overlay'; ov.id = 'modal-legal';
      ov.innerHTML = '<div class="modal modal-legal" role="dialog" aria-modal="true" aria-labelledby="legal-tit"></div>';
      document.body.appendChild(ov);
    }
    const nueva = !email ? '' : ` (${esc(email)})`;
    ov.firstElementChild.innerHTML = `<div class="modal-header"><h3 id="legal-tit">Condiciones de uso y protección de datos</h3></div>
      <p class="legal-txt">Para seguir usando AulaMovil, la autoescuela${nueva} tiene que aceptar sus textos legales. Lo importante:</p>
      <ul class="legal-lista">
        <li>Los datos de tus alumnos, profesores y personal son de la autoescuela: <b>tú eres la responsable</b> y AulaMovil solo los guarda y trata por encargo tuyo, en servidores de la Unión Europea.</li>
        <li>Tienes que informar a tus alumnos (la app genera la <b>hoja de protección de datos</b> y el <b>contrato de enseñanza</b>) y atender sus derechos (exportar o anonimizar sus datos desde su ficha).</li>
        <li>Respondes de que los documentos oficiales (libro de alumnos, fichas de formación con sus km, contrato de enseñanza) reflejen la realidad. Los km que calcula la app quedan marcados.</li>
      </ul>
      <div class="legal-enlaces">
        <button type="button" class="lnk" onclick="window.api.abrirLegal('condiciones')">Condiciones de uso y contratación</button>
        <button type="button" class="lnk" onclick="window.api.abrirLegal('encargo-tratamiento')">Contrato de encargo del tratamiento</button>
        <button type="button" class="lnk" onclick="window.api.abrirLegal('privacidad')">Política de privacidad</button>
      </div>
      <label class="legal-acepto"><input type="checkbox" id="legal-acepto"> He leído y acepto las Condiciones de uso y el Contrato de encargo del tratamiento en nombre de la autoescuela.</label>
      <div class="modal-actions" style="display:flex;justify-content:flex-end;margin-top:14px"><button type="button" class="btn btn-primary" id="legal-aceptar" disabled>Aceptar y continuar</button></div>`;
    const chk = ov.querySelector('#legal-acepto'), btn = ov.querySelector('#legal-aceptar');
    chk.addEventListener('change', () => { btn.disabled = !chk.checked; });
    btn.addEventListener('click', async () => {
      btn.disabled = true;
      await window.api.aceptarLegal(VERSION_LEGAL, email);
      ov.classList.remove('open');
      resolve(true);
    });
    ov.classList.add('open'); // no se cierra al pulsar fuera: hay que aceptar
  });
}

// ── Utilidades para los documentos ───────────────────────────────────────────
const lgEsc = v => esc(v == null ? '' : String(v));
const lgHueco = (v, ancho = 180) => (v ? `<b>${lgEsc(v)}</b>` : `<span class="hueco" style="min-width:${ancho}px"></span>`);
function lgFechaLarga(iso) {
  const d = iso ? new Date(iso + 'T12:00:00') : new Date();
  return d.toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' });
}
function lgCentro() {
  const c = getCentroDatos() || {};
  return {
    nombre: c.razon_social || c.titular || c.denominacion || '',
    comercial: c.denominacion || '',
    cif: c.cif || '', titular: c.titular || '',
    direccion: [c.direccion, [c.codigo_postal, c.poblacion].filter(Boolean).join(' '), c.provincia].filter(Boolean).join(', '),
    poblacion: c.poblacion || '',
    telefono: c.telefono || '', email: c.email || '',
    numero: [c.numero, c.seccion].filter(Boolean).join(' / '), jefatura: c.jefatura || ''
  };
}
const LG_ESTILO = `
  @page { size: A4; margin: 14mm 16mm; }
  body { font-family: Arial, Helvetica, sans-serif; font-size: 10.5pt; line-height: 1.45; color: #111; margin: 0; }
  h1 { font-size: 15pt; margin: 0 0 4px; } h2 { font-size: 11.5pt; margin: 14px 0 4px; border-bottom: 1px solid #999; padding-bottom: 2px; }
  p { margin: 4px 0; } ul { margin: 4px 0 4px 18px; padding: 0; } li { margin: 2px 0; }
  .sub { color: #444; font-size: 9.5pt; margin-bottom: 8px; }
  table { width: 100%; border-collapse: collapse; margin: 6px 0; font-size: 9.5pt; } th, td { border: 1px solid #888; padding: 4px 6px; text-align: left; vertical-align: top; } th { background: #eee; }
  .hueco { display: inline-block; border-bottom: 1px solid #333; height: 1em; vertical-align: bottom; }
  .firmas { display: flex; gap: 24px; margin-top: 18px; } .firmas div { flex: 1; border-top: 1px solid #333; padding-top: 4px; font-size: 9.5pt; min-height: 60px; }
  .casilla { display: inline-block; width: 11px; height: 11px; border: 1px solid #333; margin: 0 4px -1px 10px; }
  .nota { font-size: 8.5pt; color: #555; margin-top: 12px; }
  .salto { page-break-before: always; }`;
function lgDocumento(titulo, cuerpo) {
  return `<!DOCTYPE html><html lang="es"><head><meta charset="utf-8"><title>${lgEsc(titulo)}</title><style>${LG_ESTILO}</style></head><body>${cuerpo}</body></html>`;
}
async function lgGuardarPdf(nombre, html) {
  const r = await window.api.documentoPdf({ html, nombre });
  if (r && !r.ok && !r.canceled) await avisar('No se pudo crear el documento: ' + (r.msg || 'error'));
  return r;
}
function lgAvisoCentro() {
  const c = lgCentro();
  if (c.nombre && c.cif) return true;
  avisar('Rellena antes en Ajustes → Datos del centro (DGT) la razón social o el titular, el CIF/NIF, la dirección y el email: salen en los documentos como responsable de los datos.');
  return false;
}

// ── Hoja informativa de protección de datos (art. 13 RGPD) ──────────────────
function hojaProteccionDatosHTML(a) {
  const c = lgCentro();
  const al = a || {};
  const nombreAl = [al.nombre, al.primer_apellido, al.segundo_apellido].filter(Boolean).join(' ');
  return lgDocumento('Protección de datos', `
    <h1>Información sobre protección de datos</h1>
    <p class="sub">Artículos 13 del Reglamento (UE) 2016/679 (RGPD) y 11 de la Ley Orgánica 3/2018 (LOPDGDD)</p>
    <p>Alumno/a: ${lgHueco(nombreAl, 260)} &nbsp; DNI/NIE: ${lgHueco(al.dni, 110)}</p>
    <h2>Responsable</h2>
    <p>${lgHueco(c.nombre, 220)}${c.comercial && c.comercial !== c.nombre ? ` («${lgEsc(c.comercial)}»)` : ''}, CIF/NIF ${lgHueco(c.cif, 90)}, ${lgHueco(c.direccion, 260)}. Contacto: ${lgHueco(c.email, 160)}${c.telefono ? ' · ' + lgEsc(c.telefono) : ''}.</p>
    <h2>Para qué usamos tus datos y por qué podemos hacerlo</h2>
    <table><tr><th>Finalidad</th><th>Base jurídica</th></tr>
      <tr><td>Gestionar tu matrícula y tu formación teórica y práctica (clases, horarios, coche, profesor, kilómetros, observaciones, firma de cada clase).</td><td>Contrato de enseñanza (art. 6.1.b RGPD).</td></tr>
      <tr><td>Cumplir las obligaciones de las autoescuelas: libro de registro de alumnos, fichas de formación y contrato de enseñanza (arts. 39, 40 y 42 del RD 1295/2003) y los trámites ante la Dirección General de Tráfico (exámenes, tasas).</td><td>Obligación legal (art. 6.1.c RGPD).</td></tr>
      <tr><td>Cobrar, facturar y cumplir las obligaciones contables y fiscales.</td><td>Contrato y obligación legal.</td></tr>
      <tr><td>Avisarte de tus clases y exámenes por teléfono, mensaje o correo.</td><td>Contrato.</td></tr>
      <tr><td>Solo si lo marcas abajo: tu foto en la ficha, usar las restricciones de tu permiso o tu reconocimiento médico para adaptar las clases y enviarte información de cursos y promociones.</td><td>Consentimiento (arts. 6.1.a y 9.2.a RGPD), que puedes retirar cuando quieras.</td></tr>
    </table>
    <p><b>Tu firma:</b> al terminar cada clase firmas en la tablet del profesor; se guarda solo la imagen de la firma para acreditar la clase en tu ficha de formación (no datos biométricos).</p>
    <h2>Quién más los recibe</h2>
    <ul>
      <li>La Dirección General de Tráfico y su Jefatura Provincial${c.jefatura ? ' (' + lgEsc(c.jefatura) + ')' : ''}, para tus exámenes y trámites (obligación legal).</li>
      <li>La Agencia Tributaria, nuestra gestoría y nuestro banco, para cobros y obligaciones fiscales.</li>
      <li>Nuestro proveedor del programa de gestión (AulaMovil), que los trata por encargo nuestro, con servidores en la Unión Europea.</li>
    </ul>
    <p>No los vendemos ni los usamos para decisiones automatizadas.</p>
    <h2>Cuánto tiempo</h2>
    <p>Mientras dure tu formación y, después, los plazos legales: el libro de alumnos se conserva 4 años, las fichas de formación al menos 2 años y la documentación de cobros y facturas 6 años. Después se anonimizan o se borran.</p>
    <h2>Tus derechos</h2>
    <p>Puedes pedirnos ver tus datos, corregirlos, borrarlos cuando ya no sean necesarios, limitar su uso, oponerte a alguno o llevártelos en un archivo, y retirar los consentimientos, escribiendo a ${lgHueco(c.email, 160)} o en el propio centro. Si crees que no te atendemos bien, puedes reclamar ante la Agencia Española de Protección de Datos (www.aepd.es).</p>
    <h2>Consentimientos (opcionales)</h2>
    <p>Usar mi foto en mi ficha de alumno: <span class="casilla"></span> Sí <span class="casilla"></span> No</p>
    <p>Usar las restricciones de mi permiso o de mi reconocimiento médico (p. ej. gafas) para adaptar mis clases: <span class="casilla"></span> Sí <span class="casilla"></span> No</p>
    <p>Recibir información de cursos y promociones de la autoescuela por correo, teléfono o mensajería: <span class="casilla"></span> Sí <span class="casilla"></span> No</p>
    <p style="margin-top:10px">En ${lgHueco(c.poblacion, 120)}, a ${lgFechaLarga()}.</p>
    <div class="firmas"><div>Firma del alumno/a</div><div>Si es menor de 14 años: firma del padre, madre o tutor/a<br>Nombre y DNI: </div></div>
    <p class="nota">Documento generado con AulaMovil. Una copia para el alumno y otra para el centro.</p>`);
}

// ── Contrato de enseñanza (art. 42 RD 1295/2003) ─────────────────────────────
async function contratoEnsenanzaHTML(a) {
  const c = lgCentro();
  const al = a || {};
  const nombreAl = [al.nombre, al.primer_apellido, al.segundo_apellido].filter(Boolean).join(' ');
  const domicilio = [al.direccion, [al.codigo_postal, al.poblacion].filter(Boolean).join(' ')].filter(Boolean).join(', ');
  let conceptos = [], tarifas = [];
  try { conceptos = await getConceptosCobroUI(); } catch (e) { /* sin conceptos */ }
  try { tarifas = await window.api.getTarifas(); } catch (e) { /* sin tarifas */ }
  const permiso = al.permiso || '';
  const precios = [
    ...conceptos.filter(x => x.importe > 0).map(x => [x.nombre, fmtEur(x.importe)]),
    ...tarifas.filter(t => !permiso || t.permiso === permiso).map(t => [`Clase práctica de ${t.tipo === 'pista' ? 'pista' : 'circulación'}${permiso ? '' : ' (permiso ' + t.permiso + ')'}`, fmtEur(t.precio)])
  ];
  const minutos = typeof getDuracionClaseMin === 'function' ? getDuracionClaseMin() : 45;
  const plazo = typeof getCancelPlazoHoras === 'function' ? getCancelPlazoHoras() : 24;
  const devuelve = typeof getCancelDevolucion === 'function' ? getCancelDevolucion() : true;
  return lgDocumento('Contrato de enseñanza', `
    <h1>Contrato de enseñanza</h1>
    <p class="sub">Artículo 42 del Reglamento regulador de las escuelas particulares de conductores (Real Decreto 1295/2003)</p>
    <h2>Partes</h2>
    <p><b>La autoescuela:</b> ${lgHueco(c.nombre, 220)}, CIF/NIF ${lgHueco(c.cif, 90)}${c.numero ? ', nº de escuela ' + lgEsc(c.numero) : ''}, con domicilio en ${lgHueco(c.direccion, 240)}.</p>
    <p><b>El alumno/a:</b> ${lgHueco(nombreAl, 240)}, DNI/NIE ${lgHueco(al.dni, 100)}, nacido/a el ${lgHueco(al.fecha_nacimiento ? fmtFecha(al.fecha_nacimiento) : '', 80)}, con domicilio en ${lgHueco(domicilio, 220)}, teléfono ${lgHueco(al.telefono, 90)} y correo ${lgHueco(al.email, 150)}.</p>
    <p><b>Representante legal</b> (si el alumno es menor de edad): ${lgHueco(al.tutor_nombre, 200)}, DNI ${lgHueco(al.tutor_dni, 100)}.</p>
    <h2>1. Objeto</h2>
    <p>La autoescuela impartirá al alumno la formación teórica y práctica necesaria para obtener el permiso de conducción de la clase ${lgHueco(permiso, 40)}, conforme a la normativa de tráfico y al programa oficial, y le presentará a las pruebas de la Dirección General de Tráfico.</p>
    <h2>2. Precios</h2>
    ${precios.length ? `<table><tr><th>Concepto</th><th>Importe</th></tr>${precios.map(([k, v]) => `<tr><td>${lgEsc(k)}</td><td>${lgEsc(v)}</td></tr>`).join('')}</table>` : '<p>Según la tarifa vigente expuesta en el centro, que el alumno declara conocer.</p>'}
    <p>Las tasas de la Dirección General de Tráfico y el reconocimiento médico se abonan aparte, por su importe oficial. Los precios son los vigentes a la firma; cualquier cambio se comunicará con antelación y no afectará a lo ya pagado.</p>
    <h2>3. Clases prácticas</h2>
    <ul>
      <li>Cada clase práctica dura ${minutos} minutos y se imparte en un vehículo de la autoescuela, con doble mando y seguro, por un profesor titulado.</li>
      <li>Las clases se programan de común acuerdo. El alumno puede anularlas sin coste avisando con al menos ${plazo} horas de antelación; si no avisa a tiempo, la clase podrá cobrarse${devuelve ? '' : ' y no se devolverá su importe'}.</li>
      <li>Al terminar cada clase, el alumno firma su realización. La autoescuela anota fecha, hora, kilómetros y observaciones en la ficha de formación, que el alumno puede consultar.</li>
    </ul>
    <h2>4. Derechos y obligaciones</h2>
    <p><b>El alumno tiene derecho a</b> recibir la formación contratada, conocer su progreso y su ficha de formación, ser presentado a examen cuando esté preparado, darse de baja en cualquier momento recuperando lo pagado por clases o servicios no recibidos (salvo matrícula y tasas ya abonadas) y presentar una reclamación: <b>la autoescuela dispone de hojas de reclamaciones a disposición de los alumnos.</b></p>
    <p><b>El alumno se obliga a</b> asistir con puntualidad, avisar de las anulaciones, pagar los precios acordados, seguir las indicaciones del profesor, aportar la documentación necesaria para los trámites y comunicar los cambios en sus datos y cualquier limitación médica que afecte a la conducción.</p>
    <p><b>La autoescuela se obliga a</b> impartir la formación con medios y profesores autorizados, informar al alumno de su progreso y de las condiciones de examen, conservar su ficha y su expediente y tramitar sus solicitudes ante Tráfico.</p>
    <h2>5. Protección de datos</h2>
    <p>Los datos del alumno se tratan según la hoja de información sobre protección de datos que se le entrega junto con este contrato.</p>
    <h2>6. Ley aplicable</h2>
    <p>Este contrato se rige por la ley española y por la normativa de protección de los consumidores. Se firma por duplicado: un ejemplar para el alumno y otro para la autoescuela (art. 42 RD 1295/2003).</p>
    <p style="margin-top:10px">En ${lgHueco(c.poblacion, 120)}, a ${lgFechaLarga()}.</p>
    <div class="firmas"><div>Por la autoescuela</div><div>El alumno/a</div><div>Representante legal (si es menor)</div></div>
    <p class="nota">Modelo orientativo generado con AulaMovil a partir de los datos de la autoescuela. Revísalo y añade las condiciones propias de tu centro (y las que exija la normativa de consumo de tu comunidad autónoma).</p>`);
}

// ── Registro de actividades de tratamiento (art. 30 RGPD) ────────────────────
function registroActividadesHTML() {
  const c = lgCentro();
  const actividad = (nombre, filas) => `<h2>${lgEsc(nombre)}</h2><table>${filas.map(([k, v]) => `<tr><th style="width:28%">${k}</th><td>${v}</td></tr>`).join('')}</table>`;
  const medidas = 'Las del programa de gestión AulaMovil (cifrado en tránsito, separación por empresa, accesos con contraseña, cierre de sesión en todos los dispositivos, bloqueo con PIN, copias de seguridad, historial de cambios) y las del centro: equipos con usuario y contraseña, disco cifrado, antivirus, papel bajo llave y deber de confidencialidad del personal.';
  const encargado = 'AulaMovil (Daniel Alexis Pérez Nicolás, NIF 76735508X), encargado del tratamiento con contrato del art. 28 RGPD; servidores en la UE (Supabase, Irlanda; Vercel, Dublín).';
  return lgDocumento('Registro de actividades de tratamiento', `
    <h1>Registro de actividades de tratamiento</h1>
    <p class="sub">Artículo 30 del RGPD · Responsable: ${lgHueco(c.nombre, 200)}, CIF/NIF ${lgHueco(c.cif, 90)}, ${lgHueco(c.direccion, 220)} · Contacto: ${lgHueco(c.email, 150)} · Fecha: ${lgFechaLarga()}</p>
    ${actividad('1. Alumnos y formación', [
      ['Finalidad', 'Matrícula, formación teórica y práctica, presentación a exámenes, libro de registro, fichas de formación y contrato de enseñanza.'],
      ['Base jurídica', 'Contrato (6.1.b); obligación legal (6.1.c): RD 1295/2003, RD 818/2009; consentimiento (6.1.a y 9.2.a) para foto, datos médicos y comunicaciones comerciales.'],
      ['Interesados', 'Alumnos (incluidos menores) y sus tutores.'],
      ['Datos', 'Identificativos, contacto, domicilio, nacimiento, nacionalidad, permisos, formación, clases (fecha, hora, km, coche, profesor, observaciones), firma digitalizada (imagen), exámenes y tasas; restricciones del permiso y centro médico (salud, con consentimiento).'],
      ['Destinatarios', 'Dirección General de Tráfico y Jefatura Provincial; encargado: ' + encargado],
      ['Transferencias internacionales', 'No hay. Los proveedores con matriz fuera de la UE están cubiertos por cláusulas contractuales tipo / Marco de Privacidad UE-EE. UU.'],
      ['Plazo de supresión', 'Durante la formación; libro de alumnos 4 años (art. 39 RD 1295/2003); fichas al menos 2 años (art. 40); después, anonimización.'],
      ['Medidas de seguridad', medidas]
    ])}
    ${actividad('2. Gestión económica', [
      ['Finalidad', 'Cobros, pagos, cargos, bonos, facturación y contabilidad.'],
      ['Base jurídica', 'Contrato (6.1.b) y obligación legal (6.1.c): normativa fiscal y mercantil.'],
      ['Interesados', 'Alumnos, tutores y pagadores.'],
      ['Datos', 'Identificativos, datos de facturación, importes, forma de pago.'],
      ['Destinatarios', 'Agencia Tributaria, gestoría, entidades bancarias; encargado: ' + encargado],
      ['Plazo de supresión', '6 años (art. 30 Código de Comercio) / 4 años (prescripción tributaria).'],
      ['Medidas de seguridad', medidas]
    ])}
    ${actividad('3. Personal: profesores y empleados', [
      ['Finalidad', 'Gestión del personal docente, registro de jornada (art. 34.9 Estatuto de los Trabajadores), asignación de clases y firma de las fichas.'],
      ['Base jurídica', 'Contrato de trabajo (6.1.b) y obligación legal (6.1.c).'],
      ['Interesados', 'Profesores, director y empleados.'],
      ['Datos', 'Identificativos, contacto, certificado de profesor, firma digitalizada, clases impartidas, jornada (entradas, salidas, correcciones).'],
      ['Destinatarios', 'Tesorería General de la Seguridad Social, Inspección de Trabajo cuando lo pida, gestoría; encargado: ' + encargado],
      ['Plazo de supresión', 'Registro de jornada 4 años; resto, mientras dure la relación y los plazos de prescripción laborales.'],
      ['Medidas de seguridad', medidas]
    ])}
    ${actividad('4. Interesados (posibles alumnos)', [
      ['Finalidad', 'Responder a quien pide información y hacer seguimiento hasta que se matricula.'],
      ['Base jurídica', 'Medidas precontractuales a petición del interesado (6.1.b); consentimiento para comunicaciones comerciales (6.1.a y art. 21 LSSI).'],
      ['Interesados', 'Personas que piden información.'],
      ['Datos', 'Nombre, contacto, permiso que le interesa, presupuesto, notas.'],
      ['Destinatarios', 'Encargado: ' + encargado],
      ['Plazo de supresión', 'Un año desde el último contacto si no se matricula.'],
      ['Medidas de seguridad', medidas]
    ])}
    <p class="nota">Plantilla generada con AulaMovil. Complétala con otras actividades del centro (videovigilancia, web propia, redes sociales…) y revísala cada vez que cambie algo.</p>`);
}

async function documentoLegalUI(tipo, alumno) {
  if (!lgAvisoCentro()) return;
  const nombreAl = alumno ? [alumno.primer_apellido, alumno.segundo_apellido, alumno.nombre].filter(Boolean).join('_') : '';
  if (tipo === 'proteccion') return lgGuardarPdf(`Proteccion_de_datos${nombreAl ? '_' + nombreAl : ''}`, hojaProteccionDatosHTML(alumno));
  if (tipo === 'contrato') return lgGuardarPdf(`Contrato_de_ensenanza${nombreAl ? '_' + nombreAl : ''}`, await contratoEnsenanzaHTML(alumno));
  if (tipo === 'registro') return lgGuardarPdf('Registro_de_actividades_de_tratamiento', registroActividadesHTML());
}

// Desde la ficha del alumno (menú Documentos)
function documentoAlumnoUI(tipo) {
  const a = typeof fichaCache !== 'undefined' && fichaCache ? fichaCache.alumno : null;
  if (!a) return;
  return documentoLegalUI(tipo, a);
}

// ── Anonimizar (derecho de supresión) ────────────────────────────────────────
async function anonimizarAlumnoUI() {
  const a = typeof fichaCache !== 'undefined' && fichaCache ? fichaCache.alumno : null;
  if (!a) return;
  const nombre = [a.nombre, a.primer_apellido, a.segundo_apellido].filter(Boolean).join(' ');
  if (!await confirmar(`Se borrará todo lo que identifica a ${nombre}: nombre y apellidos, DNI, contacto, domicilio, nacimiento, tutor, datos de facturación, observaciones, su foto y documentos, y las firmas y notas de sus clases.\n\nSe conservan sus clases, km, fechas, permiso e importes, sin nombre (para los números de la autoescuela).\n\nAntes de hacerlo, comprueba que ya no tienes que conservar sus datos (libro de alumnos 4 años, fichas 2 años, cobros y facturas 6 años) y, si te lo pide, entrégale una copia («Exportar sus datos»).\n\nNo se puede deshacer y se aplica también en la nube y en los demás equipos. Las copias de seguridad antiguas de este PC se renuevan solas.\n\n¿Anonimizar?`, { titulo: 'Derecho de supresión', textoAceptar: 'Anonimizar', peligro: true })) return;
  const r = await window.api.anonimizarAlumnos([a.id], 'supresion');
  if (!r || !r.anonimizados) { await avisar('No se pudo anonimizar (puede que ya lo estuviera).'); return; }
  await avisar(`Alumno anonimizado. ${r.practicas ? `Se han quitado las firmas y notas de ${r.practicas} ${r.practicas === 1 ? 'clase' : 'clases'}.` : ''} Queda anotado en el historial.`);
  if (typeof verPracticas === 'function' && typeof currentAlumnoId !== 'undefined') { try { await loadPracticas(); } catch (e) { /* refresco */ } }
}

function aniosConservacion() {
  try { const n = parseInt(localStorage.getItem(ANIOS_CONSERVACION_KEY)); return n >= 1 && n <= 30 ? n : 6; } catch (e) { return 6; }
}

async function pintarConservacion() {
  const cont = document.getElementById('legal-conservacion');
  if (!cont) return;
  const anios = aniosConservacion();
  const lista = await window.api.getAlumnosParaSuprimir(anios);
  cont.innerHTML = `<p class="aj-intro">Plazos que obliga la ley: libro de alumnos 4 años (art. 39 RD 1295/2003), fichas de formación al menos 2 años (art. 40) y cobros y facturas 6 años (art. 30 Código de Comercio). Pasado el plazo, los datos de los alumnos que terminaron deben borrarse o anonimizarse.</p>
    <div class="form-row" style="gap:12px;align-items:flex-end;flex-wrap:wrap;margin-bottom:10px">
      <div class="form-group"><label for="legal-anios">Alumnos terminados sin actividad desde hace más de</label>
        <select id="legal-anios" onchange="try{localStorage.setItem('${ANIOS_CONSERVACION_KEY}', this.value)}catch(e){}; pintarConservacion()">${[4, 5, 6, 7, 8, 10].map(n => `<option value="${n}"${n === anios ? ' selected' : ''}>${n} años</option>`).join('')}</select></div>
    </div>
    ${lista.length ? `<div class="table-wrap" style="max-height:320px;overflow:auto"><table><thead><tr><th><input type="checkbox" id="legal-todos" checked onchange="document.querySelectorAll('.legal-sel').forEach(x => x.checked = this.checked)"></th><th>Alumno</th><th>Nº</th><th>Estado</th><th>Última actividad</th></tr></thead><tbody>
      ${lista.map(x => `<tr><td><input type="checkbox" class="legal-sel" value="${x.id}" checked></td><td>${esc(x.nombre)}</td><td class="num-mono">${esc(x.n_registro || '')}</td><td>${esc(x.estado || '')}</td><td>${fmtFecha(x.ultima_actividad)}</td></tr>`).join('')}
      </tbody></table></div>
      <button type="button" class="btn btn-danger" style="margin-top:10px" onclick="anonimizarPlazoUI()">Anonimizar los marcados</button>`
    : `<p class="aj-intro"><b style="color:var(--success-fg)">✓ No hay alumnos que hayan superado ese plazo.</b></p>`}`;
}

async function anonimizarPlazoUI() {
  const ids = [...document.querySelectorAll('.legal-sel:checked')].map(x => parseInt(x.value));
  if (!ids.length) return;
  if (!await confirmar(`Se anonimizarán ${ids.length} ${ids.length === 1 ? 'alumno' : 'alumnos'}: se borra lo que los identifica y se conservan sus clases, km e importes sin nombre. No se puede deshacer y se aplica también en la nube.\n\n¿Anonimizar?`, { titulo: 'Fin del plazo de conservación', textoAceptar: 'Anonimizar', peligro: true })) return;
  const r = await window.api.anonimizarAlumnos(ids, 'plazo');
  await avisar(`${r.anonimizados} ${r.anonimizados === 1 ? 'alumno anonimizado' : 'alumnos anonimizados'}. Queda anotado en el historial.`);
  pintarConservacion();
}

// ── Ajustes → Legal y privacidad ─────────────────────────────────────────────
async function renderLegalUI() {
  const est = document.getElementById('legal-aceptacion');
  if (est) {
    const ac = await window.api.getAceptacionLegal();
    est.innerHTML = ac && ac.version === VERSION_LEGAL
      ? `<span style="color:var(--success-fg)">✓ Aceptados (versión ${esc(ac.version)}) el ${new Date(ac.fecha).toLocaleString('es-ES', { dateStyle: 'short', timeStyle: 'short' })}${ac.quien ? ' por ' + esc(ac.quien) : ''}.</span>`
      : '<span style="color:var(--warn-fg)">Pendientes de aceptar.</span> <button type="button" class="btn btn-sm btn-outline" onclick="comprobarAceptacionLegal()">Revisar y aceptar</button>';
  }
  const c = lgCentro();
  const resp = document.getElementById('legal-responsable');
  if (resp) {
    resp.innerHTML = c.nombre && c.cif
      ? `Responsable de los datos: <b>${esc(c.nombre)}</b> · ${esc(c.cif)}${c.email ? ' · ' + esc(c.email) : ''}`
      : `<span style="color:var(--warn-fg)">Faltan la razón social o el titular y el CIF/NIF de la autoescuela.</span> <button type="button" class="btn btn-sm btn-outline" onclick="ajustesAbrir('centro')">Rellenarlos</button>`;
  }
  pintarConservacion();
  const lic = document.getElementById('legal-licencias');
  if (lic && !lic.dataset.cargado) {
    const l = await window.api.licenciasTerceros();
    lic.dataset.cargado = '1';
    lic.innerHTML = l.length ? `<table><thead><tr><th>Componente</th><th>Versión</th><th>Licencia</th></tr></thead><tbody>${l.map(x => `<tr><td>${esc(x.nombre)}${x.autor ? `<div class="al-sub">${esc(x.autor)}</div>` : ''}</td><td class="num-mono">${esc(x.version || '')}</td><td>${esc(x.licencia || '')}</td></tr>`).join('')}</tbody></table>` : '<p class="aj-intro">No disponible.</p>';
  }
}
