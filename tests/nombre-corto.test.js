// El nombre del alumno sale con su primer apellido (así se distinguen dos personas que se llaman igual).
const db = require('../db');
const core = require('../db/core');
const { resetData } = require('./helpers');

beforeEach(() => { resetData(db); });

function alumnoCon(nombre, vid, extra) {
  const id = db.addAlumno(nombre, 'B', vid);
  Object.assign(core.load().alumnos.find(a => a.id === id), extra);
  return id;
}

describe('nombreCorto', () => {
  test('nombre + primer apellido, sin segundo apellido', () => {
    expect(core.nombreCorto({ nombre: 'Martín', primer_apellido: 'García', segundo_apellido: 'López' })).toBe('Martín García');
  });
  test('sin apellido deja solo el nombre; sin alumno, vacío', () => {
    expect(core.nombreCorto({ nombre: 'Hugo', primer_apellido: '' })).toBe('Hugo');
    expect(core.nombreCorto({ nombre: 'Hugo' })).toBe('Hugo');
    expect(core.nombreCorto(null)).toBe('');
  });
  test('si el nombre ya trae el apellido no lo repite (datos traídos de otro programa)', () => {
    expect(core.nombreCorto({ nombre: 'Martín García', primer_apellido: 'García' })).toBe('Martín García');
    expect(core.nombreCorto({ nombre: 'MARTIN GARCIA', primer_apellido: 'García' })).toBe('MARTIN GARCIA');
  });
});

describe('el apellido sale donde sale el alumno', () => {
  test('lista de Prácticas, continuidad con la clase anterior y registro rápido', () => {
    const vid = db.addVehiculo('Taigo', '6664NNM', 1000);
    const m1 = alumnoCon('Martín', vid, { primer_apellido: 'García', segundo_apellido: 'López' });
    const m2 = alumnoCon('Martín', vid, { primer_apellido: 'Ruiz' });
    const p1 = db.addPractica(m1, vid, '2026-10-05', 1000, 1030);
    const p2 = db.addPractica(m2, vid, '2026-10-06', 1030, 1060);
    const filas = db.getTodasPracticas();
    expect(filas.find(p => p.id === p1).alumno_nombre).toBe('Martín García');
    const f2 = filas.find(p => p.id === p2);
    expect(f2.alumno_nombre).toBe('Martín Ruiz');
    expect(f2.continuidad.alumno).toBe('Martín García');
    expect(db.getAlumnosPorVehiculo(vid, '2026-10-06').map(a => a.nombre).sort()).toEqual(['Martín García', 'Martín Ruiz']);
  });
});
