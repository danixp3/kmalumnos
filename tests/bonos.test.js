// Tests del módulo de bonos/packs de prácticas.
// Registro LOCAL: no toca sync.js, solo la capa de datos db/bonos.js.
const db = require('../db');
const { resetData } = require('./helpers');

beforeEach(() => { resetData(db); });

test('addBono crea el registro y getBonosAlumno devuelve saldo correcto', () => {
  const b = db.addBono({ alumno_id: 1, nombre: 'Bono 10 clases', n_clases: 10, precio: 200, fecha_compra: '2026-08-01' });
  expect(b).toMatchObject({ alumno_id: 1, nombre: 'Bono 10 clases', n_clases: 10, n_usadas: 0, estado: 'activo' });

  const lista = db.getBonosAlumno(1);
  expect(lista).toHaveLength(1);
  expect(lista[0].saldo).toBe(10);
});

test('addBono con n_clases inválido lanza Error', () => {
  expect(() => db.addBono({ alumno_id: 1, nombre: 'X', n_clases: 0, fecha_compra: '2026-08-01' })).toThrow();
  expect(() => db.addBono({ alumno_id: 1, nombre: 'X', n_clases: -3, fecha_compra: '2026-08-01' })).toThrow();
  expect(() => db.addBono({ alumno_id: 1, nombre: 'X', n_clases: 2.5, fecha_compra: '2026-08-01' })).toThrow();
});

test('consumirBono reduce saldo y marca agotado al llegar a 0', () => {
  const b = db.addBono({ alumno_id: 1, nombre: 'Bono 2 clases', n_clases: 2, fecha_compra: '2026-08-01' });

  let res = db.consumirBono(b.id, 1);
  expect(res).toMatchObject({ ok: true, saldo: 1, estado: 'activo' });

  res = db.consumirBono(b.id, 1);
  expect(res).toMatchObject({ ok: true, saldo: 0, estado: 'agotado' });
});

test('consumirBono sobre un bono ya agotado devuelve ok:false y no cambia nada', () => {
  const b = db.addBono({ alumno_id: 1, nombre: 'Bono 1 clase', n_clases: 1, fecha_compra: '2026-08-01' });
  db.consumirBono(b.id, 1); // se agota

  const res = db.consumirBono(b.id, 1);
  expect(res.ok).toBe(false);

  const actualizado = db.getBonosAlumno(1).find(x => x.id === b.id);
  expect(actualizado.n_usadas).toBe(1);
  expect(actualizado.estado).toBe('agotado');
});

test('reponerBono repone saldo y reactiva el estado si estaba agotado', () => {
  const b = db.addBono({ alumno_id: 1, nombre: 'Bono 1 clase', n_clases: 1, fecha_compra: '2026-08-01' });
  db.consumirBono(b.id, 1); // se agota

  const res = db.reponerBono(b.id, 1);
  expect(res).toMatchObject({ ok: true, saldo: 1 });

  const actualizado = db.getBonosAlumno(1).find(x => x.id === b.id);
  expect(actualizado.estado).toBe('activo');
});

test('getSaldoBonosAlumno suma solo bonos activos y no caducados', () => {
  const bActivo = db.addBono({ alumno_id: 1, nombre: 'Activo', n_clases: 5, fecha_compra: '2026-08-01' });
  db.consumirBono(bActivo.id, 2); // saldo 3

  const bCaducado = db.addBono({ alumno_id: 1, nombre: 'Caducado', n_clases: 5, fecha_compra: '2026-01-01', fecha_caducidad: '2026-01-31' });

  const bAnulado = db.addBono({ alumno_id: 1, nombre: 'Anulado', n_clases: 5, fecha_compra: '2026-08-01' });
  db.anularBono(bAnulado.id);

  expect(db.getSaldoBonosAlumno(1)).toBe(3);
});

test('anularBono cambia estado a anulado; deleteBono lo quita de getBonos', () => {
  const b = db.addBono({ alumno_id: 1, nombre: 'Bono', n_clases: 5, fecha_compra: '2026-08-01' });
  db.anularBono(b.id);
  expect(db.getBonosAlumno(1).find(x => x.id === b.id).estado).toBe('anulado');

  expect(db.getBonos()).toHaveLength(1);
  db.deleteBono(b.id);
  expect(db.getBonos()).toHaveLength(0);
});

test('getBonos filtra por sucursal', () => {
  db.addBono({ alumno_id: 1, nombre: 'A', n_clases: 5, fecha_compra: '2026-08-01', sucursal_id: 1 });
  db.addBono({ alumno_id: 2, nombre: 'B', n_clases: 5, fecha_compra: '2026-08-01', sucursal_id: 2 });

  expect(db.getBonos(1)).toHaveLength(1);
  expect(db.getBonos(1)[0].nombre).toBe('A');
  expect(db.getBonos()).toHaveLength(2);
});
