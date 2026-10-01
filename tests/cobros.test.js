// Cobros (2026-10-01): conceptos de Ajustes → Cobros compartidos con la web y
// cargos automáticos al dar de alta a un alumno (matrícula, tasa, soporte...).
const fs = require('fs');
const path = require('path');
const db = require('../db');
const { resetData, userDataDir } = require('./helpers');

beforeEach(() => resetData(db));

const pendientes = () => JSON.parse(fs.readFileSync(path.join(userDataDir, 'pending_sync.json'), 'utf-8'));

test('conceptos de cobro: sin guardar devuelve null; al guardar se limpian y quedan pendientes de subir', () => {
  expect(db.getConceptosCobro()).toBeNull();
  const lista = db.setConceptosCobro([
    { id: 'matricula', nombre: ' Matrícula ', tipo: 'matricula', importe: '150', alta: true },
    { id: 'tasa', nombre: 'Tasa de tráfico (DGT)', tipo: 'tasa', importe: 94.051, alta: false },
    { nombre: 'Soporte informático', importe: 20 },          // sin tipo ni id: cargo con id propio, alta por defecto
    { nombre: 'matrícula', importe: 99 },                     // repetido (sin distinguir mayúsculas): fuera
    { nombre: '', importe: 10 },                              // sin nombre: fuera
    { nombre: 'Negativo', importe: -5, tipo: 'raro' }         // importe < 0 → 0, tipo desconocido → cargo
  ]);
  expect(lista.map(c => [c.nombre, c.tipo, c.importe, c.alta])).toEqual([
    ['Matrícula', 'matricula', 150, true],
    ['Tasa de tráfico (DGT)', 'tasa', 94.05, false],
    ['Soporte informático', 'cargo', 20, true],
    ['Negativo', 'cargo', 0, true]
  ]);
  expect(lista[2].id).toBeTruthy();
  expect(db.getConceptosCobro()).toEqual(lista);
  expect(pendientes().ajustes_empresa).toEqual(['conceptos_cobro']);
});

test('alta de alumno: se cargan los conceptos elegidos (los de 0 € no) y suben a la nube', () => {
  const vid = db.addVehiculo('Coche', '1234ABC', 1000);
  const aid = db.addAlumno('David', 'B', vid, null, null, null, { fecha_alta: '2026-09-30' });
  const creados = db.addCargosAlta(aid, [
    { nombre: 'Matrícula', tipo: 'matricula', importe: 150 },
    { nombre: 'Soporte informático', tipo: 'cargo', importe: 20 },
    { nombre: 'Gratis', tipo: 'cargo', importe: 0 }
  ]);
  expect(creados.map(c => [c.concepto, c.tipo, c.importe, c.fecha])).toEqual([
    ['Matrícula', 'matricula', 150, '2026-09-30'],
    ['Soporte informático', 'cargo', 20, '2026-09-30']
  ]);
  expect(pendientes().cargos).toEqual(creados.map(c => c.id));

  // Entran en la deuda del alumno aunque aún no tenga prácticas
  const deuda = db.getDeudas().find(d => d.alumno_id === aid);
  expect(deuda.total_cargos).toBe(170);
  expect(deuda.saldo).toBe(170);
  const desglose = db.getDesglosePagosAlumno(aid);
  expect(desglose.cargos.map(c => c.concepto)).toEqual(['Matrícula', 'Soporte informático']);
  expect(desglose.saldo).toBe(170);
});

test('alta de alumno: fecha explícita, sin conceptos no hace nada y alumno inexistente da error', () => {
  const vid = db.addVehiculo('Coche', '1234ABC', 1000);
  const aid = db.addAlumno('Lucía', 'B', vid);
  expect(db.addCargosAlta(aid, [])).toEqual([]);
  expect(db.addCargosAlta(aid, null)).toEqual([]);
  const [c] = db.addCargosAlta(aid, [{ nombre: 'Matrícula', tipo: 'matricula', importe: 120 }], '2026-10-01');
  expect(c.fecha).toBe('2026-10-01');
  expect(() => db.addCargosAlta(9999, [{ nombre: 'Matrícula', importe: 1 }])).toThrow(/no encontrado/);
  expect(() => db.addCargosAlta(aid, [{ nombre: 'Matrícula', importe: 1 }], '01/10/2026')).toThrow();
});
