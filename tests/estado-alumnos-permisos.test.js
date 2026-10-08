// Estado de los alumnos (inactivos fuera de avisos), caducidades y permisos de los vehículos (2026-10-09).
const db = require('../db');
const { resetData } = require('./helpers');

beforeEach(() => { resetData(db); });

test('setEstadoAlumnos cambia varios a la vez, valida el estado y se deshace', () => {
  const a1 = db.addAlumno('Ana', 'B', null);
  const a2 = db.addAlumno('Beto', 'B', null);
  expect(db.setEstadoAlumnos([a1, a2], 'rarisimo').ok).toBe(false);
  const r = db.setEstadoAlumnos([a1, a2, 999], 'inactivo');
  expect(r).toMatchObject({ ok: true, cambiados: 2 });
  expect(db.getAlumnos().map(a => a.estado)).toEqual(['inactivo', 'inactivo']);
  // Sin cambios reales no hay nada que deshacer
  expect(db.setEstadoAlumnos([a1], 'inactivo').cambiados).toBe(0);
  db.restaurarEstadosAlumnos(r.anteriores);
  expect(db.getAlumnos().map(a => a.estado)).not.toContain('inactivo');
});

test('un alumno inactivo no sale en el semáforo, el riesgo de abandono ni los bonos casi agotados', () => {
  const v = db.addVehiculo('Coche', '1111AAA', 0);
  const a = db.addAlumno('Ana', 'B', v);
  db.addPractica(a, v, '2025-01-10', 0, 40);
  expect(db.getAlumnosEnRiesgo().map(x => x.alumno_id)).toContain(a);
  expect(db.getSemaforoExamen().map(x => x.alumno_id)).toContain(a);
  db.setEstadoAlumnos([a], 'inactivo');
  expect(db.getAlumnosEnRiesgo().map(x => x.alumno_id)).not.toContain(a);
  expect(db.getSemaforoExamen().map(x => x.alumno_id)).not.toContain(a);
  db.setEstadoAlumnos([a], 'en_practicas');
  expect(db.getAlumnosEnRiesgo().map(x => x.alumno_id)).toContain(a);
});

test('las caducidades de alumnos que ya no vienen (y de coches retirados) no avisan y se marcan en la lista', () => {
  const v = db.addVehiculo('Coche viejo', '9999ZZZ', 0);
  const a = db.addAlumno('Ana', 'B', null);
  const hoy = '2026-10-09';
  db.addVencimiento({ entidad_tipo: 'alumno', entidad_id: a, tipo: 'DNI', fecha_vencimiento: '2026-10-20' });
  db.addVencimiento({ entidad_tipo: 'vehiculo', entidad_id: v, tipo: 'ITV', fecha_vencimiento: '2026-10-15' });
  expect(db.getProximosVencimientos(30, hoy)).toHaveLength(2);
  db.setEstadoAlumnos([a], 'baja');
  db.setVehiculoActivo(v, false);
  expect(db.getProximosVencimientos(30, hoy)).toHaveLength(0);
  // En la pantalla de Caducidades siguen, marcadas
  expect(db.getVencimientos().map(x => !!x.entidad_terminada)).toEqual([true, true]);
});

test('proponerAlumnosInactivos: sin clases desde hace meses, sin nada por delante y avisando de las deudas', () => {
  const v = db.addVehiculo('Coche', '1111AAA', 0);
  const viejo = db.addAlumno('Viejo', 'B', v, null, null, null, { fecha_alta: '2025-01-01' });                // nunca dio clase
  const parado = db.addAlumno('Parado', 'B', v, null, null, null, { fecha_alta: '2025-02-01' });
  const activo = db.addAlumno('Activo', 'B', v, null, null, null, { fecha_alta: '2025-02-01' });
  const conExamen = db.addAlumno('Con examen', 'B', v, null, null, null, { fecha_alta: '2025-01-01' });
  const nuevo = db.addAlumno('Nuevo', 'B', v, null, null, null, { fecha_alta: '2026-09-15' });
  const sinFecha = db.addAlumno('Sin fecha', 'B', v);
  db.addPractica(parado, v, '2025-03-01', 0, 40);
  db.addPractica(activo, v, '2026-10-01', 0, 40);
  db.addPresentacion({ alumno_id: conExamen, tipo: 'circulacion', fecha: '2026-10-20' });
  db.setTarifa('B', 'circulacion', 30);
  const r = db.proponerAlumnosInactivos({ meses: 6, hoy: '2026-10-09' });
  const nombres = r.alumnos.map(x => x.nombre);
  expect(nombres).toEqual(expect.arrayContaining(['Viejo', 'Parado']));
  expect(nombres).not.toContain('Activo');
  expect(nombres).not.toContain('Con examen');
  expect(nombres).not.toContain('Nuevo');
  expect(nombres).not.toContain('Sin fecha');
  // Lleva más de 6 meses y debe 30 € de su clase
  expect(r.alumnos.find(x => x.nombre === 'Parado')).toMatchObject({ motivo: 'ultima', debe: 30 });
  expect(r.alumnos.find(x => x.nombre === 'Viejo')).toMatchObject({ motivo: 'sin_clases', debe: 0 });
  // Con un plazo más largo salen menos
  expect(db.proponerAlumnosInactivos({ meses: 24, hoy: '2026-10-09' }).alumnos.map(x => x.nombre)).toEqual([]);
  void viejo; void nuevo; void sinFecha;
});

test('permisos de un coche: se guardan limpios y mandan sobre quién puede usarlo', () => {
  const coche = db.addVehiculo('Coche', '1111AAA', 0, null, { permisos: ['b', 'XX'] });
  const moto = db.addVehiculo('Moto', '2222BBB', 0, null, { permisos: 'A2, A, am' });
  const libre = db.addVehiculo('Sin decir', '3333CCC', 0);
  const por = id => db.getVehiculos().find(v => v.id === id).permisos;
  expect(por(coche)).toBe('B');
  expect(por(moto)).toBe('AM,A2,A');
  expect(por(libre)).toBeNull();
  db.updateVehiculo(moto, 'Moto', '2222BBB', { permisos: [] });
  expect(por(moto)).toBeNull();
});

test('un alumno de moto no ve el coche de B de su profesor: ni se le propone ni se le enseña', () => {
  const coche = db.addVehiculo('Coche', '1111AAA', 0, null, { permisos: 'B' });
  const moto = db.addVehiculo('Moto', '2222BBB', 0, null, { permisos: 'A2,A' });
  const prof = db.addProfesor('Javier', '', null, null, { vehiculo_id: coche });
  const alumnoMoto = db.addAlumno('Luis', 'A2', coche, prof);   // asignado por error al coche del profesor
  const alumnoCoche = db.addAlumno('Ana', 'B', coche, prof);
  const lista = db.getAlumnosLista();
  const luis = lista.find(a => a.id === alumnoMoto), ana = lista.find(a => a.id === alumnoCoche);
  expect(luis.vehiculo_matricula).toBeNull();
  expect(luis.vehiculo_incompatible).toBe(true);
  expect(ana.vehiculo_matricula).toBe('1111AAA');
  // Sugerencia: para A2 la moto aunque el habitual del profesor sea el coche; para B, el coche
  expect(db.sugerirCocheAlumno({ permiso: 'A2', profesor_id: prof })).toBe(moto);
  expect(db.sugerirCocheAlumno({ permiso: 'B', profesor_id: prof })).toBe(coche);
  // Sin coches de ese permiso ni señales claras, no propone nada
  expect(db.sugerirCocheAlumno({ permiso: 'C', profesor_id: prof })).toBeNull();
});

test('registro rápido de una moto: salen sus alumnos por permiso aunque no la tengan asignada', () => {
  const coche = db.addVehiculo('Coche', '1111AAA', 0, null, { permisos: 'B' });
  const moto = db.addVehiculo('Moto', '2222BBB', 0, null, { permisos: 'A2' });
  const luis = db.addAlumno('Luis', 'A2', coche);   // tiene el coche (que no es de su permiso)
  const eva = db.addAlumno('Eva', 'A2', null);      // sin coche
  const ana = db.addAlumno('Ana', 'B', coche);
  const deMoto = db.getAlumnosPorVehiculo(moto, '2026-10-09').map(a => a.id).sort();
  expect(deMoto).toEqual([luis, eva].sort());
  expect(db.getAlumnosPorVehiculo(coche, '2026-10-09').map(a => a.id)).toEqual([ana]);
});

test('sugerirPermisosVehiculo: lo que cuentan las clases dadas (al menos 2 por permiso)', () => {
  const v = db.addVehiculo('Moto', '2222BBB', 0);
  const luis = db.addAlumno('Luis', 'A2', v), ana = db.addAlumno('Ana', 'B', v);
  db.addPractica(luis, v, '2026-09-01', 0, 20); db.addPractica(luis, v, '2026-09-02', 20, 40);
  db.addPractica(ana, v, '2026-09-03', 40, 60);   // una sola de B: no basta
  expect(db.sugerirPermisosVehiculo(v)).toEqual(['A2']);
});

test('los alumnos nuevos de la puesta en marcha no heredan el coche de otro permiso', () => {
  const coche = db.addVehiculo('Coche', '1111AAA', 0, null, { permisos: 'B' });
  const prof = db.addProfesor('Javier', '', null, null, { vehiculo_id: coche });
  const r = db.guardarPuestaEnMarcha({ alumnos: [
    { nombre: 'Luis Moto', permiso: 'A2', profesor_id: prof },
    { nombre: 'Ana Coche', permiso: 'B', profesor_id: prof }
  ] });
  expect(r.ok).toBe(true);
  const por = Object.fromEntries(db.getAlumnos().map(a => [a.nombre, a.vehiculo_id]));
  expect(por['Luis Moto']).toBeNull();
  expect(por['Ana Coche']).toBe(coche);
});

test('Prácticas: filtro por el permiso del alumno', () => {
  const v = db.addVehiculo('Coche', '1111AAA', 0);
  const ana = db.addAlumno('Ana', 'B', v), luis = db.addAlumno('Luis', 'A2', v);
  db.addPractica(ana, v, '2026-09-01', 0, 40); db.addPractica(luis, v, '2026-09-02', 40, 80); db.addPractica(luis, v, '2026-09-03', 80, 120);
  expect(db.getTodasPracticas({ permiso: 'A2' }).map(p => p.alumno_nombre)).toEqual(['Luis', 'Luis']);
  expect(db.getTodasPracticas({ permiso: 'B' }).map(p => [p.alumno_nombre, p.alumno_permiso])).toEqual([['Ana', 'B']]);
  expect(db.getTodasPracticas({}).length).toBe(3);
  expect(db.getTodasPracticas({ permiso: 'CAP' })).toEqual([]);
});
