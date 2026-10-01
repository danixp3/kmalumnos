// Puesta en marcha con datos reales y punto de partida del alumno (2026-10-01).
const fs = require('fs');
const path = require('path');
const db = require('../db');
const { resetData, userDataDir } = require('./helpers');

beforeEach(() => resetData(db));

test('guardar de una vez vehículos (km real), profesores y alumnos con su punto de partida', () => {
  const r = db.guardarPuestaEnMarcha({
    vehiculos: [{ nombre: 'Kia Rojo', matricula: '1954 lyt', km_actual: '190692' }],
    profesores: [{ nombre: 'Daniel' }],
    alumnos: [
      { nombre: 'David', primer_apellido: 'Vila', permiso: 'B', clases_previas: '12', km_previos: '540' },
      { nombre: '', primer_apellido: '', clases_previas: '' } // fila vacía: se ignora
    ]
  });
  expect(r.ok).toBe(true);
  expect(r.creados).toEqual({ vehiculos: 1, profesores: 1, alumnos: 1 });
  const v = db.getVehiculos()[0];
  expect([v.matricula, v.km_actual]).toEqual(['1954 LYT', 190692]);
  const pm = db.getPuestaEnMarcha();
  expect(pm.alumnos[0]).toMatchObject({ nombre: 'David', primer_apellido: 'Vila', clases_previas: 12, km_previos: 540 });

  // Actualizar: se asigna profesor y vehículo al alumno ya creado
  const r2 = db.guardarPuestaEnMarcha({ alumnos: [{ ...pm.alumnos[0], profesor_id: pm.profesores[0].id, vehiculo_id: v.id }] });
  expect(r2.actualizados.alumnos).toBe(1);
  expect(db.getPuestaEnMarcha().resumen.alumnos_sin_profesor).toBe(0);
});

test('valida antes de guardar: matrícula repetida o alumno sin nombre con datos → no guarda nada', () => {
  db.addVehiculo('Coche 1', '1111AAA', 1000);
  const r = db.guardarPuestaEnMarcha({
    vehiculos: [{ nombre: 'Coche 2', matricula: '1111 aaa', km_actual: 5 }],
    alumnos: [{ nombre: '', primer_apellido: 'Sin nombre', clases_previas: 3 }]
  });
  expect(r.ok).toBe(false);
  expect(r.errores.length).toBe(2);
  expect(db.getVehiculos()).toHaveLength(1);
  expect(db.getAlumnos()).toHaveLength(0);
});

test('el punto de partida continúa la numeración y suma a los totales, sin crear prácticas', () => {
  const vid = db.addVehiculo('Coche', '', 190000);
  const aid = db.addAlumno('Ana', 'B', vid);
  db.setPuntoDePartidaAlumno(aid, 10, 450);
  db.addPractica(aid, vid, '2026-10-01', 190000, 190045);
  const ficha = db.getFichaAlumno(aid, '2026-10-02');
  expect(ficha.practicas[0].n).toBe(11);
  expect(ficha.metricas.clases).toBe(11);
  expect(ficha.metricas.km).toBe(495);
  const fila = db.getAlumnosLista(undefined, '2026-10-02').find(a => a.id === aid);
  expect([fila.num_practicas, fila.km_total, fila.num_practicas_app]).toEqual([11, 495, 1]);
  expect(db.getSemaforoAlumno(aid).nPracticas).toBe(11);
  expect(db.getPracticasByAlumno(aid)).toHaveLength(1); // no se inventan prácticas
});

test('vaciar datos de prueba: copia de seguridad previa, borra alumnos y lo suyo; vehículos opcional', () => {
  const vid = db.addVehiculo('Coche', '', 1000);
  const aid = db.addAlumno('Prueba', 'B', vid);
  db.addPractica(aid, vid, '2026-09-01', 1000, 1040);
  db.addPago(aid, '2026-09-01', 30, '');
  const r = db.vaciarDatosDePrueba({ vehiculos: false });
  expect(r.ok).toBe(true);
  expect(fs.existsSync(r.copia)).toBe(true);
  expect(db.getAlumnos()).toHaveLength(0);
  expect(db.getPracticasByAlumno(aid)).toHaveLength(0);
  expect(db.getVehiculos()).toHaveLength(1);
  const pend = JSON.parse(fs.readFileSync(path.join(userDataDir, 'pending_sync.json'), 'utf-8'));
  expect(pend.deleted.alumnos).toContain(aid);
  expect(pend.deleted.practicas.length).toBe(1);
  expect(pend.deleted.pagos.length).toBe(1);
});

test('zonas de prácticas: limpia, sin duplicados y queda pendiente de subir', () => {
  expect(db.setZonasPractica([' Centro ', 'centro', 'Polígono', '', 'Autovía'])).toEqual(['Centro', 'Polígono', 'Autovía']);
  expect(db.getZonasPractica()).toEqual(['Centro', 'Polígono', 'Autovía']);
  const pend = JSON.parse(fs.readFileSync(path.join(userDataDir, 'pending_sync.json'), 'utf-8'));
  expect(pend.ajustes_empresa).toEqual(['zonas']);
});

test('minutos por clase: se comparte con la web (ajustes_empresa), valida el rango y no se re-marca si no cambia', () => {
  expect(db.getDuracionClase()).toBeNull();
  expect(db.setDuracionClase(50)).toBe(50);
  expect(db.getDuracionClase()).toBe(50);
  expect(db.setDuracionClase(3)).toBe(50);      // fuera de rango: se ignora
  const pend = JSON.parse(fs.readFileSync(path.join(userDataDir, 'pending_sync.json'), 'utf-8'));
  expect(pend.ajustes_empresa).toEqual(['duracion_clase_min']);
});

test('la firma del móvil llega a la ficha imprimible y al detalle de la clase; una firma no válida se ignora', () => {
  const vid = db.addVehiculo('Coche', '1234ABC', 1000);
  const aid = db.addAlumno('Ana', 'B', vid);
  db.setPuntoDePartidaAlumno(aid, 4, 100);
  const pid = db.addPractica(aid, vid, '2026-10-01', 1000, 1040);
  const pid2 = db.addPractica(aid, vid, '2026-10-02', 1040, 1080);
  const d = JSON.parse(fs.readFileSync(path.join(userDataDir, 'data.json'), 'utf-8'));
  d.practicas.find(p => p.id === pid).firma = 'data:image/png;base64,iVBORw0KGgo=';
  d.practicas.find(p => p.id === pid).zonas = ['Centro'];
  d.practicas.find(p => p.id === pid2).firma = 'javascript:alert(1)';
  fs.writeFileSync(path.join(userDataDir, 'data.json'), JSON.stringify(d));
  db._clearCache();
  const ficha = db.getFichaPracticasAlumno(aid);
  expect(ficha.practicas.map(p => [p.n, !!p.firma])).toEqual([[5, true], [6, false]]);
  expect(ficha.totales).toMatchObject({ clasesPrevias: 4, kmPrevios: 100 });
  const det = db.getPracticaDetalle(pid);
  expect(det).toMatchObject({ clase_n: 5, zonas: ['Centro'], matricula: '1234ABC', km: 40 });
  expect(det.firma).toMatch(/^data:image\/png;base64,/);
  expect(db.getPracticaDetalle(pid2).firma).toBeNull();
  expect(db.getTodasPracticas({}).find(p => p.id === pid)).toMatchObject({ firmada: true, clase_n: 5, zonas: ['Centro'] });
});
