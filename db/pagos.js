// ─── PAGOS ───────────────────────────────────────────────────────────────────
// Pagos y cálculo de deudas (desglose FIFO de prácticas pagadas/pendientes).

const { load, save, nextId, _sync, filtrarPorSucursal } = require('./core');
const { getPracticasByAlumno } = require('./practicas');

function getPagosByAlumno(alumno_id) {
  const d = load();
  const aid = parseInt(alumno_id);
  return d.pagos
    .filter(p => p.alumno_id === aid)
    .sort((a, b) => a.fecha.localeCompare(b.fecha) || a.id - b.id);
}

function addPago(alumno_id, fecha, cantidad, nota, sucursal_id = null) {
  const d = load();
  const id = nextId('pg');
  d.pagos.push({
    id,
    alumno_id: parseInt(alumno_id),
    fecha,
    cantidad: parseFloat(cantidad) || 0,
    nota: nota || '',
    sucursal_id: sucursal_id ? parseInt(sucursal_id) : null
  });
  save();
  const s = _sync(); if (s) s.markDirty('pagos', id);
  return id;
}

function updatePago(id, fecha, cantidad, nota) {
  const d = load();
  const p = d.pagos.find(x => x.id === id);
  if (p) {
    p.fecha = fecha;
    p.cantidad = parseFloat(cantidad) || 0;
    p.nota = nota || '';
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
      let total_generado = 0;
      let sin_tarifa = false;
      for (const p of practicasAlumno) {
        const tipo = p.tipo || 'circulacion';
        const tarifa = d.tarifas.find(t => t.permiso === alumno.permiso && t.tipo === tipo);
        if (tarifa) {
          total_generado += tarifa.precio;
        } else {
          sin_tarifa = true;
        }
      }
      const total_pagado = getPagosByAlumno(alumno.id).reduce((sum, p) => sum + p.cantidad, 0);
      const saldo = total_generado - total_pagado;
      return {
        alumno_id: alumno.id,
        alumno_nombre: alumno.nombre,
        permiso: alumno.permiso,
        num_practicas: practicasAlumno.length,
        total_generado,
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

  return {
    alumno_id: aid,
    alumno_nombre: alumno.nombre,
    permiso: alumno.permiso,
    practicas,
    total_generado,
    total_pagado,
    saldo: total_generado - total_pagado
  };
}

module.exports = {
  getPagosByAlumno, addPago, updatePago, deletePago, getDeudas, getDesglosePagosAlumno,
};
