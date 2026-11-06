// Invariantes entre pantallas: con datos aleatorios (¼ ½ ¾, clases sin km, abiertas, de pista, borrados…) todas las
// cifras que cuentan clases o km tienen que coincidir entre sí. Si una pantalla vuelve a contar filas o a restar km de una
// clase abierta, esto lo caza aunque nadie pensara en ese caso.
const db = require('../db');
const { resetData } = require('./helpers');

beforeEach(() => { resetData(db); });

// Generador pseudoaleatorio con semilla (reproducible)
function rng(semilla) { let s = semilla >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }

function escenario(semilla) {
  const r = rng(semilla);
  const elige = l => l[Math.floor(r() * l.length)];
  const hoy = new Date(); const iso = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const vehs = [db.addVehiculo('A', '1111AAA', 1000), db.addVehiculo('B', '2222BBB', 5000)];
  const profs = [db.addProfesor('P1'), db.addProfesor('P2')];
  const alumnos = Array.from({ length: 6 }, (_, i) => db.addAlumno('Alumno ' + i, 'B', elige(vehs), elige(profs)));
  for (const a of alumnos) if (r() < 0.4) db.setPuntoDePartidaAlumno(a, elige([1, 1.5, 2.25, 3]), r() < 0.5 ? 0 : 100);
  const cursor = new Map(vehs.map(v => [v, db.getVehiculos().find(x => x.id === v).km_actual]));
  const n = 25 + Math.floor(r() * 15);
  for (let i = 0; i < n; i++) {
    const a = elige(alumnos), v = elige(vehs), p = elige(profs);
    const dia = new Date(hoy); dia.setDate(dia.getDate() - Math.floor(r() * 40));
    const tipoKm = r();
    let id;
    if (tipoKm < 0.12) id = db.addPractica(a, v, iso(dia), 0, 0, p);                       // sin km
    else if (tipoKm < 0.18) { const ki = cursor.get(v); id = db.addPractica(a, v, iso(hoy), ki, 0, p); }  // abierta hoy
    else if (tipoKm < 0.22) { const ki = cursor.get(v); id = db.addPractica(a, v, iso(dia), ki, 0, p); }  // sin cerrar
    else { const ki = cursor.get(v), kf = ki + 5 + Math.floor(r() * 40); cursor.set(v, kf); id = db.addPractica(a, v, iso(dia), ki, kf, p); }
    const f = r();
    if (f < 0.2) { const pr = db.getPracticasByAlumno(a).find(x => x.id === id); db.updatePractica(id, pr.fecha, pr.km_inicial, pr.km_final, p, r() < 0.15 ? 'pista' : 'circulacion', null, elige([0.25, 0.5, 0.75])); }
  }
  return { alumnos, vehs, profs, hoy: iso(hoy) };
}

const SEMILLAS = [1, 7, 42, 99, 2026, 31337];

describe.each(SEMILLAS)('invariantes con datos aleatorios (semilla %i)', semilla => {
  test('las clases de cada alumno suman lo mismo en la lista, la ficha y la lista global; los totales cuadran', () => {
    const { alumnos, hoy } = escenario(semilla);
    const clasesDe = p => (p.fraccion > 0 && p.fraccion < 1 ? p.fraccion : 1);
    const global = db.getTodasPracticas({ hoy });
    const lista = db.getAlumnosLista(undefined, hoy);
    for (const a of alumnos) {
      const hechas = global.filter(p => p.alumno_id === a && !p.en_curso);
      const previas = (db.getAlumnos().find(x => x.id === a).clases_previas) || 0;
      const esperado = Math.round((hechas.reduce((t, p) => t + clasesDe(p), 0) + previas) * 4) / 4;
      const fila = lista.find(x => x.id === a);
      expect(fila.num_practicas).toBe(esperado);
      expect(db.getFichaAlumno(a, hoy).metricas.clases).toBe(esperado);
    }
    // el total de clases de la autoescuela es el mismo en el resumen y en la lista global
    const total = Math.round(global.reduce((t, p) => t + clasesDe(p), 0) * 4) / 4;
    expect(db.getResumen().practicas).toBe(total);
  });

  test('los km nunca salen negativos: ni por profesor, ni por coche, ni en el Panel, ni en los gráficos', () => {
    const { hoy } = escenario(semilla);
    for (const p of db.getStatsProfesores()) expect(p.km_totales).toBeGreaterThanOrEqual(0);
    const g = db.getDatosGraficos(3);
    for (const p of g.porProfesor) expect(p.km).toBeGreaterThanOrEqual(0);
    for (const v of g.porVehiculo) expect(v.km).toBeGreaterThanOrEqual(0);
    for (const m of g.kmPorMes) expect(m.km).toBeGreaterThanOrEqual(0);
    const panel = db.getPanel(hoy);
    expect(panel.kmMes).toBeGreaterThanOrEqual(0);
    for (const v of db.getAnalisisVehiculos()) { expect(v.kmTotales).toBeGreaterThanOrEqual(0); expect(v.mediaKmPractica).toBeGreaterThanOrEqual(0); }
    for (const v of db.getPanelVehiculos(hoy).vehiculos) expect(v.km_en_practicas_mes).toBeGreaterThanOrEqual(0);
  });

  test('los km por coche coinciden entre los gráficos, el análisis y la suma de las clases cerradas', () => {
    escenario(semilla);
    const global = db.getTodasPracticas({});
    const g = db.getDatosGraficos(60);
    for (const v of db.getAnalisisVehiculos()) {
      const cerradas = global.filter(p => p.vehiculo_id === v.vehiculo_id && !p.sin_km && !p.en_curso && !p.sin_cerrar);
      const suma = Math.round(cerradas.reduce((t, p) => t + p.km_recorridos, 0) * 10) / 10;
      expect(v.kmTotales).toBe(suma);
      const grafico = g.porVehiculo.find(x => x.nombre === db.getVehiculos().find(y => y.id === v.vehiculo_id).nombre);
      if (grafico) expect(grafico.km).toBe(suma);
    }
  });

  test('las deudas y el desglose coinciden con el número de clases y nunca dejan céntimos sueltos', () => {
    const { alumnos } = escenario(semilla);
    db.setTarifa('B', 'circulacion', 17.35);
    db.setTarifa('B', 'pista', 12.1);
    for (const a of alumnos) db.addPago(a, '2026-10-01', 33.33, 'pago');
    for (const d of db.getDeudas()) {
      expect(Math.round(d.saldo * 100) / 100).toBe(d.saldo);
      expect(Math.round(d.total_generado * 100) / 100).toBe(d.total_generado);
      const des = db.getDesglosePagosAlumno(d.alumno_id);
      expect(des.saldo).toBe(d.saldo);
      expect(des.total_generado).toBe(d.total_generado);
    }
  });

  test('borrar a un alumno no deja nada suyo colgando (clases, reservas, exámenes, caducidades) y los demás no cambian', () => {
    const { alumnos, vehs } = escenario(semilla);
    for (const a of alumnos) { db.addReserva({ alumno_id: a, vehiculo_id: vehs[0], fecha: '2026-11-01' }); db.addPresentacion({ alumno_id: a, tipo: 'teorico', fecha: '2026-11-02' }); }
    const antesOtros = db.getTodasPracticas({}).filter(p => p.alumno_id !== alumnos[0]).length;
    db.deleteAlumno(alumnos[0]);
    expect(db.getTodasPracticas({}).some(p => p.alumno_id === alumnos[0])).toBe(false);
    expect(db.getReservas().some(r => r.alumno_id === alumnos[0])).toBe(false);
    expect(db.getPresentaciones().some(x => x.alumno_id === alumnos[0])).toBe(false);
    expect(db.getTodasPracticas({}).filter(p => p.alumno_id !== alumnos[0]).length).toBe(antesOtros);
  });
});

// ─── Cuadrar km con datos revueltos ──────────────────────────────────────────
function cocheRevuelto(semilla) {
  const r = rng(semilla);
  const vid = db.addVehiculo('Revuelto', '3333CCC', 0);
  const aid = db.addAlumno('Ana', 'B', vid);
  const hoy = new Date();
  const iso = k => { const d = new Date(hoy); d.setDate(d.getDate() - k); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
  let km = 20000;
  const ids = [];
  for (let i = 40; i >= 1; i--) {
    const q = r();
    let ki, kf;
    if (q < 0.15) { ki = 0; kf = 0; }                                        // sin km
    else if (q < 0.22) { ki = 0; kf = km + 30; }                             // inicial a 0
    else if (q < 0.28) { ki = km + 50; kf = km + 10; }                       // final menor que inicial
    else if (q < 0.34) { ki = km - 200; kf = km - 160; }                     // km antiguos (pisa a otras)
    else { ki = km; kf = km + 15 + Math.floor(r() * 40); km = kf; }
    const id = db.addPractica(aid, vid, iso(i), ki, kf);
    if (r() < 0.15) { const p = db.getTodasPracticas({}).find(x => x.id === id); db.updatePractica(id, p.fecha, ki, kf, null, 'circulacion', null, [0.25, 0.5, 0.75][Math.floor(r() * 3)]); }
    ids.push(id);
  }
  return { vid, ids };
}

describe.each([3, 11, 58, 777, 4242])('Cuadrar km con datos revueltos (semilla %i)', semilla => {
  test('tras cuadrar no queda ninguna clase con km imposibles, no se tocan otras cosas, y volver a cuadrar no cambia nada; deshacer devuelve lo de antes', () => {
    const { vid, ids } = cocheRevuelto(semilla);
    const foto = () => db.getTodasPracticas({}).filter(p => ids.includes(p.id)).map(p => [p.id, p.fecha, p.alumno_id, p.hora_inicio, p.km_inicial, p.km_final, p.fraccion]);
    const antes = foto();
    const prev = db.proponerCuadreKm(vid, { rellenarAntes: true, rellenarDespues: true });
    const ap = db.aplicarCuadreKm(vid, prev.cambios);
    if (prev.cambios.length) expect(ap.aplicados).toBe(prev.cambios.length);
    const despues = foto();
    // nunca cambia fecha, hora, alumno ni la fracción: solo km
    expect(despues.map(x => [x[0], x[1], x[2], x[3], x[6]])).toEqual(antes.map(x => [x[0], x[1], x[2], x[3], x[6]]));
    // ninguna clase con km imposibles (inicial 0 con final, o final <= inicial)
    for (const [, , , , ki, kf] of despues) {
      if (ki === 0 && kf === 0) continue;
      expect(ki).toBeGreaterThan(0);
      expect(kf).toBeGreaterThan(ki);
    }
    // el cuentakilómetros va siempre hacia delante entre las clases con km (orden por fecha)
    const ordenadas = despues.filter(x => x[5] > 0).sort((a, b) => a[1].localeCompare(b[1]) || a[0] - b[0]);
    for (let i = 1; i < ordenadas.length; i++) expect(ordenadas[i][4]).toBeGreaterThanOrEqual(ordenadas[i - 1][5] - 0);
    // idempotente: volver a cuadrar no propone cambios
    expect(db.proponerCuadreKm(vid, { rellenarAntes: true, rellenarDespues: true }).cambios).toHaveLength(0);
    // deshacer devuelve exactamente lo de antes
    if (prev.cambios.length) { db.deshacerCuadreKm(ap.cuadre_id); expect(foto()).toEqual(antes); }
  });
});
