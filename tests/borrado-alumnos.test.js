// Borrar alumnos por fechas: vista previa, borrado con todo lo suyo, cobros conservados, copia y deshacer.
const fs = require('fs');
const path = require('path');
const db = require('../db');
const { resetData, userDataDir } = require('./helpers');

beforeEach(() => { resetData(db); fs.rmSync(path.join(userDataDir, 'borrados'), { recursive: true, force: true }); });

// Tres alumnos: dos de septiembre (uno con clases, cobros y examen) y uno de octubre
function escenario() {
  const vid = db.addVehiculo('Ibiza', '4821 LKM', 0);
  const a1 = db.addAlumno('Ana Pérez', 'B', vid);
  const a2 = db.addAlumno('Bruno Ruiz', 'B', vid);
  const a3 = db.addAlumno('Clara Soto', 'B', vid);
  db.updateAlumnoCampos(a1, { fecha_alta: '2026-09-05' });
  db.updateAlumnoCampos(a2, { fecha_alta: '2026-09-20' });
  db.updateAlumnoCampos(a3, { fecha_alta: '2026-10-10' });
  const p1 = db.addPractica(a1, vid, '2026-09-06', 100, 140);
  const p2 = db.addPractica(a1, vid, '2026-09-08', 140, 160);
  db.updatePractica(p2, '2026-09-08', 140, 160, null, 'circulacion', null, 0.5);
  db.addPractica(a3, vid, '2026-10-12', 160, 200);
  db.addPago(a1, '2026-09-07', 50, 'cobro');
  db.addPresentacion({ alumno_id: a1, tipo: 'teorico', fecha: '2026-09-30', resultado: 'apto' });
  return { vid, a1, a2, a3, p1, p2 };
}

test('vista previa: por fecha de alta, desde un día; cuenta clases (½ = ½), cobros y exámenes y no toca nada', () => {
  const { a1, a2, a3 } = escenario();
  const r = db.proponerBorradoAlumnos({ criterio: 'alta', desde: '2026-09-01', hasta: '2026-09-30' });
  expect(r.ok).toBe(true);
  expect(r.ids.sort()).toEqual([a1, a2].sort());
  expect(r.resumen).toMatchObject({ alumnos: 2, clases: 1.5, cobros: 1, importe_cobrado: 50, examenes: 1 });
  const ana = r.alumnos.find(x => x.id === a1);
  expect(ana).toMatchObject({ clases: 1.5, cobros: 1, cobrado: 50, examenes: 1 });
  // «a partir de» sin límite superior
  const desde = db.proponerBorradoAlumnos({ criterio: 'alta', desde: '2026-09-15' });
  expect(desde.ids.sort()).toEqual([a2, a3].sort());
  expect(db.getAlumnos().length).toBe(3);
});

test('vista previa: pide al menos una fecha, válida y en orden', () => {
  escenario();
  expect(db.proponerBorradoAlumnos({}).ok).toBe(false);
  expect(db.proponerBorradoAlumnos({ desde: '15/09/2026' }).ok).toBe(false);
  expect(db.proponerBorradoAlumnos({ desde: '2026-10-01', hasta: '2026-09-01' }).ok).toBe(false);
  expect(db.proponerBorradoAlumnos({ hasta: '2026-09-30' }).ok).toBe(true);
});

test('por la fecha de su última clase; los que no han dado clase solo entran si se pide (por su alta)', () => {
  const { a1, a2, a3 } = escenario();
  const r = db.proponerBorradoAlumnos({ criterio: 'ultima_clase', desde: '2026-09-01', hasta: '2026-09-30' });
  expect(r.ids).toEqual([a1]);                                    // a2 no tiene clases: fuera
  const con = db.proponerBorradoAlumnos({ criterio: 'ultima_clase', desde: '2026-09-01', hasta: '2026-09-30', incluirSinClases: true });
  expect(con.ids.sort()).toEqual([a1, a2].sort());               // a2 por su alta de septiembre
  expect(con.ids).not.toContain(a3);
});

test('avisa de quien debe dinero, de quien dio clase hace poco y de lo que tiene por delante', () => {
  const { a1 } = escenario();
  const hoy = new Date(); const f = n => { const d = new Date(hoy); d.setDate(d.getDate() + n); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
  db.addPresentacion({ alumno_id: a1, tipo: 'circulacion', fecha: f(7) });          // examen por delante
  db.addPractica(a1, db.getVehiculos()[0].id, f(-3), 200, 220);                    // clase reciente
  const r = db.proponerBorradoAlumnos({ criterio: 'alta', desde: '2026-09-01', hasta: '2026-09-30' });
  const ana = r.alumnos.find(x => x.id === a1);
  expect(ana.reciente).toBe(true);
  expect(ana.examen_pendiente).toBe(true);
  expect(r.resumen.con_clase_reciente).toBe(1);
});

test('borrar: quita a los alumnos con sus clases, reservas, exámenes… y CONSERVA los cobros; copia previa y registro', () => {
  const { a1, a2, a3 } = escenario();
  const res = db.aplicarBorradoAlumnos({ criterio: 'alta', desde: '2026-09-01', hasta: '2026-09-30' });
  expect(res.ok).toBe(true);
  expect(res.borrados).toMatchObject({ alumnos: 2, practicas: 2, presentaciones: 1 });
  expect(fs.existsSync(res.copia)).toBe(true);
  const quedan = db.getAlumnos().map(a => a.id);
  expect(quedan).toEqual([a3]);
  expect(db.getPresentaciones()).toHaveLength(0);
  expect(db.getPagosByAlumno(a1)).toHaveLength(1);                 // el cobro se conserva
  expect(db.getTodasPracticas({}).map(p => p.alumno_id)).toEqual([a3]);
  // y queda anotado en el historial, que no se borra con «Borrar historial»
  expect(db.getLogs().some(l => l.tipo === 'borrado_alumnos')).toBe(true);
  expect(db.getBorradosAlumnos()[0]).toMatchObject({ alumnos: 2, clases: 2, cobros_borrados: false, disponible: true });
  void a2;
});

test('borrar también los cobros solo si se pide', () => {
  const { a1 } = escenario();
  const res = db.aplicarBorradoAlumnos({ criterio: 'alta', desde: '2026-09-01', hasta: '2026-09-30', borrarCobros: true });
  expect(res.ok).toBe(true);
  expect(db.getPagosByAlumno(a1)).toHaveLength(0);
});

test('solo se borran los ids marcados que siguen cumpliendo el filtro (nunca uno de fuera)', () => {
  const { a1, a2, a3 } = escenario();
  const res = db.aplicarBorradoAlumnos({ criterio: 'alta', desde: '2026-09-01', hasta: '2026-09-30', ids: [a2, a3] });   // a3 no cumple el filtro
  expect(res.ok).toBe(true);
  expect(res.borrados.alumnos).toBe(1);
  expect(db.getAlumnos().map(a => a.id).sort()).toEqual([a1, a3].sort());
  expect(db.aplicarBorradoAlumnos({ criterio: 'alta', desde: '2030-01-01' }).ok).toBe(false);
});

test('deshacer: vuelven los alumnos con sus clases (½ incluida), exámenes, y no se puede deshacer dos veces', () => {
  const { a1, p2 } = escenario();
  const res = db.aplicarBorradoAlumnos({ criterio: 'alta', desde: '2026-09-01', hasta: '2026-09-30' });
  const r = db.deshacerBorradoAlumnos(res.id);
  expect(r.ok).toBe(true);
  expect(db.getAlumnos().length).toBe(3);
  expect(db.getPresentaciones()).toHaveLength(1);
  const media = db.getTodasPracticas({}).find(p => p.id === p2);
  expect(media).toMatchObject({ alumno_id: a1, fraccion: 0.5 });
  expect(db.deshacerBorradoAlumnos(res.id).ok).toBe(false);
  expect(db.getBorradosAlumnos()[0].deshecho).toBeTruthy();
});

test('los borrados quedan marcados para la nube y al deshacer vuelven a subir', () => {
  const sync = require('../sync');
  const fsx = require('fs');
  const pendingFile = path.join(userDataDir, 'pending_sync.json');
  const { a1, p1 } = escenario();
  try { fsx.unlinkSync(pendingFile); } catch (e) { /* aún no existe */ }
  const res = db.aplicarBorradoAlumnos({ criterio: 'alta', desde: '2026-09-01', hasta: '2026-09-30' });
  const p = JSON.parse(fsx.readFileSync(pendingFile, 'utf-8'));
  expect(p.deleted.alumnos).toContain(a1);
  expect(p.deleted.practicas).toContain(p1);
  expect(p.deleted.presentaciones.length).toBe(1);
  db.deshacerBorradoAlumnos(res.id);
  const q = JSON.parse(fsx.readFileSync(pendingFile, 'utf-8'));
  expect(q.deleted.alumnos).not.toContain(a1);
  expect(q.alumnos).toContain(a1);
  expect(q.practicas).toContain(p1);
  void sync;
});
