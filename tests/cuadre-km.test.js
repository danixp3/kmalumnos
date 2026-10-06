// Tests de «Cuadrar km»: ordenar por tiempo, detectar km incoherentes, repartir los
// huecos entre las clases sin km, recortar solapes pequeños, aplicar y deshacer.
// Math.random fijo a 0.5 → la variación del reparto es 0 y los km son comprobables.
const db = require('../db');
const { resetData } = require('./helpers');

beforeEach(() => {
  resetData(db);
  jest.spyOn(Math, 'random').mockReturnValue(0.5);
});
afterEach(() => jest.restoreAllMocks());

// Atajo: una clase con hora y marca opcional
function clase(aid, vid, fecha, hora, ki, kf, extra = {}) {
  const id = db.addPractica(aid, vid, fecha, ki, kf);
  const d = require('../db/core').load();
  const p = d.practicas.find(x => x.id === id);
  p.hora_inicio = hora;
  Object.assign(p, extra);
  return id;
}
const kmDe = id => { const p = require('../db/core').load().practicas.find(x => x.id === id); return [p.km_inicial, p.km_final]; };
const propuesta = (vid, opc) => db.proponerCuadreKm(vid, opc);

function escenarioBase() {
  const vid = db.addVehiculo('Taigo', '6664NNM', 1000);
  const aid = db.addAlumno('Ana', 'B', vid);
  return { vid, aid };
}

describe('Cuadrar km · repartir entre clases conocidas', () => {
  test('reparte los km del hueco entre las clases sin km que hay entre dos clases conocidas', () => {
    const { vid, aid } = escenarioBase();
    clase(aid, vid, '2026-09-21', '09:00', 1000, 1030);
    const a = clase(aid, vid, '2026-09-22', '09:00', 0, 0);
    const b = clase(aid, vid, '2026-09-22', '10:00', 0, 0);
    const c = clase(aid, vid, '2026-09-22', '11:00', 0, 0);
    clase(aid, vid, '2026-09-23', '09:00', 1120, 1150);

    const r = propuesta(vid);
    expect(r.cambios).toHaveLength(3);
    // 90 km entre 1030 y 1120 para 3 clases = 30 km cada una, encadenadas
    expect(r.cambios.map(x => [x.despues.km_inicial, x.despues.km_final])).toEqual([[1030, 1060], [1060, 1090], [1090, 1120]]);
    expect(r.huecos).toHaveLength(0);

    // Previsualizar no toca nada
    expect(kmDe(a)).toEqual([0, 0]);
    const ap = db.aplicarCuadreKm(vid, r.cambios);
    expect(ap).toMatchObject({ aplicados: 3, omitidos: 0 });
    expect(kmDe(a)).toEqual([1030, 1060]);
    expect(kmDe(c)).toEqual([1090, 1120]);
    expect(db.getSolapamientos()).toHaveLength(0);
    expect(b).toBeDefined();
  });

  test('las clases repartidas pasan a ser «km calculados» y las de otro programa conservan su marca', () => {
    const { vid, aid } = escenarioBase();
    clase(aid, vid, '2026-09-21', '09:00', 1000, 1030);
    const normal = clase(aid, vid, '2026-09-22', '09:00', 0, 0);
    const anterior = clase(aid, vid, '2026-09-22', '10:00', 0, 0, { tipo_detalle: 'anterior' });
    clase(aid, vid, '2026-09-23', '09:00', 1090, 1120);
    db.aplicarCuadreKm(vid, propuesta(vid).cambios);
    const d = require('../db/core').load();
    expect(d.practicas.find(p => p.id === normal).tipo_detalle).toBe('km_auto');
    expect(d.practicas.find(p => p.id === anterior).tipo_detalle).toBe('anterior');
  });

  test('una fracción de clase (½) recibe la mitad de km', () => {
    const { vid, aid } = escenarioBase();
    clase(aid, vid, '2026-09-21', '09:00', 1000, 1030);
    clase(aid, vid, '2026-09-22', '09:00', 0, 0);
    clase(aid, vid, '2026-09-22', '10:00', 0, 0, { fraccion: 0.5 });
    clase(aid, vid, '2026-09-23', '09:00', 1075, 1100);
    const r = propuesta(vid);
    expect(r.cambios.map(x => x.despues.km_final - x.despues.km_inicial)).toEqual([30, 15]);
  });

  test('con variación aleatoria suma EXACTAMENTE los km del hueco y cada clase tiene al menos 1 km', () => {
    jest.spyOn(Math, 'random').mockRestore();
    const { vid, aid } = escenarioBase();
    clase(aid, vid, '2026-09-21', '09:00', 1000, 1030);
    for (let i = 0; i < 9; i++) clase(aid, vid, '2026-09-22', `${9 + i}:00`.padStart(5, '0'), 0, 0);
    clase(aid, vid, '2026-09-23', '09:00', 1330, 1360);
    for (let rep = 0; rep < 20; rep++) {
      const r = propuesta(vid);
      expect(r.cambios).toHaveLength(9);
      expect(r.cambios[0].despues.km_inicial).toBe(1030);
      expect(r.cambios[8].despues.km_final).toBe(1330);
      for (let i = 1; i < 9; i++) expect(r.cambios[i].despues.km_inicial).toBe(r.cambios[i - 1].despues.km_final);
      expect(r.cambios.every(c => c.despues.km_final - c.despues.km_inicial >= 1)).toBe(true);
    }
  });
});

describe('Cuadrar km · huecos que no se inventan', () => {
  test('si sobran muchos km para pocas clases (faltan clases) NO inventa km y lo anota como hueco', () => {
    const { vid, aid } = escenarioBase();
    clase(aid, vid, '2026-10-01', '09:00', 16000, 16046);
    const g1 = clase(aid, vid, '2026-10-01', '16:00', 0, 0);
    clase(aid, vid, '2026-10-01', '16:45', 0, 0);
    clase(aid, vid, '2026-10-04', '13:20', 17000, 17015);
    const r = propuesta(vid);
    expect(r.cambios).toHaveLength(0);
    expect(r.avisos.some(a => a.tipo === 'faltan_clases' && a.km === 954 && a.clases === 2)).toBe(true);
    expect(r.huecos).toHaveLength(1);
    expect(r.huecos[0]).toMatchObject({ km: 954, clases_sin_km: 2, revisado: false });
    expect(kmDe(g1)).toEqual([0, 0]);
  });

  test('con la opción de rellenar huecos grandes pone km típicos a continuación de la clase anterior', () => {
    const { vid, aid } = escenarioBase();
    clase(aid, vid, '2026-10-01', '09:00', 16000, 16046);
    clase(aid, vid, '2026-10-01', '16:00', 0, 0);
    clase(aid, vid, '2026-10-04', '13:20', 17000, 17015);
    const r = propuesta(vid, { rellenarHuecosGrandes: true });
    expect(r.cambios).toHaveLength(1);
    expect(r.cambios[0].despues.km_inicial).toBe(16046);
    expect(r.huecos.length).toBe(1); // lo que sobra sigue siendo hueco
  });

  test('si no caben (muy pocos km para las clases) lo avisa y no cambia nada', () => {
    const { vid, aid } = escenarioBase();
    clase(aid, vid, '2026-10-01', '09:00', 1000, 1030);
    clase(aid, vid, '2026-10-02', '09:00', 0, 0);
    clase(aid, vid, '2026-10-02', '10:00', 0, 0);
    clase(aid, vid, '2026-10-03', '09:00', 1040, 1070);
    const r = propuesta(vid);
    expect(r.cambios).toHaveLength(0);
    expect(r.avisos.some(a => a.tipo === 'no_caben')).toBe(true);
  });

  test('los huecos pequeños (el coche vuelve a la autoescuela) no son un problema; se pueden cerrar si se pide', () => {
    const { vid, aid } = escenarioBase();
    const a = clase(aid, vid, '2026-10-01', '09:00', 1000, 1030);
    clase(aid, vid, '2026-10-01', '10:00', 1038, 1070);
    const r = propuesta(vid);
    expect(r.huecos).toHaveLength(0);
    expect(r.cambios).toHaveLength(0);
    const cerrar = propuesta(vid, { cerrarHuecosPequenos: true });
    expect(cerrar.cambios).toHaveLength(1);
    db.aplicarCuadreKm(vid, cerrar.cambios);
    expect(kmDe(a)).toEqual([1000, 1038]);
  });

  test('un hueco grande entre dos clases sin nada en medio se anota y se puede dar por revisado', () => {
    const { vid, aid } = escenarioBase();
    clase(aid, vid, '2026-10-04', '13:20', 17000, 17015);
    clase(aid, vid, '2026-10-05', '08:41', 17567, 17591);
    const r = propuesta(vid);
    expect(r.huecos).toHaveLength(1);
    expect(r.huecos[0]).toMatchObject({ km: 552, revisado: false });
    expect(r.resumen.huecos).toBe(1);

    db.marcarHuecoRevisado(r.huecos[0].clave);
    const r2 = propuesta(vid);
    expect(r2.huecos[0].revisado).toBe(true);
    expect(r2.resumen.huecos).toBe(0);
    expect(r2.resumen.huecos_revisados).toBe(1);
    // y se puede volver a abrir
    db.marcarHuecoRevisado(r.huecos[0].clave, false);
    expect(propuesta(vid).huecos[0].revisado).toBe(false);
  });
});

describe('Cuadrar km · km incoherentes (el caso del Taigo)', () => {
  test('una clase con inicial 0 y final 30 se recoloca entre la anterior y la siguiente, y la siguiente deja de «culparse»', () => {
    const { vid, aid } = escenarioBase();
    clase(aid, vid, '2026-10-05', '09:27', 17591, 17614, { source: 'web-remote', tipo_detalle: 'km_auto' });
    const rota = clase(aid, vid, '2026-10-05', '10:14', 0, 30, { source: 'web-remote', tipo_detalle: 'anotada' });
    const sig = clase(aid, vid, '2026-10-05', '11:29', 17653, 17678, { source: 'web-remote', tipo_detalle: 'km_auto' });

    // Antes: la clase siguiente aparecía con «+17.623 km sin asignar»
    const antes = db.getTodasPracticas().find(p => p.id === sig);
    expect(antes.continuidad.diferencia).toBe(39); // ya no se compara con la rota
    const sinCuadrar = db.getTodasPracticas().find(p => p.id === rota);
    expect(sinCuadrar.km_incoherente).toMatch(/inicial a 0/);

    const r = propuesta(vid);
    expect(r.resumen.incoherentes).toBe(1);
    expect(r.cambios).toHaveLength(1);
    expect(r.cambios[0]).toMatchObject({ practica_id: rota, antes: { km_inicial: 0, km_final: 30 }, despues: { km_inicial: 17614, km_final: 17653 }, tipo: 'corregir' });

    db.aplicarCuadreKm(vid, r.cambios);
    expect(kmDe(rota)).toEqual([17614, 17653]);
    expect(db.getTodasPracticas().find(p => p.id === rota).km_incoherente).toBeFalsy();
    expect(propuesta(vid).cambios).toHaveLength(0);
  });

  test('un km tecleado con un dígito de más no arrastra a todas las siguientes: es la rara la que cede', () => {
    const { vid, aid } = escenarioBase();
    clase(aid, vid, '2026-10-05', '08:00', 17000, 17025, { source: 'web-remote' });
    const mala = clase(aid, vid, '2026-10-05', '09:00', 71025, 71050, { source: 'web-remote', tipo_detalle: 'km_auto' });
    clase(aid, vid, '2026-10-05', '10:00', 17025, 17050, { source: 'web-remote' });
    clase(aid, vid, '2026-10-05', '11:00', 17050, 17075, { source: 'web-remote' });
    const r = propuesta(vid);
    // No queda un solo km libre entre las vecinas: la rara se deja sin km (no se inventan km falsos)
    expect(r.cambios).toHaveLength(1);
    expect(r.cambios[0]).toMatchObject({ practica_id: mala, tipo: 'vaciar', despues: { km_inicial: 0, km_final: 0 } });
    db.aplicarCuadreKm(vid, r.cambios);
    expect(kmDe(mala)).toEqual([0, 0]);
    expect(db.getTodasPracticas().filter(p => p.km_incoherente)).toHaveLength(0);
    // …y si hay km libres, se coloca ahí
    const { vid: v2, aid: a2 } = escenarioBase();
    clase(a2, v2, '2026-10-05', '08:00', 17000, 17025, { source: 'web-remote' });
    const mala2 = clase(a2, v2, '2026-10-05', '09:00', 71025, 71050, { source: 'web-remote', tipo_detalle: 'km_auto' });
    clase(a2, v2, '2026-10-05', '10:00', 17050, 17075, { source: 'web-remote' });
    const r2 = propuesta(v2);
    expect(r2.cambios[0]).toMatchObject({ practica_id: mala2, tipo: 'corregir', despues: { km_inicial: 17025, km_final: 17050 } });
  });

  test('una clase de cientos de km se considera un error de tecleo', () => {
    const { vid, aid } = escenarioBase();
    clase(aid, vid, '2026-10-05', '08:00', 17000, 17025);
    const enorme = clase(aid, vid, '2026-10-05', '09:00', 17025, 17825);
    clase(aid, vid, '2026-10-05', '10:00', 17055, 17080);
    const r = propuesta(vid);
    expect(r.resumen.incoherentes).toBe(1);
    expect(r.cambios[0]).toMatchObject({ practica_id: enorme, despues: { km_inicial: 17025, km_final: 17055 } });
  });

  test('un solape pequeño (unos pocos km) se recorta en la clase menos fiable sin descartar nada', () => {
    const { vid, aid } = escenarioBase();
    const auto = clase(aid, vid, '2026-10-05', '08:41', 17567, 17591, { source: 'web-remote', tipo_detalle: 'km_auto' });
    clase(aid, vid, '2026-10-05', '09:27', 17588, 17612, { source: 'web-remote' });
    const r = propuesta(vid);
    expect(r.cambios).toHaveLength(1);
    expect(r.cambios[0]).toMatchObject({ practica_id: auto, tipo: 'recorte', despues: { km_inicial: 17567, km_final: 17588 } });
    db.aplicarCuadreKm(vid, r.cambios);
    expect(db.getSolapamientos()).toHaveLength(0);
    // recortar no marca la clase como calculada
    expect(require('../db/core').load().practicas.find(p => p.id === auto).tipo_detalle).toBe('km_auto');
  });

  test('las clases en curso no se tocan y su km inicial sirve de referencia', () => {
    const { vid, aid } = escenarioBase();
    clase(aid, vid, '2026-10-06', '08:43', 17793, 17816, { source: 'web-remote', tipo_detalle: 'km_auto' });
    const hoy = require('../db/core').hoyLocalISO();
    const abierta = clase(aid, vid, hoy, '10:18', 17839, 0, { source: 'web-remote' });
    const r = propuesta(vid);
    expect(r.cambios.find(c => c.practica_id === abierta)).toBeUndefined();
    expect(r.resumen.abiertas).toBe(1);
  });
});

describe('Cuadrar km · clases anteriores y posteriores a las conocidas', () => {
  function conAntiguas() {
    const { vid, aid } = escenarioBase();
    const a1 = clase(aid, vid, '2026-09-01', '09:00', 0, 0, { tipo_detalle: 'anterior' });
    const a2 = clase(aid, vid, '2026-09-02', '09:00', 0, 0, { tipo_detalle: 'anterior' });
    clase(aid, vid, '2026-10-03', '11:04', 295053, 295079, { source: 'web-remote' });
    const p1 = clase(aid, vid, '2026-10-04', '09:00', 0, 0);
    return { vid, aid, a1, a2, p1 };
  }

  test('por defecto NO inventa km antes de la primera ni después de la última clase conocida, solo avisa', () => {
    const { vid } = conAntiguas();
    const r = propuesta(vid);
    expect(r.cambios).toHaveLength(0);
    expect(r.avisos.map(a => a.tipo).sort()).toEqual(['sin_km_antes', 'sin_km_despues']);
  });

  test('con las opciones activas rellena hacia atrás y hacia delante con km típicos y encadenados', () => {
    const { vid, a1, a2, p1 } = conAntiguas();
    const r = propuesta(vid, { rellenarAntes: true, rellenarDespues: true });
    expect(r.cambios).toHaveLength(3);
    db.aplicarCuadreKm(vid, r.cambios);
    const [i2, f2] = kmDe(a2);
    expect(f2).toBe(295053);              // la última anterior acaba donde empieza lo conocido
    expect(kmDe(a1)[1]).toBe(i2);         // y se encadena hacia atrás
    expect(kmDe(p1)[0]).toBe(295079);     // la posterior sigue donde acabó la conocida
    expect(db.getSolapamientos()).toHaveLength(0);
  });
});

describe('Cuadrar km · aplicar y deshacer', () => {
  test('solo se aplica a las clases que siguen como en la vista previa', () => {
    const { vid, aid } = escenarioBase();
    clase(aid, vid, '2026-09-21', '09:00', 1000, 1030);
    const a = clase(aid, vid, '2026-09-22', '09:00', 0, 0);
    clase(aid, vid, '2026-09-23', '09:00', 1060, 1090);
    const r = propuesta(vid);
    db.updatePractica(a, '2026-09-22', 1031, 1058); // alguien la edita mientras se miraba la vista previa
    const ap = db.aplicarCuadreKm(vid, r.cambios);
    expect(ap.aplicados).toBe(0);
    expect(ap.errores[0]).toMatch(/vista previa/);
    expect(kmDe(a)).toEqual([1031, 1058]);
  });

  test('deshacer devuelve las clases a como estaban (y quita la marca de calculados)', () => {
    const { vid, aid } = escenarioBase();
    clase(aid, vid, '2026-09-21', '09:00', 1000, 1030);
    const a = clase(aid, vid, '2026-09-22', '09:00', 0, 0);
    clase(aid, vid, '2026-09-23', '09:00', 1060, 1090);
    db.aplicarCuadreKm(vid, propuesta(vid).cambios);
    expect(kmDe(a)).toEqual([1030, 1060]);
    expect(db.getCuadresKm()).toHaveLength(1);

    const des = db.deshacerCuadreKm();
    expect(des).toMatchObject({ deshechos: 1, omitidos: 0 });
    expect(kmDe(a)).toEqual([0, 0]);
    expect(require('../db/core').load().practicas.find(p => p.id === a).tipo_detalle).toBeUndefined();
    expect(db.getCuadresKm()).toHaveLength(0);
  });

  test('si una clase se tocó después del cuadre, deshacer la respeta', () => {
    const { vid, aid } = escenarioBase();
    clase(aid, vid, '2026-09-21', '09:00', 1000, 1030);
    const a = clase(aid, vid, '2026-09-22', '09:00', 0, 0);
    const b = clase(aid, vid, '2026-09-22', '10:00', 0, 0);
    clase(aid, vid, '2026-09-23', '09:00', 1090, 1120);
    db.aplicarCuadreKm(vid, propuesta(vid).cambios);
    db.updatePractica(a, '2026-09-22', 1031, 1061);
    const des = db.deshacerCuadreKm();
    expect(des).toMatchObject({ deshechos: 1, omitidos: 1 });
    expect(kmDe(a)).toEqual([1031, 1061]);
    expect(kmDe(b)).toEqual([0, 0]);
  });

  test('marca los cambios para subirlos a la nube y sube el odómetro del coche', () => {
    const { vid, aid } = escenarioBase();
    clase(aid, vid, '2026-09-21', '09:00', 1000, 1030);
    const a = clase(aid, vid, '2026-09-22', '09:00', 0, 0);
    clase(aid, vid, '2026-09-23', '09:00', 1060, 1090);
    const sync = require('../sync');
    const marcar = jest.spyOn(sync, 'markDirtyVarios');
    db.aplicarCuadreKm(vid, propuesta(vid).cambios);
    expect(marcar).toHaveBeenCalledWith('practicas', [a]);
    expect(db.getVehiculos().find(v => v.id === vid).km_actual).toBe(1090);
  });
});

describe('Cuadrar km · resumen para avisar', () => {
  test('getResumenCuadreKm cuenta por coche lo que hay por cuadrar y los huecos de verdad', () => {
    const { vid, aid } = escenarioBase();
    const limpio = db.addVehiculo('Limpio', '', 100);
    db.addPractica(aid, limpio, '2026-10-01', 100, 125);
    clase(aid, vid, '2026-10-04', '13:20', 17000, 17015);
    clase(aid, vid, '2026-10-05', '08:41', 17567, 17591);
    clase(aid, vid, '2026-10-05', '09:27', 17591, 17614);
    clase(aid, vid, '2026-10-05', '10:14', 0, 30);
    clase(aid, vid, '2026-10-05', '11:29', 17653, 17678);
    const res = db.getResumenCuadreKm();
    const taigo = res.find(x => x.vehiculo_id === vid);
    const otro = res.find(x => x.vehiculo_id === limpio);
    expect(otro.problemas).toBe(0);
    expect(taigo.incoherentes).toBe(1);
    expect(taigo.huecos).toBe(1);          // los 552 km del domingo al lunes
    expect(taigo.km_en_huecos).toBe(552);
    expect(taigo.problemas).toBeGreaterThanOrEqual(2);
  });
});

describe('Cuadrar km · cadena óptima y rendimiento', () => {
  // Generador determinista (Math.random está fijado a 0.5 en estos tests)
  const lcg = semilla => () => (semilla = (semilla * 1664525 + 1013904223) % 4294967296) / 4294967296;

  test('la cadena elegida pesa lo mismo que la óptima calculada a la fuerza bruta', () => {
    const { vid, aid } = escenarioBase();
    const azar = lcg(7);
    const marcas = [undefined, 'km_auto', 'anterior', 'anotada'];
    let km = 20000;
    for (let i = 0; i < 70; i++) {
      const dia = 1 + Math.floor(i / 4);
      const ki = Math.random() < 2 ? km : km;
      const loco = azar() < 0.18;            // km tecleados mal: saltan arriba o abajo
      const ini = loco ? km + Math.round((azar() - 0.5) * 4000) : ki;
      const fin = ini + 15 + Math.round(azar() * 20);
      clase(aid, vid, `2026-09-${String(dia).padStart(2, '0')}`, `${String(8 + (i % 4)).padStart(2, '0')}:00`, Math.max(1, ini), Math.max(2, fin), { tipo_detalle: marcas[Math.floor(azar() * 4)], source: 'web-remote' });
      km += 25;
    }
    const A = db._analizarCoche(require('../db/core').load(), vid);
    const cand = A.items.filter(it => it.enCadena !== undefined);
    const mejor = new Array(cand.length).fill(0);
    let optimo = 0;
    for (let j = 0; j < cand.length; j++) {
      let base = 0;
      for (let i = 0; i < j; i++) if (cand[i].kf <= cand[j].ki && mejor[i] > base) base = mejor[i];
      mejor[j] = base + cand[j].conf + 0.001;
      optimo = Math.max(optimo, mejor[j]);
    }
    const elegido = cand.filter(it => it.enCadena).reduce((s, it) => s + it.conf + 0.001, 0);
    expect(elegido).toBeCloseTo(optimo, 6);
    // y lo elegido es una cadena que nunca baja
    const cadena = cand.filter(it => it.enCadena);
    for (let i = 1; i < cadena.length; i++) expect(cadena[i].ki).toBeGreaterThanOrEqual(cadena[i - 1].kf);
  });

  test('con miles de clases en un coche sigue siendo rápido', () => {
    const { vid, aid } = escenarioBase();
    const d = require('../db/core').load();
    let km = 50000, id = 5000;
    for (let i = 0; i < 6000; i++) {
      const dia = new Date(2024, 0, 1 + Math.floor(i / 8)).toISOString().slice(0, 10);
      const sinKm = i % 5 === 0;
      d.practicas.push({ id: ++id, alumno_id: aid, vehiculo_id: vid, fecha: dia, hora_inicio: `${String(8 + (i % 8)).padStart(2, '0')}:00`,
        km_inicial: sinKm ? 0 : km, km_final: sinKm ? 0 : km + 24, tipo: 'circulacion', source: 'web-remote' });
      km += 24;
    }
    const t0 = Date.now();
    const r = propuesta(vid);
    db.getTodasPracticas({ vehiculo_id: vid });
    const ms = Date.now() - t0;
    expect(r.cambios.length).toBeGreaterThan(1000);   // reparte las clases en blanco entre las conocidas
    expect(r.resumen.huecos).toBe(0);
    expect(ms).toBeLessThan(4000);
  });
});
