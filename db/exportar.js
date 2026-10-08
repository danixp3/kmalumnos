// ─── EXPORTAR LISTAS (alumnos, exámenes) ────────────────────────────────────
// Lo que se ve en pantalla (con sus filtros) a un archivo CSV que abre Excel
// tal cual: separado por «;», fechas dd/mm/aaaa y con BOM para las tildes.
// Con todos los datos de cada alumno, también los traídos de Ariauto.

const { load } = require('./core');
const { buscarExamenes } = require('./convocatorias');
const { TABLAS_PROCEDENCIA } = require('./procedencia');
// Programa del que se trajo cada dato (db/procedencia.js); lo creado aquí, «AulaMovil»
const procedenciaTxt = x => (x && x.procedencia) || 'AulaMovil';

const fecha = v => (v && /^\d{4}-\d{2}-\d{2}/.test(v) ? `${v.slice(8, 10)}/${v.slice(5, 7)}/${v.slice(0, 4)}` : '');
function celda(v) {
  if (v == null) return '';
  const s = Array.isArray(v) ? v.join(', ') : String(v);
  return /[;"\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
const aCSV = (cabecera, filas) => '﻿' + [cabecera, ...filas].map(f => f.map(celda).join(';')).join('\r\n');

const ESTADOS = {
  matriculado: 'Matriculado', en_teorica: 'En teórica', apto_teorico: 'Apto teórico', en_practicas: 'En prácticas',
  presentado: 'Presentado a examen', apto: 'Apto', no_apto: 'No apto', baja: 'Baja', inactivo: 'Inactivo', activo: 'Activo', aprobado: 'Aprobado'
};
const SEXO = { H: 'Hombre', M: 'Mujer' };

// Columnas: [título, valor(alumno, extras)]
const COLUMNAS_ALUMNO = [
  ['Nº registro', a => a.n_registro], ['Nombre', a => a.nombre], ['Primer apellido', a => a.primer_apellido], ['Segundo apellido', a => a.segundo_apellido],
  ['DNI/NIE', a => a.dni], ['Caducidad DNI', a => fecha(a.dni_caducidad)], ['Sexo', a => SEXO[a.sexo] || ''], ['Fecha de nacimiento', a => fecha(a.fecha_nacimiento)],
  ['Lugar de nacimiento', a => a.lugar_nacimiento], ['Nacionalidad', a => a.nacionalidad],
  ['Teléfono', a => a.telefono], ['Teléfono 2', a => a.telefono2], ['Email', a => a.email],
  ['Dirección', a => a.direccion], ['Código postal', a => a.codigo_postal], ['Población', a => a.poblacion], ['Municipio', a => a.municipio], ['Provincia', a => a.provincia],
  ['Permiso', a => a.permiso], ['Otros permisos', a => a.permisos], ['Permisos que posee', a => a.permisos_posee],
  ['Estado', a => ESTADOS[a.estado] || a.estado], ['Fecha de alta', a => fecha(a.fecha_alta)], ['Teórico aprobado', a => fecha(a.fecha_teorico)],
  ['Fin de la enseñanza', a => fecha(a.fecha_fin)], ['Nº de solicitud', a => a.n_solicitud], ['Convocatoria', a => a.convocatoria],
  ['Profesor', (a, x) => x.profesor], ['Vehículo', (a, x) => x.vehiculo], ['Clases hechas antes de la app', a => a.clases_previas || ''],
  ['Centro médico', a => a.centro_medico], ['Restricciones', a => a.restricciones],
  ['Tutor', a => a.tutor_nombre], ['DNI del tutor', a => a.tutor_dni],
  ['Facturar a', a => a.factura_nombre], ['NIF factura', a => a.factura_nif], ['Dirección factura', a => a.factura_direccion],
  ['Nº inscripción (libro)', a => a.n_inscripcion], ['Observaciones', a => a.observaciones], ['Procedencia', procedenciaTxt]
];

function exportarAlumnos({ ids } = {}) {
  const d = load();
  const orden = Array.isArray(ids) && ids.length ? ids.map(Number) : null;
  const porId = new Map(d.alumnos.filter(a => !a.deleted).map(a => [a.id, a]));
  const alumnos = orden ? orden.map(id => porId.get(id)).filter(Boolean) : [...porId.values()];
  const profes = new Map(d.profesores.map(p => [p.id, p.nombre]));
  const coches = new Map(d.vehiculos.map(v => [v.id, [v.nombre, v.matricula].filter(Boolean).join(' · ')]));
  const filas = alumnos.map(a => {
    const x = { profesor: profes.get(a.profesor_id) || '', vehiculo: coches.get(a.vehiculo_id) || '' };
    return COLUMNAS_ALUMNO.map(([, f]) => f(a, x));
  });
  return { csv: aCSV(COLUMNAS_ALUMNO.map(c => c[0]), filas), total: filas.length, nombre: 'alumnos' };
}

const TIPOS = { teorico: 'Teórico', maniobras: 'Maniobras (pista)', circulacion: 'Circulación' };
const RESULTADOS = { pendiente: 'Pendiente', apto: 'Apto', no_apto: 'No apto', aplazado: 'Aplazado', no_presentado: 'No presentado' };

function exportarExamenes(filtros = {}, sucursalId) {
  const { filas } = buscarExamenes(filtros, sucursalId);
  const cab = ['Fecha', 'Alumno', 'DNI/NIE', 'Nº registro', 'Tipo', 'Permiso', 'Resultado', 'Convocatoria', 'Nº solicitud', 'Profesor', 'Examinador', 'Coche', 'Fallos', 'Detalle de los fallos', 'Notas', 'Procedencia'];
  const datos = filas.map(e => [fecha(e.fecha), e.alumno_nombre, e.alumno_dni, e.alumno_n_registro, TIPOS[e.tipo] || e.tipo, e.permiso,
    RESULTADOS[e.resultado] || e.resultado, e.n_convocatoria ? `${e.n_convocatoria}ª` : '', e.n_solicitud, e.profesor_nombre, e.examinador, e.vehiculo,
    e.fallos != null ? e.fallos : '', e.fallos_detalle, e.nota, procedenciaTxt(e)]);
  return { csv: aCSV(cab, datos), total: datos.length, nombre: 'examenes' };
}

// ─── EXPORTAR TODOS LOS DATOS ────────────────────────────────────────────────
// Cada tipo de dato que guarda la app como una tabla con títulos en castellano:
// a Excel (una hoja por tipo, fechas y números de verdad), a CSV (un archivo
// por tipo) o a una copia completa en JSON. Con `alumnoId` sale solo lo de ese
// alumno (derecho de acceso y portabilidad del RGPD). Las firmas, fotos y
// documentos NO van en las tablas (se indica si hay firma); la copia JSON puede
// llevarlas.
// Columna: [título, valor(fila, ctx), tipo?] con tipo 'fecha' | 'num' | 'euros'.
const { clasesDePractica } = require('./core');

const SI = v => (v ? 'Sí' : 'No');
const nombreAlumno = (ctx, id) => { const a = ctx.alumnos.get(id); return a ? [a.nombre, a.primer_apellido, a.segundo_apellido].filter(Boolean).join(' ') : (id ? `#${id}` : ''); };
const nombreDe = (mapa, id) => { const x = mapa.get(id); return x ? x.nombre : (id ? `#${id}` : ''); };
const cocheDe = (ctx, id) => { const v = ctx.vehiculos.get(id); return v ? [v.nombre, v.matricula].filter(Boolean).join(' · ') : (id ? `#${id}` : ''); };
const sucursalDe = (ctx, id) => (id ? nombreDe(ctx.sucursales, id) : '');
const FORMAS = { efectivo: 'Efectivo', tarjeta: 'Tarjeta', transferencia: 'Transferencia', bizum: 'Bizum', otro: 'Otro' };
const TIPO_PRACTICA = { circulacion: 'Circulación', pista: 'Pista' };
const DETALLE_PRACTICA = { anterior: 'Anterior a la app', km_auto: 'Km calculados', anotada: 'Anotada después' };
const ESTADO_RESERVA = { solicitada: 'Solicitada', confirmada: 'Confirmada', cancelada: 'Cancelada', realizada: 'Realizada' };
const ENTIDAD_VENC = { vehiculo: 'Vehículo', profesor: 'Profesor', alumno: 'Alumno', centro: 'Centro' };

const FECHAS_ALUMNO = { 'Caducidad DNI': 'dni_caducidad', 'Fecha de nacimiento': 'fecha_nacimiento', 'Fecha de alta': 'fecha_alta', 'Teórico aprobado': 'fecha_teorico', 'Fin de la enseñanza': 'fecha_fin' };

const CONJUNTOS_EXPORTAR = [
  { clave: 'alumnos', titulo: 'Alumnos', tabla: 'alumnos', fecha: 'fecha_alta', alumno: 'id',
    columnas: [['Id', a => a.id, 'num'], ...COLUMNAS_ALUMNO.map(([t, f]) => (FECHAS_ALUMNO[t]
      ? [t, a => a[FECHAS_ALUMNO[t]] || '', 'fecha']
      : [t, (a, ctx) => f(a, { profesor: nombreDe(ctx.profesores, a.profesor_id), vehiculo: cocheDe(ctx, a.vehiculo_id) }), t === 'Clases hechas antes de la app' ? 'num' : undefined])),
      ['Km antes de la app', a => a.km_previos || '', 'num'], ['Sucursal', (a, ctx) => sucursalDe(ctx, a.sucursal_id)]] },
  { clave: 'practicas', titulo: 'Clases prácticas', tabla: 'practicas', fecha: 'fecha', alumno: 'alumno_id',
    columnas: [['Id', p => p.id, 'num'], ['Fecha', p => p.fecha, 'fecha'], ['Hora inicio', p => p.hora_inicio || ''], ['Hora fin', p => p.hora_fin || ''],
      ['Alumno', (p, ctx) => nombreAlumno(ctx, p.alumno_id)], ['DNI alumno', (p, ctx) => (ctx.alumnos.get(p.alumno_id) || {}).dni || ''],
      ['Profesor', (p, ctx) => nombreDe(ctx.profesores, p.profesor_id)], ['Vehículo', (p, ctx) => cocheDe(ctx, p.vehiculo_id)],
      ['Km inicial', p => p.km_inicial || 0, 'num'], ['Km final', p => p.km_final || 0, 'num'], ['Km', p => (p.km_final > p.km_inicial ? p.km_final - p.km_inicial : 0), 'num'],
      ['Clases', p => clasesDePractica(p), 'num'], ['Tipo', p => TIPO_PRACTICA[p.tipo || 'circulacion'] || p.tipo], ['Origen de los datos', p => DETALLE_PRACTICA[p.tipo_detalle] || (p.source === 'web-remote' ? 'Móvil' : 'Escritorio')],
      ['Zonas', p => (Array.isArray(p.zonas) ? p.zonas.join(', ') : '')], ['Lo trabajado', p => (Array.isArray(p.trabajado) ? p.trabajado.join(', ') : (p.trabajado || ''))],
      ['Firmada por el alumno', p => SI(p.firma)], ['Observación', p => p.nota || ''], ['Sucursal', (p, ctx) => sucursalDe(ctx, p.sucursal_id)]] },
  { clave: 'profesores', titulo: 'Profesores', tabla: 'profesores', fecha: 'fecha_alta',
    columnas: [['Id', p => p.id, 'num'], ['Nombre', p => p.nombre], ['DNI/NIE', p => p.dni || ''], ['Teléfono', p => p.telefono || ''], ['Email', p => p.email || ''],
      ['Dirección', p => p.direccion || ''], ['Código postal', p => p.codigo_postal || ''], ['Población', p => p.poblacion || ''],
      ['Fecha de nacimiento', p => p.fecha_nacimiento || '', 'fecha'], ['Alta', p => p.fecha_alta || '', 'fecha'], ['Baja', p => p.fecha_baja || '', 'fecha'],
      ['Nº certificado', p => p.n_certificado || ''], ['Expedición del certificado', p => p.fecha_certificado || '', 'fecha'],
      ['Coche habitual', (p, ctx) => cocheDe(ctx, p.vehiculo_id)], ['Firma guardada', p => SI(p.firma)], ['Nota', p => p.nota || ''], ['Sucursal', (p, ctx) => sucursalDe(ctx, p.sucursal_id)]] },
  { clave: 'vehiculos', titulo: 'Vehículos', tabla: 'vehiculos', fecha: 'fecha_alta',
    columnas: [['Id', v => v.id, 'num'], ['Nombre', v => v.nombre], ['Matrícula', v => v.matricula || ''], ['Marca', v => v.marca || ''], ['Modelo', v => v.modelo || ''],
      ['Cambio', v => v.cambio || ''], ['Km actuales', v => v.km_actual || 0, 'num'], ['En uso', v => SI(v.activo !== false)], ['Alta', v => v.fecha_alta || '', 'fecha'], ['Baja', v => v.fecha_baja || '', 'fecha'],
      ['Última ITV', v => v.itv_ultima || '', 'fecha'], ['Aseguradora', v => v.aseguradora || ''], ['Póliza', v => v.poliza || ''], ['Observaciones', v => v.observaciones || ''], ['Sucursal', (v, ctx) => sucursalDe(ctx, v.sucursal_id)]] },
  { clave: 'pagos', titulo: 'Pagos', tabla: 'pagos', fecha: 'fecha', alumno: 'alumno_id',
    columnas: [['Id', p => p.id, 'num'], ['Fecha', p => p.fecha, 'fecha'], ['Alumno', (p, ctx) => nombreAlumno(ctx, p.alumno_id)], ['Importe', p => p.cantidad || 0, 'euros'],
      ['Forma de pago', p => FORMAS[p.forma_pago] || ''], ['Cobrado por', p => p.empleado || ''], ['Nota', p => p.nota || ''], ['Sucursal', (p, ctx) => sucursalDe(ctx, p.sucursal_id)]] },
  { clave: 'cargos', titulo: 'Cargos y descuentos', tabla: 'cargos', fecha: 'fecha', alumno: 'alumno_id',
    columnas: [['Id', c => c.id, 'num'], ['Fecha', c => c.fecha, 'fecha'], ['Alumno', (c, ctx) => nombreAlumno(ctx, c.alumno_id)], ['Concepto', c => c.concepto || ''],
      ['Tipo', c => c.tipo || ''], ['Importe', c => c.importe || 0, 'euros'], ['Nota', c => c.nota || ''], ['Sucursal', (c, ctx) => sucursalDe(ctx, c.sucursal_id)]] },
  { clave: 'tarifas', titulo: 'Tarifas', tabla: 'tarifas',
    columnas: [['Permiso', t => t.permiso], ['Tipo de clase', t => TIPO_PRACTICA[t.tipo] || t.tipo], ['Precio por clase', t => t.precio || 0, 'euros']] },
  { clave: 'bonos', titulo: 'Bonos', tabla: 'bonos', fecha: 'fecha_compra', alumno: 'alumno_id',
    columnas: [['Id', b => b.id, 'num'], ['Alumno', (b, ctx) => nombreAlumno(ctx, b.alumno_id)], ['Bono', b => b.nombre || ''], ['Clases', b => b.n_clases || 0, 'num'], ['Usadas', b => b.n_usadas || 0, 'num'],
      ['Precio', b => (b.precio != null ? b.precio : ''), 'euros'], ['Compra', b => b.fecha_compra || '', 'fecha'], ['Caduca', b => b.fecha_caducidad || '', 'fecha'], ['Estado', b => b.estado || ''], ['Nota', b => b.nota || '']] },
  { clave: 'examenes', titulo: 'Exámenes', tabla: 'presentaciones', fecha: 'fecha', alumno: 'alumno_id',
    columnas: [['Id', e => e.id, 'num'], ['Fecha', e => e.fecha, 'fecha'], ['Alumno', (e, ctx) => nombreAlumno(ctx, e.alumno_id)], ['DNI alumno', (e, ctx) => (ctx.alumnos.get(e.alumno_id) || {}).dni || ''],
      ['Tipo', e => TIPOS[e.tipo] || e.tipo], ['Permiso', e => e.permiso || ''], ['Convocatoria', e => e.n_convocatoria || '', 'num'], ['Resultado', e => RESULTADOS[e.resultado] || e.resultado || ''],
      ['Profesor', (e, ctx) => nombreDe(ctx.profesores, e.profesor_id)], ['Examinador', e => e.examinador || ''], ['Coche', e => e.vehiculo || ''],
      ['Fallos', e => (e.fallos != null ? e.fallos : ''), 'num'], ['Detalle de los fallos', e => e.fallos_detalle || ''], ['Nº solicitud', e => e.n_solicitud || ''], ['Nota', e => e.nota || '']] },
  { clave: 'tasas', titulo: 'Tasas de Tráfico', tabla: 'tasas', fecha: 'fecha_compra', alumno: 'alumno_id',
    columnas: [['Id', t => t.id, 'num'], ['Alumno', (t, ctx) => nombreAlumno(ctx, t.alumno_id)], ['Concepto', t => t.concepto || ''], ['Tipo de tasa', t => t.tipo_tasa || ''], ['Nº justificante', t => t.n_justificante || ''],
      ['Compra', t => t.fecha_compra || '', 'fecha'], ['Caduca', t => t.fecha_caducidad || '', 'fecha'], ['Importe', t => (t.importe != null ? t.importe : ''), 'euros'], ['Estado', t => t.estado || ''], ['Nota', t => t.nota || '']] },
  { clave: 'reservas', titulo: 'Agenda (clases programadas)', tabla: 'reservas', fecha: 'fecha', alumno: 'alumno_id',
    columnas: [['Id', r => r.id, 'num'], ['Fecha', r => r.fecha || '', 'fecha'], ['Hora', r => r.hora_inicio || ''], ['Duración (min)', r => r.duracion_min || '', 'num'], ['Clases', r => r.n_practicas || 1, 'num'],
      ['Alumno', (r, ctx) => nombreAlumno(ctx, r.alumno_id)], ['Profesor', (r, ctx) => nombreDe(ctx.profesores, r.profesor_id)], ['Vehículo', (r, ctx) => cocheDe(ctx, r.vehiculo_id)],
      ['Estado', r => ESTADO_RESERVA[r.estado] || r.estado || ''], ['Pedida desde', r => (r.origen === 'portal' ? 'Portal del alumno' : r.origen === 'web-remote' ? 'Móvil' : 'Escritorio')], ['Nota', r => r.nota || '']] },
  { clave: 'jornadas', titulo: 'Registro de jornada', tabla: 'jornadas', fecha: 'fecha',
    columnas: [['Id', j => j.id, 'num'], ['Fecha', j => j.fecha, 'fecha'], ['Empleado', j => j.empleado || ''], ['Entrada', j => j.entrada || ''], ['Salida', j => j.salida || ''],
      ['Correcciones', j => (Array.isArray(j.correcciones) ? j.correcciones.map(c => `${c.campo}: ${c.antes || '—'} → ${c.despues || '—'} (${String(c.ts || '').slice(0, 16).replace('T', ' ')})`).join(' | ') : '')],
      ['Nota', j => j.nota || ''], ['Sucursal', (j, ctx) => sucursalDe(ctx, j.sucursal_id)]] },
  { clave: 'vencimientos', titulo: 'Caducidades', tabla: 'vencimientos', fecha: 'fecha_vencimiento',
    columnas: [['Id', v => v.id, 'num'], ['De', v => ENTIDAD_VENC[v.entidad_tipo] || v.entidad_tipo || ''],
      ['Quién / qué', (v, ctx) => (v.entidad_tipo === 'alumno' ? nombreAlumno(ctx, v.entidad_id) : v.entidad_tipo === 'profesor' ? nombreDe(ctx.profesores, v.entidad_id) : v.entidad_tipo === 'vehiculo' ? cocheDe(ctx, v.entidad_id) : '')],
      ['Tipo', v => v.tipo || ''], ['Descripción', v => v.descripcion || ''], ['Vence', v => v.fecha_vencimiento || '', 'fecha'], ['Hecho', v => SI(v.completado)], ['Nota', v => v.nota || '']] },
  { clave: 'interesados', titulo: 'Interesados (CRM)', tabla: 'leads', fecha: 'fecha_alta',
    columnas: [['Id', l => l.id, 'num'], ['Nombre', l => l.nombre], ['Teléfono', l => l.telefono || ''], ['Email', l => l.email || ''], ['Origen', l => l.origen || ''], ['Estado', l => l.estado || ''],
      ['Permiso que le interesa', l => l.permiso_interes || ''], ['Presupuesto', l => (l.presupuesto != null ? l.presupuesto : ''), 'euros'], ['Alta', l => l.fecha_alta || '', 'fecha'],
      ['Se matriculó', l => l.fecha_conversion || '', 'fecha'], ['Alumno', (l, ctx) => (l.alumno_id ? nombreAlumno(ctx, l.alumno_id) : '')], ['Notas', l => l.notas || '']] },
  { clave: 'sucursales', titulo: 'Sucursales', tabla: 'sucursales',
    columnas: [['Id', s => s.id, 'num'], ['Nombre', s => s.nombre], ['Activa', s => SI(s.activa !== false)]] },
  { clave: 'historial', titulo: 'Historial de cambios', tabla: 'logs', fecha: 'fecha', sinBorrados: true,
    columnas: [['Fecha y hora', l => String(l.fecha || '').replace('T', ' ').slice(0, 19)], ['Tipo', l => l.tipo || ''], ['Descripción', l => l.descripcion || ''],
      ['Detalles', l => (Array.isArray(l.detalles) ? l.detalles.join(' | ') : (l.detalles || ''))]] }
];
// Columna «Procedencia» al final de cada tabla que la tiene (la de alumnos ya va en COLUMNAS_ALUMNO)
for (const c of CONJUNTOS_EXPORTAR) if (TABLAS_PROCEDENCIA[c.tabla] && c.tabla !== 'alumnos') c.columnas.push(['Procedencia', procedenciaTxt]);

function _ctxExportar(d) {
  const mapa = l => new Map((l || []).map(x => [x.id, x]));
  return { alumnos: mapa(d.alumnos), profesores: mapa(d.profesores), vehiculos: mapa(d.vehiculos), sucursales: mapa(d.sucursales) };
}

function _filasConjunto(d, conj, { desde, hasta, alumnoId, sucursalId } = {}) {
  let lista = (d[conj.tabla] || []).filter(x => x && (conj.sinBorrados || !x.deleted));
  if (alumnoId != null) {
    if (conj.clave === 'vencimientos') lista = lista.filter(v => v.entidad_tipo === 'alumno' && v.entidad_id === alumnoId);
    else if (conj.clave === 'interesados') lista = lista.filter(l => l.alumno_id === alumnoId);
    else if (!conj.alumno) return [];
    else lista = lista.filter(x => x[conj.alumno] === alumnoId);
  }
  if (sucursalId != null && sucursalId !== '' && lista.some(x => 'sucursal_id' in x)) lista = lista.filter(x => x.sucursal_id == null || x.sucursal_id === Number(sucursalId));
  if (conj.fecha && (desde || hasta) && alumnoId == null) {
    lista = lista.filter(x => {
      const f = String(x[conj.fecha] || '').slice(0, 10);
      if (!f) return conj.clave !== 'practicas' && conj.clave !== 'pagos';
      return (!desde || f >= desde) && (!hasta || f <= hasta);
    });
  }
  if (conj.fecha) lista = [...lista].sort((a, b) => String(a[conj.fecha] || '').localeCompare(String(b[conj.fecha] || '')) || (a.id || 0) - (b.id || 0));
  return lista;
}

// Qué se puede exportar y cuántas filas hay de cada cosa (para la pantalla)
function catalogoExportacion() {
  const d = load();
  return CONJUNTOS_EXPORTAR.map(c => ({ clave: c.clave, titulo: c.titulo, total: _filasConjunto(d, c).length, porFecha: !!c.fecha }));
}

// → [{ clave, titulo, cabecera: [], tipos: [], filas: [[...]] }] con valores crudos
// (fechas ISO, números como números): exportarDatosCSV/Excel les dan formato.
function datosExportacion(opciones = {}) {
  const d = load();
  const ctx = _ctxExportar(d);
  const claves = Array.isArray(opciones.conjuntos) && opciones.conjuntos.length ? opciones.conjuntos : CONJUNTOS_EXPORTAR.map(c => c.clave);
  const alumnoId = opciones.alumnoId != null ? Number(opciones.alumnoId) : null;
  return CONJUNTOS_EXPORTAR.filter(c => claves.includes(c.clave)).map(c => {
    const filas = _filasConjunto(d, c, { desde: opciones.desde, hasta: opciones.hasta, alumnoId, sucursalId: opciones.sucursalId })
      .map(x => c.columnas.map(([, f]) => { const v = f(x, ctx); return v == null ? '' : v; }));
    return { clave: c.clave, titulo: c.titulo, cabecera: c.columnas.map(col => col[0]), tipos: c.columnas.map(col => col[2] || ''), filas };
  }).filter(t => alumnoId == null || t.filas.length);
}

// Valor de una celda en CSV: fechas dd/mm/aaaa, importes con coma decimal
function _celdaCSV(v, tipo) {
  if (tipo === 'fecha') return fecha(v);
  if ((tipo === 'num' || tipo === 'euros') && typeof v === 'number') return String(Math.round(v * 100) / 100).replace('.', ',');
  return v;
}
function tablaACSV(t) {
  return aCSV(t.cabecera, t.filas.map(f => f.map((v, i) => _celdaCSV(v, t.tipos[i]))));
}

// Libro de Excel (SheetJS): una hoja por tabla, fechas como fechas y números como números
function libroExcel(tablas) {
  const XLSX = require('xlsx');
  const libro = XLSX.utils.book_new();
  const usados = new Set();
  for (const t of tablas) {
    const ws = XLSX.utils.aoa_to_sheet([t.cabecera]);
    t.filas.forEach((f, r) => f.forEach((v, c) => {
      const ref = XLSX.utils.encode_cell({ r: r + 1, c });
      const tipo = t.tipos[c];
      if (tipo === 'fecha' && /^\d{4}-\d{2}-\d{2}/.test(v)) {
        const [y, m, dd] = v.slice(0, 10).split('-').map(Number);
        ws[ref] = { t: 'n', v: (Date.UTC(y, m - 1, dd) - Date.UTC(1899, 11, 30)) / 86400000, z: 'dd/mm/yyyy' };
      } else if ((tipo === 'num' || tipo === 'euros') && typeof v === 'number') {
        ws[ref] = { t: 'n', v, z: tipo === 'euros' ? '#,##0.00 "€"' : (Number.isInteger(v) ? '0' : '0.##') };
      } else if (v !== '' && v != null) ws[ref] = { t: 's', v: String(v) };
    }));
    ws['!ref'] = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: Math.max(t.filas.length, 1), c: Math.max(t.cabecera.length - 1, 0) } });
    ws['!cols'] = t.cabecera.map((h, c) => ({ wch: Math.min(48, Math.max(String(h).length + 2, ...t.filas.slice(0, 300).map(f => String(f[c] == null ? '' : f[c]).length + 1), 8)) }));
    ws['!autofilter'] = { ref: XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: Math.max(t.filas.length, 1), c: Math.max(t.cabecera.length - 1, 0) } }) };
    let nombre = t.titulo.replace(/[\\/?*[\]:]/g, ' ').slice(0, 31);
    while (usados.has(nombre)) nombre = nombre.slice(0, 28) + ' ' + usados.size;
    usados.add(nombre);
    XLSX.utils.book_append_sheet(libro, ws, nombre);
  }
  return XLSX.write(libro, { type: 'buffer', bookType: 'xlsx' });
}

// Copia completa en JSON (para otro programa o para guardar): todas las tablas
// tal cual, sin lo interno de la app; las firmas solo si se piden.
function copiaJSON({ conFirmas = false, alumnoId = null } = {}) {
  const d = load();
  const fuera = new Set(['_seq', 'cuadres_km', 'importaciones', 'fusiones_alumnos']);
  const salida = { exportado: new Date().toISOString(), programa: 'AulaMovil', version: 1, tablas: {} };
  for (const [k, v] of Object.entries(d)) {
    if (fuera.has(k) || !Array.isArray(v)) continue;
    let filas = v.filter(x => x && !x.deleted);
    if (alumnoId != null) {
      const id = Number(alumnoId);
      const conj = CONJUNTOS_EXPORTAR.find(c => c.tabla === k);
      if (k === 'alumnos') filas = filas.filter(a => a.id === id);
      else if (k === 'vencimientos') filas = filas.filter(x => x.entidad_tipo === 'alumno' && x.entidad_id === id);
      else if (conj && conj.alumno) filas = filas.filter(x => x[conj.alumno] === id);
      else continue;
    }
    salida.tablas[k] = filas.map(x => {
      if (conFirmas || !('firma' in x)) return x;
      const { firma, ...resto } = x; return { ...resto, tiene_firma: !!firma };
    });
  }
  if (alumnoId == null && d.ajustes_empresa) salida.ajustes = Object.fromEntries(Object.entries(d.ajustes_empresa).map(([k, v]) => [k, v && typeof v === 'object' && 'valor' in v ? v.valor : v]));
  return salida;
}

// Queda anotado en el historial (qué se sacó, en qué formato y cuántas filas)
function registrarExportacion(descripcion, detalles) {
  const { addLog, save } = require('./core');
  addLog('exportacion', descripcion, detalles || []);
  save();
}

module.exports = { exportarAlumnos, exportarExamenes, CONJUNTOS_EXPORTAR, catalogoExportacion, datosExportacion, tablaACSV, libroExcel, copiaJSON, registrarExportacion };
