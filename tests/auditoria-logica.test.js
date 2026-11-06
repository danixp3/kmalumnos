// Fallos de lógica encontrados en la auditoría de noviembre de 2026 (cada prueba reproduce el fallo).
const fs = require('fs');
const path = require('path');
const db = require('../db');
const { resetData, userDataDir } = require('./helpers');

beforeEach(() => { resetData(db); });
const pendiente = () => JSON.parse(fs.readFileSync(path.join(userDataDir, 'pending_sync.json'), 'utf-8'));

describe('dinero: siempre a céntimos', () => {
  test('3 clases a 15,05 € pagadas con 45,15 € dejan el saldo en 0 (no en 0,000000000000007, que salía como moroso)', () => {
    const vid = db.addVehiculo('Ibiza', '', 0);
    const aid = db.addAlumno('Ana', 'B', vid);
    db.setTarifa('B', 'circulacion', 15.05);
    for (let i = 0; i < 3; i++) db.addPractica(aid, vid, `2026-10-0${i + 1}`, 100 + i * 10, 110 + i * 10);
    db.addPago(aid, '2026-10-05', 45.15, 'pago');
    const d = db.getDeudas().find(x => x.alumno_id === aid);
    expect(d.total_generado).toBe(45.15);
    expect(d.saldo).toBe(0);
    expect(db.getMorosos().map(x => x.alumno_id)).not.toContain(aid);
    expect(db.getStatsDashboard().alumnosConDeuda).toBe(0);
    expect(db.getDesglosePagosAlumno(aid).saldo).toBe(0);
  });

  test('el arqueo de caja redondea los totales a céntimos', () => {
    const aid = db.addAlumno('Ana', 'B', null);
    db.addPago(aid, '2026-10-05', 0.1, 'a', null, 'efectivo');
    db.addPago(aid, '2026-10-05', 0.2, 'b', null, 'efectivo');
    const a = db.getArqueo('2026-10-01', '2026-10-31');
    expect(a.total).toBe(0.3);
    expect(a.porForma.efectivo).toBe(0.3);
  });

  test('un descuento o una promoción siempre RESTAN, aunque se escriba la cantidad en positivo', () => {
    const aid = db.addAlumno('Ana', 'B', null);
    expect(db.addCargo({ alumno_id: aid, concepto: 'Promo', tipo: 'descuento', importe: 20, fecha: '2026-10-01' }).importe).toBe(-20);
    expect(db.addCargo({ alumno_id: aid, concepto: 'Promo', tipo: 'promo', importe: -15, fecha: '2026-10-01' }).importe).toBe(-15);
    expect(db.addCargo({ alumno_id: aid, concepto: 'Matrícula', tipo: 'matricula', importe: 100, fecha: '2026-10-01' }).importe).toBe(100);
    expect(db.getTotalCargosAlumno(aid)).toBe(65);
    // cambiar un cargo a descuento también lo hace restar
    const c = db.addCargo({ alumno_id: aid, concepto: 'X', tipo: 'cargo', importe: 10, fecha: '2026-10-02' });
    db.updateCargo(c.id, { tipo: 'descuento' });
    expect(db.getCargosAlumno(aid).find(x => x.id === c.id).importe).toBe(-10);
  });
});

describe('bonos', () => {
  test('ampliar las clases de un bono agotado lo reactiva; bajarlas por debajo de lo usado no deja saldo negativo', () => {
    const aid = db.addAlumno('Ana', 'B', null);
    const b = db.addBono({ alumno_id: aid, nombre: '10 clases', n_clases: 2, fecha_compra: '2026-10-01' });
    db.consumirBono(b.id, 2);
    expect(db.getBonosAlumno(aid)[0].estado).toBe('agotado');
    db.updateBono(b.id, { n_clases: 5 });
    expect(db.getBonosAlumno(aid)[0]).toMatchObject({ estado: 'activo', saldo: 3 });
    db.updateBono(b.id, { n_clases: 1 });
    expect(db.getBonosAlumno(aid)[0]).toMatchObject({ estado: 'agotado', n_usadas: 1, saldo: 0 });
  });
});

describe('reservas', () => {
  test('una reserva cancelada no se puede completar, y sin alumno o sin día tampoco; la hora se conserva en la clase', () => {
    const vid = db.addVehiculo('Ibiza', '', 0);
    const aid = db.addAlumno('Ana', 'B', vid);
    const cancelada = db.addReserva({ alumno_id: aid, vehiculo_id: vid, fecha: '2026-10-10', hora_inicio: '10:00', estado: 'cancelada' });
    expect(db.completarReserva(cancelada).ok).toBe(false);
    expect(db.addReserva({ vehiculo_id: vid, fecha: '2026-10-10' })).toBeDefined();
    const sinAlumno = db.addReserva({ vehiculo_id: vid, fecha: '2026-10-10' });
    expect(db.completarReserva(sinAlumno).ok).toBe(false);
    const sinDia = db.addReserva({ alumno_id: aid, vehiculo_id: vid });
    expect(db.completarReserva(sinDia).ok).toBe(false);
    expect(db.getTodasPracticas({})).toHaveLength(0);
    const buena = db.addReserva({ alumno_id: aid, vehiculo_id: vid, fecha: '2026-10-10', hora_inicio: '11:30' });
    expect(db.completarReserva(buena)).toMatchObject({ ok: true, creadas: 1 });
    expect(db.getTodasPracticas({})[0].hora_inicio).toBe('11:30');
  });
});

describe('caducidades y borrados', () => {
  test('las caducidades de un alumno borrado dejan de avisar', () => {
    const aid = db.addAlumno('Ana', 'B', null);
    db.addVencimiento({ entidad_tipo: 'alumno', entidad_id: aid, tipo: 'DNI', fecha_vencimiento: '2020-01-01' });
    expect(db.getProximosVencimientos(30, '2026-10-01')).toHaveLength(1);
    db.deleteAlumno(aid);
    expect(db.getProximosVencimientos(30, '2026-10-01')).toHaveLength(0);
  });

  test('borrar un alumno se lleva también sus reservas, exámenes, tasas y bonos, y los marca para la nube; sus cobros se conservan', () => {
    const vid = db.addVehiculo('Ibiza', '', 0);
    const aid = db.addAlumno('Ana', 'B', vid);
    const otro = db.addAlumno('Bea', 'B', vid);
    db.addReserva({ alumno_id: aid, vehiculo_id: vid, fecha: '2026-10-10' });
    const ex = db.addPresentacion({ alumno_id: aid, tipo: 'teorico', fecha: '2026-10-10' });
    db.addPresentacion({ alumno_id: otro, tipo: 'teorico', fecha: '2026-10-10' });
    db.addTasa({ alumno_id: aid, concepto: 'Tasa' });
    db.addBono({ alumno_id: aid, nombre: 'B', n_clases: 5, fecha_compra: '2026-10-01' });
    db.addPago(aid, '2026-10-01', 40, 'cobro');
    db.deleteAlumno(aid);
    expect(db.getReservas()).toHaveLength(0);
    expect(db.getPresentaciones().map(x => x.alumno_id)).toEqual([otro]);
    expect(db.getTasasAlumno(aid)).toHaveLength(0);
    expect(db.getBonosAlumno(aid)).toHaveLength(0);
    expect(db.getPagosByAlumno(aid)).toHaveLength(1);
    expect(pendiente().deleted.presentaciones).toContain(ex.id);
    expect(pendiente().deleted.reservas.length).toBe(1);
  });
});

describe('cuentakilómetros del coche', () => {
  test('editar una clase con un km final mayor sube el del coche y se sincroniza (antes quedaba atrás)', () => {
    const vid = db.addVehiculo('Ibiza', '', 1000);
    const aid = db.addAlumno('Ana', 'B', vid);
    const pid = db.addPractica(aid, vid, '2026-10-01', 1000, 1030);
    expect(db.getVehiculos()[0].km_actual).toBe(1030);
    db.updatePractica(pid, '2026-10-01', 1000, 1100);
    expect(db.getVehiculos()[0].km_actual).toBe(1100);
    expect(pendiente().vehiculos).toContain(vid);
    // y bajar una clase no baja el cuentakilómetros real
    db.updatePractica(pid, '2026-10-01', 1000, 1010);
    expect(db.getVehiculos()[0].km_actual).toBe(1100);
  });
});

describe('borrar un coche deja a sus alumnos y profesores sin él y lo sube a la nube', () => {
  test('al borrar un coche, los alumnos y profesores que lo tenían se quedan sin coche y se marcan para subir', () => {
    const v1 = db.addVehiculo('Ibiza', '1111AAA', 0);
    const v2 = db.addVehiculo('Corsa', '2222BBB', 0);
    const aid = db.addAlumno('Ana', 'B', v1);
    const bid = db.addAlumno('Bea', 'B', v2);
    const pid = db.addProfesor('Julio');
    db.setCocheProfesor(pid, v1);
    fs.rmSync(path.join(userDataDir, 'pending_sync.json'), { force: true });   // lo de antes ya estaría subido
    db.deleteVehiculo(v1);
    expect(db.getAlumnos().find(a => a.id === aid).vehiculo_id).toBeNull();
    expect(db.getAlumnos().find(a => a.id === bid).vehiculo_id).toBe(v2);
    expect(db.getProfesores().find(p => p.id === pid).vehiculo_id == null).toBe(true);
    const p = pendiente();
    expect(p.alumnos).toContain(aid);
    expect(p.alumnos).not.toContain(bid);
    expect(p.profesores).toContain(pid);
  });
});

describe('clases abiertas y fracciones en los km', () => {
  test('una clase en curso o sin cerrar (km final 0) no resta su km inicial a los totales del profesor ni del coche', () => {
    const vid = db.addVehiculo('Ibiza', '', 17000);
    const pid = db.addProfesor('Julio');
    const aid = db.addAlumno('Ana', 'B', vid, pid);
    db.addPractica(aid, vid, '2026-10-01', 17000, 17030, pid);
    db.addPractica(aid, vid, '2026-10-02', 17030, 0, pid);   // sin cerrar de un día anterior
    expect(db.getStatsProfesores().find(p => p.id === pid).km_totales).toBe(30);
    const g = db.getDatosGraficos(60);
    expect(g.porProfesor.find(p => p.nombre === 'Julio').km).toBe(30);
    expect(g.porVehiculo.find(v => v.nombre === 'Ibiza').km).toBe(30);
  });

  test('«Corregir solapamientos» no convierte una clase abierta en una clase cerrada de 1 km', () => {
    const vid = db.addVehiculo('Ibiza', '', 1000);
    const aid = db.addAlumno('Ana', 'B', vid);
    db.addPractica(aid, vid, '2026-10-01', 1000, 1050);
    const abierta = db.addPractica(aid, vid, '2026-10-02', 1020, 0);   // en curso, con un km inicial «raro»
    db.corregirSolapamientos(vid);
    const p = db.getTodasPracticas({ hoy: '2026-10-02' }).find(x => x.id === abierta);
    expect(p.km_final).toBe(0);
    expect(p.km_inicial).toBe(1020);
  });

  test('rellenar km: una media clase recorre menos que una entera (proporcional), no los mismos 40-45 km', () => {
    const vid = db.addVehiculo('Ibiza', '', 1000);
    const aid = db.addAlumno('Ana', 'B', vid);
    const entera = db.addPractica(aid, vid, '2026-10-01', 0, 0);
    const media = db.addPractica(aid, vid, '2026-10-02', 0, 0);
    db.updatePractica(media, '2026-10-02', 0, 0, null, 'circulacion', null, 0.5);
    db.rellenarKmMasivo(vid, 40, 40);
    const lista = db.getTodasPracticas({});
    const kmE = lista.find(p => p.id === entera).km_recorridos, kmM = lista.find(p => p.id === media).km_recorridos;
    expect(kmE).toBe(40);
    expect(kmM).toBe(20);
  });

  test('km por rango: el reparto es proporcional a lo que vale cada clase y suma exactamente el rango', () => {
    const vid = db.addVehiculo('Ibiza', '', 0);
    const aid = db.addAlumno('Ana', 'B', vid);
    const a = db.addPractica(aid, vid, '2026-10-01', 0, 0);
    const b = db.addPractica(aid, vid, '2026-10-02', 0, 0);
    db.updatePractica(b, '2026-10-02', 0, 0, null, 'circulacion', null, 0.5);
    const r = db.generarKmPorRango(vid, 1000, 1060, 0, false);
    const km = id => { const x = r.asignaciones.find(y => y.practica_id === id); return x.km_final - x.km_inicial; };
    expect(km(a) + km(b)).toBe(60);
    expect(km(a)).toBe(40);   // 2/3 del recorrido para la clase entera, 1/3 para la media
    expect(km(b)).toBe(20);
  });
});

describe('datos dañados y restaurar', () => {
  test('un data.json dañado no se pisa en silencio: queda una copia «.danado»', () => {
    const f = path.join(userDataDir, 'data.json');
    fs.writeFileSync(f, '{ esto no es json', 'utf-8');
    db._clearCache();
    expect(db.getAlumnos()).toEqual([]);
    const copias = fs.readdirSync(userDataDir).filter(n => n.startsWith('data.json.danado-'));
    expect(copias.length).toBeGreaterThan(0);
    expect(fs.readFileSync(path.join(userDataDir, copias[0]), 'utf-8')).toBe('{ esto no es json');
    for (const c of copias) fs.rmSync(path.join(userDataDir, c), { force: true });
  });

  test('restaurar un backup guarda antes una copia de lo que había', () => {
    db.addAlumno('Ana', 'B', null);
    const copia = db.crearBackup();
    db.addAlumno('Bea', 'B', null);
    const antes = fs.readdirSync(path.join(userDataDir, 'backups')).length;
    expect(db.restaurarBackup(copia.file).ok).toBe(true);
    expect(db.getAlumnos().map(a => a.nombre)).toEqual(['Ana']);
    expect(fs.readdirSync(path.join(userDataDir, 'backups')).length).toBeGreaterThan(antes);
  });
});

describe('detector de clases duplicadas', () => {
  test('dos clases del mismo día SIN km (1 ½ clases, o anotadas sin km) no son «duplicadas»; las de km iguales sí', () => {
    const vid = db.addVehiculo('Ibiza', '', 0);
    const aid = db.addAlumno('Ana', 'B', vid);
    db.addPractica(aid, vid, '2026-10-01', 0, 0);
    db.addPractica(aid, vid, '2026-10-01', 0, 0);
    expect(db.getPracticasDuplicadas(aid)).toHaveLength(0);
    db.addPractica(aid, vid, '2026-10-02', 100, 140);
    db.addPractica(aid, vid, '2026-10-02', 100, 140);
    const dup = db.getPracticasDuplicadas(aid);
    expect(dup).toHaveLength(1);
    expect(dup[0]).toMatchObject({ fecha: '2026-10-02', km_inicial: 100, km_final: 140 });
  });
});

describe('clases en curso y clases anteriores con fracciones', () => {
  test('no se puede borrar desde el escritorio una clase que el profesor está dando ahora (en curso hoy)', () => {
    const vid = db.addVehiculo('Ibiza', '', 1000);
    const aid = db.addAlumno('Ana', 'B', vid);
    const hoy = new Date(); const iso = `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, '0')}-${String(hoy.getDate()).padStart(2, '0')}`;
    const abierta = db.addPractica(aid, vid, iso, 1000, 0);
    const r = db.quitarSesionClase(abierta);
    expect(r.ok).toBe(false);
    expect(db.getTodasPracticas({}).map(p => p.id)).toContain(abierta);
    // una «sin cerrar» de otro día sí se puede limpiar
    const vieja = db.addPractica(aid, vid, '2026-01-10', 900, 0);
    expect(db.quitarSesionClase(vieja).ok).toBe(true);
  });

  test('las clases anteriores que se crean reparten km por lo que valen: la media clase recorre menos que una entera', () => {
    const vid = db.addVehiculo('Ibiza', '', 5000);
    const pid = db.addProfesor('Julio');
    const aid = db.addAlumno('Ana', 'B', vid, pid);
    db.setPuntoDePartidaAlumno(aid, 1.5, 0);
    const plan = db.planificarClasesAnteriores({ kmMin: 40, kmMax: 40 });
    expect(plan.errores).toEqual([]);
    expect(plan.altas).toHaveLength(2);
    const ord = plan.altas.slice().sort((a, b) => (a.fraccion ? 1 : 0) - (b.fraccion ? 1 : 0));
    const entera = ord.find(c => !c.fraccion), media = ord.find(c => c.fraccion);
    expect(entera.km_final - entera.km_inicial).toBe(40);
    expect(media.km_final - media.km_inicial).toBe(20);
  });
});

describe('Registro rápido y firmas', () => {
  test('sumar o quitar clases a una sesión ya firmada pide confirmación; con ella se hace y la firma se borra', () => {
    const vid = db.addVehiculo('Ibiza', '', 1000);
    const aid = db.addAlumno('Ana', 'B', vid);
    const pid = db.addPractica(aid, vid, '2026-10-01', 1000, 1030);
    const d = JSON.parse(fs.readFileSync(path.join(userDataDir, 'data.json'), 'utf-8'));
    d.practicas.find(p => p.id === pid).firma = 'data:image/png;base64,AAAA';
    fs.writeFileSync(path.join(userDataDir, 'data.json'), JSON.stringify(d), 'utf-8');
    db._clearCache();
    const base = { vehiculo_id: vid, fecha: '2026-10-01', alumno_id: aid, delta: 0.5 };
    const sin = db.sumarClasesDia(base);
    expect(sin).toMatchObject({ ok: false, confirmar: 'firma', firmas: 1 });
    expect(db.getTodasPracticas({}).filter(p => p.firmada)).toHaveLength(1);       // nada cambió
    const con = db.sumarClasesDia({ ...base, confirmarFirma: true });
    expect(con.ok).toBe(true);
    expect(db.getTodasPracticas({}).filter(p => p.firmada)).toHaveLength(0);       // la firma se borró
    // sin firma, no pregunta
    expect(db.sumarClasesDia({ ...base, delta: 0.25 }).ok).toBe(true);
  });
});
