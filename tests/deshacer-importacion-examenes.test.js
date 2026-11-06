// Deshacer una importación (db/migracion.js) no puede dejar colgado un examen que alguien anotó después en un
// alumno traído: ese alumno cuenta como «con actividad» y se conserva (antes se borraba y su examen quedaba huérfano).
const db = require('../db');
const { resetData } = require('./helpers');

beforeEach(() => resetData(db));

function entrada(texto) {
  const h = db.leerTextoTabla(texto);
  const det = db.detectarTablaMigracion(h, 'alumnos');
  return { tipo: 'alumnos', filas: h.filas, numFila: h.numFila, filaCabecera: det.filaCabecera, mapeo: det.mapeo, opciones: { hoy: '2026-11-06', ordenNombre: det.ordenNombre }, archivo: 'prueba.csv' };
}

test('el alumno traído al que luego se le anotó un examen se conserva al deshacer; el que no tiene nada, se quita', () => {
  const imp = db.aplicarImportacion(entrada('Nombre;Apellidos\nLucía;Prueba Uno\nMarcos;Prueba Dos\n'));
  expect(imp.ok).toBe(true);
  const [lucia, marcos] = [db.getAlumnos().find(a => a.nombre === 'Lucía'), db.getAlumnos().find(a => a.nombre === 'Marcos')];
  expect(lucia && marcos).toBeTruthy();
  db.addPresentacion({ alumno_id: lucia.id, tipo: 'teorico', fecha: '2026-11-02' });
  const r = db.deshacerImportacion(imp.id);
  expect(r.ok).toBe(true);
  expect(db.getAlumnos().some(a => a.id === lucia.id)).toBe(true);   // tiene un examen anotado después: se queda
  expect(db.getAlumnos().some(a => a.id === marcos.id)).toBe(false); // sin nada: se quita
  expect(db.getPresentaciones().filter(x => x.alumno_id === lucia.id)).toHaveLength(1);
  expect(r.conservados.length).toBe(1);
});
