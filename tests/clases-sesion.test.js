// Tests de «Añadir y editar clases»: sesiones de ¼ en ¼, clases olvidadas que se encajan
// entre otras con sus km, y la firma que se borra cuando cambia el nº de clases.
// Math.random fijo a 0.5 → la variación del reparto es 0 y los km son comprobables.
const db = require('../db');
const core = require('../db/core');
const { resetData } = require('./helpers');

const FIRMA = 'data:image/png;base64,iVBORw0KGgo=';

beforeEach(() => {
  resetData(db);
  jest.spyOn(Math, 'random').mockReturnValue(0.5);
});
afterEach(() => jest.restoreAllMocks());

function clase(aid, vid, fecha, hora, ki, kf, extra = {}) {
  const id = db.addPractica(aid, vid, fecha, ki, kf);
  const p = core.load().practicas.find(x => x.id === id);
  p.hora_inicio = hora;
  Object.assign(p, extra);
  return id;
}
const fila = id => core.load().practicas.find(x => x.id === id);
const kmDe = id => { const p = fila(id); return [p.km_inicial, p.km_final]; };
const vivas = (aid, fecha) => core.load().practicas.filter(p => p.alumno_id === aid && p.fecha === fecha && !p.deleted).sort((a, b) => a.id - b.id);

function escenario() {
  const vid = db.addVehiculo('Taigo', '6664NNM', 1000);
  const ana = db.addAlumno('Ana', 'B', vid);
  const luis = db.addAlumno('Luis', 'B', vid);
  return { vid, ana, luis };
}

describe('Sesiones de clases', () => {
  test('getSesionClase suma las prácticas seguidas del mismo día y coche', () => {
    const { vid, ana } = escenario();
    const a = clase(ana, vid, '2026-10-01', '10:00', 1000, 1040);
    clase(ana, vid, '2026-10-01', '10:45', 1040, 1060, { fraccion: 0.5 });
    clase(ana, vid, '2026-10-01', '18:00', 1200, 1240);     // otra sesión, no seguida
    const s = db.getSesionClase(a);
    expect(s.cantidad).toBe(1.5);
    expect(s.practica_ids).toHaveLength(2);
    expect(s.km_inicial).toBe(1000);
    expect(s.km_final).toBe(1060);
  });
});

describe('Cambiar el número de clases de una sesión', () => {
  test('de 1 a 1 ½ conserva los km totales, los reparte y borra la firma', () => {
    const { vid, ana } = escenario();
    const id = clase(ana, vid, '2026-10-01', '10:00', 1000, 1060, { firma: FIRMA, source: 'web-remote' });
    const prev = db.proponerClase({ practica_id: id, cantidad: 1.5 });
    expect(prev.ok).toBe(true);
    expect(prev.filas).toHaveLength(2);
    expect(prev.filas.map(f => [f.km_inicial, f.km_final])).toEqual([[1000, 1040], [1040, 1060]]);
    expect(prev.firma.borrar).toBe(1);
    expect(prev.avisos.some(a => a.tipo === 'firma')).toBe(true);

    // Previsualizar no toca nada
    expect(fila(id).fraccion).toBeUndefined();
    expect(fila(id).firma).toBe(FIRMA);

    const r = db.aplicarClase(prev);
    expect(r.ok).toBe(true);
    const dia = vivas(ana, '2026-10-01');
    expect(dia).toHaveLength(2);
    expect(dia.map(p => [p.km_inicial, p.km_final])).toEqual([[1000, 1040], [1040, 1060]]);
    expect(dia[1].fraccion).toBe(0.5);
    expect(dia[0].firma).toBeNull();
    expect(dia[0].firma_borrar).toBe(true);
    // las horas se encadenan con la duración de la clase (45 min)
    expect(dia.map(p => p.hora_inicio)).toEqual(['10:00', '10:45']);
  });

  test('bajar de 2 a 1 borra la última práctica y también pide volver a firmar', () => {
    const { vid, ana } = escenario();
    const a = clase(ana, vid, '2026-10-01', '10:00', 1000, 1040, { firma: FIRMA });
    const b = clase(ana, vid, '2026-10-01', '10:45', 1040, 1080, { firma: FIRMA });
    const prev = db.proponerClase({ practica_id: a, cantidad: 1 });
    expect(prev.borrar.map(x => x.practica_id)).toEqual([b]);
    expect(prev.firma.borrar).toBe(2);
    db.aplicarClase(prev);
    expect(vivas(ana, '2026-10-01').map(p => p.id)).toEqual([a]);
    expect(kmDe(a)).toEqual([1000, 1080]);       // los km de la sesión se conservan
    expect(fila(a).firma).toBeNull();
  });

  test('si el nº de clases no cambia, la firma se queda (aunque cambie la hora o el profesor)', () => {
    const { vid, ana } = escenario();
    const pid = db.addProfesor('Marta');
    const id = clase(ana, vid, '2026-10-01', '10:00', 1000, 1040, { firma: FIRMA });
    const prev = db.proponerClase({ practica_id: id, cantidad: 1, hora_inicio: '11:00', profesor_id: pid });
    expect(prev.firma.borrar).toBe(0);
    db.aplicarClase(prev);
    expect(fila(id).firma).toBe(FIRMA);
    expect(fila(id).hora_inicio).toBe('11:00');
    expect(fila(id).profesor_id).toBe(pid);
  });

  test('añadir ¼ a una clase entera crea una práctica de ¼ y cuenta 1 ¼ en la ficha', () => {
    const { vid, ana } = escenario();
    const id = clase(ana, vid, '2026-10-01', '10:00', 1000, 1050);
    db.aplicarClase(db.proponerClase({ practica_id: id, cantidad: 1.25 }));
    const dia = vivas(ana, '2026-10-01');
    expect(dia.map(p => p.fraccion || null)).toEqual([null, 0.25]);
    expect(db.getFichaPracticasAlumno(ana).totales.nClases).toBe(1.25);
  });

  test('las cantidades tienen que ir de ¼ en ¼', () => {
    const { vid, ana } = escenario();
    const id = clase(ana, vid, '2026-10-01', '10:00', 1000, 1050);
    expect(db.proponerClase({ practica_id: id, cantidad: 1.3 }).ok).toBe(false);
    expect(db.proponerClase({ practica_id: id, cantidad: 0 }).ok).toBe(false);
    expect(db.proponerClase({ practica_id: id, cantidad: 9 }).ok).toBe(false);
  });

  test('una clase en curso no se puede cambiar', () => {
    const { vid, ana } = escenario();
    const hoy = core.hoyLocalISO();
    const id = clase(ana, vid, hoy, '10:00', 1100, 0);
    const r = db.proponerClase({ practica_id: id, cantidad: 2 });
    expect(r.ok).toBe(false);
    expect(r.errores[0]).toMatch(/en curso/);
  });

  test('los cambios se marcan para la nube y las filas borradas también', () => {
    const { vid, ana } = escenario();
    const a = clase(ana, vid, '2026-10-01', '10:00', 1000, 1040);
    const b = clase(ana, vid, '2026-10-01', '10:45', 1040, 1080);
    db.aplicarClase(db.proponerClase({ practica_id: a, cantidad: 1 }));
    const pend = JSON.parse(require('fs').readFileSync(require('path').join(require('./helpers').userDataDir, 'pending_sync.json'), 'utf-8'));
    expect(pend.practicas).toContain(a);
    expect(pend.deleted.practicas).toContain(b);
  });

  test('la vista previa vieja no se aplica si la clase cambió mientras tanto', () => {
    const { vid, ana } = escenario();
    const id = clase(ana, vid, '2026-10-01', '10:00', 1000, 1060);
    const prev = db.proponerClase({ practica_id: id, cantidad: 1.5 });
    db.updatePractica(id, '2026-10-01', 2000, 2060);
    const r = db.aplicarClase(prev);
    expect(r.ok).toBe(false);
    expect(vivas(ana, '2026-10-01')).toHaveLength(1);
  });
});

describe('Clase olvidada: meterla entre otras con los km recalculados', () => {
  function cadena({ hueco }) {
    const { vid, ana, luis } = escenario();
    const a = clase(luis, vid, '2026-10-01', '09:00', 1000, 1030);
    const c = clase(luis, vid, '2026-10-01', '12:00', 1030 + hueco, 1060 + hueco);
    return { vid, ana, luis, a, c };
  }

  test('cabe en el hueco: ocupa los km que hay entre la anterior y la siguiente', () => {
    const { vid, ana, a, c } = cadena({ hueco: 40 });
    const prev = db.proponerClase({ alumno_id: ana, vehiculo_id: vid, fecha: '2026-10-01', hora_inicio: '10:30', cantidad: 1, km: { modo: 'auto' } });
    expect(prev.ok).toBe(true);
    expect(prev.filas).toHaveLength(1);
    expect([prev.filas[0].km_inicial, prev.filas[0].km_final]).toEqual([1030, 1070]);
    expect(prev.contexto).toMatchObject({ metodo: 'hueco', hueco: 40 });
    expect(prev.contexto.anterior.practica_id).toBe(a);
    expect(prev.contexto.siguiente.practica_id).toBe(c);
    expect(prev.otras).toHaveLength(0);
    // la vista previa no creó nada
    expect(vivas(ana, '2026-10-01')).toHaveLength(0);

    const r = db.aplicarClase(prev);
    expect(r.ok).toBe(true);
    const nueva = vivas(ana, '2026-10-01');
    expect(nueva).toHaveLength(1);
    expect([nueva[0].km_inicial, nueva[0].km_final]).toEqual([1030, 1070]);
    expect(nueva[0].tipo_detalle).toBe('km_auto');
    expect(kmDe(c)).toEqual([1070, 1100]);       // la siguiente ni se toca
    expect(db.getSolapamientos()).toHaveLength(0);
  });

  test('1 ½ clases en un hueco repartidas en proporción (dos prácticas, 1 y ½)', () => {
    const { vid, ana } = cadena({ hueco: 45 });
    const prev = db.proponerClase({ alumno_id: ana, vehiculo_id: vid, fecha: '2026-10-01', hora_inicio: '10:30', cantidad: 1.5, km: { modo: 'auto' } });
    expect(prev.filas.map(f => [f.km_inicial, f.km_final, f.fraccion])).toEqual([[1030, 1060, null], [1060, 1075, 0.5]]);
    expect(prev.filas.map(f => f.hora_inicio)).toEqual(['10:30', '11:15']);
  });

  test('si no cabe, se queda sin km y avisa de que se pueden desplazar las siguientes', () => {
    const { vid, ana } = cadena({ hueco: 0 });
    const prev = db.proponerClase({ alumno_id: ana, vehiculo_id: vid, fecha: '2026-10-01', hora_inicio: '10:30', cantidad: 1, km: { modo: 'auto' } });
    expect(prev.ok).toBe(true);
    expect([prev.filas[0].km_inicial, prev.filas[0].km_final]).toEqual([0, 0]);
    expect(prev.avisos.find(a => a.tipo === 'no_cabe').desplazable).toBe(true);
    expect(prev.otras).toHaveLength(0);
  });

  test('desplazando las siguientes: la clase nueva toma el baremo y las clases de después suben lo justo', () => {
    const { vid, ana, a, c } = cadena({ hueco: 0 });
    const d = clase(db.getAlumnos().find(x => x.nombre === 'Luis').id, vid, '2026-10-02', '09:00', 1060, 1090);
    const prev = db.proponerClase({ alumno_id: ana, vehiculo_id: vid, fecha: '2026-10-01', hora_inicio: '10:30', cantidad: 1, km: { modo: 'auto', desplazar: true, kmMin: 40, kmMax: 40 } });
    expect([prev.filas[0].km_inicial, prev.filas[0].km_final]).toEqual([1030, 1070]);
    expect(prev.otras.map(o => [o.practica_id, o.despues.km_inicial, o.despues.km_final])).toEqual([[c, 1070, 1100], [d, 1100, 1130]]);
    expect(prev.contexto.desplazamiento).toBe(40);

    const r = db.aplicarClase(prev);
    expect(r.ok).toBe(true);
    expect(kmDe(a)).toEqual([1000, 1030]);
    expect(kmDe(c)).toEqual([1070, 1100]);
    expect(kmDe(d)).toEqual([1100, 1130]);
    expect(core.load().vehiculos[0].km_actual).toBe(1130);
    expect(db.getSolapamientos()).toHaveLength(0);

    // …y se puede deshacer: vuelven los km y desaparece la clase creada
    const des = db.deshacerCuadreKm();
    expect(des.errores).toEqual([]);
    expect(kmDe(c)).toEqual([1030, 1060]);
    expect(kmDe(d)).toEqual([1060, 1090]);
    expect(vivas(ana, '2026-10-01')).toHaveLength(0);
  });

  test('no desplaza si hay una clase en curso más adelante', () => {
    const { vid, ana, luis } = cadena({ hueco: 0 });
    const hoy = core.hoyLocalISO();
    clase(luis, vid, hoy, '16:00', 1060, 0);
    const prev = db.proponerClase({ alumno_id: ana, vehiculo_id: vid, fecha: '2026-10-01', hora_inicio: '10:30', cantidad: 1, km: { modo: 'auto', desplazar: true } });
    expect([prev.filas[0].km_inicial, prev.filas[0].km_final]).toEqual([0, 0]);
    expect(prev.avisos.some(a => a.tipo === 'abierta_despues')).toBe(true);
    expect(prev.otras).toHaveLength(0);
  });

  test('a continuación de la última clase del coche', () => {
    const { vid, ana, c } = cadena({ hueco: 0 });
    const prev = db.proponerClase({ alumno_id: ana, vehiculo_id: vid, fecha: '2026-10-05', hora_inicio: '10:00', cantidad: 1, km: { modo: 'auto', kmMin: 40, kmMax: 50 } });
    expect(prev.contexto.metodo).toBe('despues');
    expect(prev.contexto.anterior.practica_id).toBe(c);
    expect([prev.filas[0].km_inicial, prev.filas[0].km_final]).toEqual([1060, 1105]);
    db.aplicarClase(prev);
    expect(core.load().vehiculos[0].km_actual).toBe(1105);
  });

  test('antes de todas las del coche: hacia atrás desde la primera', () => {
    const { vid, ana, a } = cadena({ hueco: 0 });
    const prev = db.proponerClase({ alumno_id: ana, vehiculo_id: vid, fecha: '2026-09-20', hora_inicio: '10:00', cantidad: 1, km: { modo: 'auto', kmMin: 40, kmMax: 40 } });
    expect(prev.contexto.metodo).toBe('antes');
    expect(prev.contexto.siguiente.practica_id).toBe(a);
    expect([prev.filas[0].km_inicial, prev.filas[0].km_final]).toEqual([960, 1000]);
  });

  test('un coche sin ninguna clase con km parte de su cuentakilómetros', () => {
    const { vid, ana } = escenario();
    const prev = db.proponerClase({ alumno_id: ana, vehiculo_id: vid, fecha: '2026-10-01', hora_inicio: '10:00', cantidad: 1, km: { modo: 'auto', kmMin: 40, kmMax: 40 } });
    expect(prev.contexto.metodo).toBe('odometro');
    expect([prev.filas[0].km_inicial, prev.filas[0].km_final]).toEqual([1000, 1040]);
  });

  test('«Los escribo» valida y avisa si los km pisan a otra clase', () => {
    const { vid, ana } = cadena({ hueco: 40 });
    expect(db.proponerClase({ alumno_id: ana, vehiculo_id: vid, fecha: '2026-10-01', cantidad: 1, km: { modo: 'escribo', km_inicial: 1100, km_final: 1090 } }).ok).toBe(false);
    const prev = db.proponerClase({ alumno_id: ana, vehiculo_id: vid, fecha: '2026-10-01', hora_inicio: '10:30', cantidad: 1, km: { modo: 'escribo', km_inicial: 1020, km_final: 1060 } });
    expect(prev.ok).toBe(true);
    expect(prev.avisos.some(a => a.tipo === 'solape')).toBe(true);
  });

  test('mover una clase de día con km automáticos la recoloca en su nuevo sitio', () => {
    const { vid, ana, a, c } = cadena({ hueco: 40 });
    const x = clase(ana, vid, '2026-10-03', '10:00', 1100, 1130);     // al final
    const prev = db.proponerClase({ practica_id: x, fecha: '2026-10-01', hora_inicio: '10:30', cantidad: 1, km: { modo: 'auto' } });
    expect([prev.filas[0].km_inicial, prev.filas[0].km_final]).toEqual([1030, 1070]);
    db.aplicarClase(prev);
    expect(kmDe(x)).toEqual([1030, 1070]);
    expect(fila(x).fecha).toBe('2026-10-01');
    expect([kmDe(a), kmDe(c)]).toEqual([[1000, 1030], [1070, 1100]]);
  });
});

describe('simular', () => {
  test('lo que se hace dentro no llega a los datos reales ni a la cola de sincronización', () => {
    const { vid, ana } = escenario();
    const antes = JSON.stringify(core.load().practicas);
    core.simular(d => { d.practicas.push({ id: 99, alumno_id: ana, vehiculo_id: vid, fecha: '2026-01-01', km_inicial: 1, km_final: 2 }); core.save(); });
    expect(JSON.stringify(core.load().practicas)).toBe(antes);
  });
});

describe('Registro rápido: sumar clases de un día', () => {
  test('+1 crea la clase, +½ añade la media, −1 ½ la deja a 0', () => {
    const { vid, ana } = escenario();
    let r = db.sumarClasesDia({ vehiculo_id: vid, fecha: '2026-10-01', alumno_id: ana, delta: 1 });
    expect(r).toMatchObject({ ok: true, clases: 1 });
    r = db.sumarClasesDia({ vehiculo_id: vid, fecha: '2026-10-01', alumno_id: ana, delta: 0.5 });
    expect(r.clases).toBe(1.5);
    expect(vivas(ana, '2026-10-01').map(p => p.fraccion || null)).toEqual([null, 0.5]);
    r = db.sumarClasesDia({ vehiculo_id: vid, fecha: '2026-10-01', alumno_id: ana, delta: 0.25 });
    expect(vivas(ana, '2026-10-01').map(p => p.fraccion || null)).toEqual([null, 0.75]);
    r = db.sumarClasesDia({ vehiculo_id: vid, fecha: '2026-10-01', alumno_id: ana, delta: -1.75 });
    expect(r.clases).toBe(0);
    expect(vivas(ana, '2026-10-01')).toHaveLength(0);
  });

  test('con km automáticos solo ocupa el hueco que le toca y nunca desplaza otras clases', () => {
    const { vid, ana, luis } = escenario();
    clase(luis, vid, '2026-10-01', '09:00', 1000, 1030);
    const siguiente = clase(luis, vid, '2026-10-01', '12:00', 1030, 1060);
    const r = db.sumarClasesDia({ vehiculo_id: vid, fecha: '2026-10-01', alumno_id: ana, delta: 1, hora_inicio: '10:30', km: 'auto' });
    expect(r.ok).toBe(true);
    expect(vivas(ana, '2026-10-01')[0].km_final).toBe(0);     // no cabe: sin km
    expect(kmDe(siguiente)).toEqual([1030, 1060]);
  });

  test('getAlumnosPorVehiculo cuenta las clases con sus fracciones y la hora', () => {
    const { vid, ana } = escenario();
    db.sumarClasesDia({ vehiculo_id: vid, fecha: '2026-10-01', alumno_id: ana, delta: 1.5, hora_inicio: '17:00' });
    const a = db.getAlumnosPorVehiculo(vid, '2026-10-01').find(x => x.id === ana);
    expect(a.num_practicas).toBe(2);
    expect(a.clases).toBe(1.5);
    expect(a.hora_inicio).toBe('17:00');
  });
});
