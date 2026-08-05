// ─── PAGOS ───────────────────────────────────────────────────────────────────
// Pagos y cálculo de deudas (desglose FIFO de prácticas pagadas/pendientes).

const { load, save, nextId, _sync, filtrarPorSucursal } = require('./core');
const { getPracticasByAlumno } = require('./practicas');

// Formas de pago admitidas (tarea D1, arqueo de caja): cualquier otro valor
// se guarda como null en vez de romper el guardado.
const FORMAS_PAGO = ['efectivo', 'tarjeta', 'transferencia', 'bizum', 'otro'];

function getPagosByAlumno(alumno_id) {
  const d = load();
  const aid = parseInt(alumno_id);
  return d.pagos
    .filter(p => p.alumno_id === aid)
    .sort((a, b) => a.fecha.localeCompare(b.fecha) || a.id - b.id);
}

function addPago(alumno_id, fecha, cantidad, nota, sucursal_id = null, forma_pago = null, empleado = null) {
  const d = load();
  const id = nextId('pg');
  d.pagos.push({
    id,
    alumno_id: parseInt(alumno_id),
    fecha,
    cantidad: parseFloat(cantidad) || 0,
    nota: nota || '',
    sucursal_id: sucursal_id ? parseInt(sucursal_id) : null,
    forma_pago: FORMAS_PAGO.includes(forma_pago) ? forma_pago : null,
    empleado: empleado ? String(empleado).trim() || null : null
  });
  save();
  const s = _sync(); if (s) s.markDirty('pagos', id);
  return id;
}

function updatePago(id, fecha, cantidad, nota, forma_pago, empleado) {
  const d = load();
  const p = d.pagos.find(x => x.id === id);
  if (p) {
    p.fecha = fecha;
    p.cantidad = parseFloat(cantidad) || 0;
    p.nota = nota || '';
    if (forma_pago !== undefined) p.forma_pago = FORMAS_PAGO.includes(forma_pago) ? forma_pago : null;
    if (empleado !== undefined) p.empleado = empleado ? String(empleado).trim() || null : null;
    save();
    const s = _sync(); if (s) s.markDirty('pagos', id);
  }
}

function deletePago(id) {
  const d = load();
  d.pagos = d.pagos.filter(x => x.id !== id);
  save();
  const s = _sync(); if (s) s.markDeleted('pagos', id);
}

// Suma con signo de los cargos/descuentos no borrados de un alumno (tarea
// D2, PLAN-MAESTRO). Lee directamente `d.cargos` en vez de requerir
// db/cargos.js para no arriesgar un ciclo — mismo criterio que el resto de
// funciones de este módulo con `_data`. Con el array vacío (sin la
// funcionalidad usada, o sin cargos dados de alta) devuelve 0 y el cálculo
// de deuda queda idéntico al de antes de esta tarea.
function _totalCargosAlumno(d, alumnoId) {
  if (!d.cargos) return 0;
  return d.cargos
    .filter(c => !c.deleted && c.alumno_id === alumnoId)
    .reduce((sum, c) => sum + (c.importe || 0), 0);
}

// sucursalId opcional: filtra las deudas a los alumnos de esa sucursal (los
// pagos de cada alumno se buscan igual, sin filtrar, ya que cuelgan de su
// alumno_id) — ver filtrarPorSucursal en core.js.
function getDeudas(sucursalId) {
  const d = load();
  return filtrarPorSucursal(d.alumnos, sucursalId)
    .slice()
    .sort((a, b) => a.nombre.localeCompare(b.nombre))
    .map(alumno => {
      const practicasAlumno = d.practicas.filter(p => p.alumno_id === alumno.id);
      let generado_practicas = 0;
      let sin_tarifa = false;
      for (const p of practicasAlumno) {
        const tipo = p.tipo || 'circulacion';
        const tarifa = d.tarifas.find(t => t.permiso === alumno.permiso && t.tipo === tipo);
        if (tarifa) {
          generado_practicas += tarifa.precio;
        } else {
          sin_tarifa = true;
        }
      }
      const total_cargos = _totalCargosAlumno(d, alumno.id);
      const total_generado = generado_practicas + total_cargos;
      const total_pagado = getPagosByAlumno(alumno.id).reduce((sum, p) => sum + p.cantidad, 0);
      const saldo = total_generado - total_pagado;
      return {
        alumno_id: alumno.id,
        alumno_nombre: alumno.nombre,
        permiso: alumno.permiso,
        num_practicas: practicasAlumno.length,
        total_generado,
        total_cargos,
        total_pagado,
        saldo,
        sin_tarifa
      };
    });
}

// Solo lectura: desglose práctica a práctica de lo generado/cubierto por los pagos (FIFO en céntimos).
function getDesglosePagosAlumno(alumno_id) {
  const d = load();
  const aid = parseInt(alumno_id);
  const alumno = d.alumnos.find(a => a.id === aid);
  if (!alumno) return null;

  const practicasAlumno = getPracticasByAlumno(aid);
  const total_pagado = getPagosByAlumno(aid).reduce((sum, p) => sum + p.cantidad, 0);
  let total_generado = 0;
  let restanteCts = Math.round(total_pagado * 100);

  const practicas = practicasAlumno.map(p => {
    const tipo = p.tipo || 'circulacion';
    const tarifa = d.tarifas.find(t => t.permiso === alumno.permiso && t.tipo === tipo);
    if (!tarifa) {
      return { id: p.id, fecha: p.fecha, tipo, precio: null, estado: 'sin_tarifa', cubierto: 0 };
    }
    total_generado += tarifa.precio;
    const precioCts = Math.round(tarifa.precio * 100);
    let estado, cubiertoCts;
    if (restanteCts >= precioCts) {
      estado = 'pagada';
      cubiertoCts = precioCts;
    } else if (restanteCts > 0) {
      estado = 'parcial';
      cubiertoCts = restanteCts;
    } else {
      estado = 'pendiente';
      cubiertoCts = 0;
    }
    restanteCts -= cubiertoCts;
    return { id: p.id, fecha: p.fecha, tipo, precio: tarifa.precio, estado, cubierto: cubiertoCts / 100 };
  });

  // Cargos y descuentos (tarea D2): solo afectan a los totales, el FIFO de
  // arriba sigue repartiendo los pagos práctica a práctica exactamente
  // igual que antes. Con cargos vacío total_cargos es 0 y el resultado no
  // cambia.
  const cargosAlumno = (d.cargos || [])
    .filter(c => !c.deleted && c.alumno_id === aid)
    .sort((a, b) => (a.fecha || '').localeCompare(b.fecha || '') || a.id - b.id)
    .map(c => ({ id: c.id, concepto: c.concepto, tipo: c.tipo, importe: c.importe, fecha: c.fecha }));
  const total_cargos = cargosAlumno.reduce((sum, c) => sum + (c.importe || 0), 0);
  total_generado += total_cargos;

  return {
    alumno_id: aid,
    alumno_nombre: alumno.nombre,
    permiso: alumno.permiso,
    practicas,
    cargos: cargosAlumno,
    total_generado,
    total_pagado,
    saldo: total_generado - total_pagado
  };
}

// Arqueo de caja (tarea D1 del PLAN-MAESTRO): totales del rango de fechas
// [desde, hasta] (ambos 'YYYY-MM-DD' o null = sin límite por ese lado),
// desglosados por forma de pago, por empleado y por sucursal. Solo lectura,
// no marca sync.
function getArqueo(desde, hasta, sucursalId) {
  const d = load();
  const pagos = filtrarPorSucursal(d.pagos, sucursalId)
    .filter(p => (!desde || p.fecha >= desde) && (!hasta || p.fecha <= hasta));

  const porForma = { efectivo: 0, tarjeta: 0, transferencia: 0, bizum: 0, otro: 0, sin_especificar: 0 };
  const empleados = new Map(); // nombre -> { empleado, nPagos, total }
  const sucursales = new Map(); // sucursal_id (o null) -> { sucursal_id, nombre, total }
  let total = 0;

  for (const p of pagos) {
    total += p.cantidad;
    const forma = FORMAS_PAGO.includes(p.forma_pago) ? p.forma_pago : 'sin_especificar';
    porForma[forma] += p.cantidad;

    const nombreEmpleado = (p.empleado && String(p.empleado).trim()) || 'Sin asignar';
    if (!empleados.has(nombreEmpleado)) empleados.set(nombreEmpleado, { empleado: nombreEmpleado, nPagos: 0, total: 0 });
    const eEntry = empleados.get(nombreEmpleado);
    eEntry.nPagos++;
    eEntry.total += p.cantidad;

    const sid = p.sucursal_id != null ? p.sucursal_id : null;
    if (!sucursales.has(sid)) {
      const suc = sid != null ? (d.sucursales || []).find(s => s.id === sid) : null;
      const nombre = sid != null ? (suc ? suc.nombre : '—') : 'Principal';
      sucursales.set(sid, { sucursal_id: sid, nombre, total: 0 });
    }
    sucursales.get(sid).total += p.cantidad;
  }

  return {
    desde: desde || null,
    hasta: hasta || null,
    nPagos: pagos.length,
    total,
    porForma,
    porEmpleado: Array.from(empleados.values()),
    porSucursal: Array.from(sucursales.values())
  };
}

// Lista de morosidad (tarea D1): reutiliza getDeudas y se queda solo con los
// alumnos con saldo pendiente, ordenados de mayor a menor deuda.
function getMorosos(sucursalId) {
  return getDeudas(sucursalId)
    .filter(dd => dd.saldo > 0)
    .sort((a, b) => b.saldo - a.saldo);
}

module.exports = {
  getPagosByAlumno, addPago, updatePago, deletePago, getDeudas, getDesglosePagosAlumno,
  getArqueo, getMorosos,
};
