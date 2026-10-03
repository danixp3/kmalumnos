// ─── EXPORTAR LISTAS (alumnos, exámenes) ────────────────────────────────────
// Lo que se ve en pantalla (con sus filtros) a un archivo CSV que abre Excel
// tal cual: separado por «;», fechas dd/mm/aaaa y con BOM para las tildes.
// Con todos los datos de cada alumno, también los traídos de Ariauto.

const { load } = require('./core');
const { buscarExamenes } = require('./convocatorias');

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
  ['Nº inscripción (libro)', a => a.n_inscripcion], ['Observaciones', a => a.observaciones]
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
  const cab = ['Fecha', 'Alumno', 'DNI/NIE', 'Nº registro', 'Tipo', 'Permiso', 'Resultado', 'Convocatoria', 'Nº solicitud', 'Profesor', 'Examinador', 'Coche', 'Fallos', 'Detalle de los fallos', 'Notas'];
  const datos = filas.map(e => [fecha(e.fecha), e.alumno_nombre, e.alumno_dni, e.alumno_n_registro, TIPOS[e.tipo] || e.tipo, e.permiso,
    RESULTADOS[e.resultado] || e.resultado, e.n_convocatoria ? `${e.n_convocatoria}ª` : '', e.n_solicitud, e.profesor_nombre, e.examinador, e.vehiculo,
    e.fallos != null ? e.fallos : '', e.fallos_detalle, e.nota]);
  return { csv: aCSV(cab, datos), total: datos.length, nombre: 'examenes' };
}

module.exports = { exportarAlumnos, exportarExamenes };
