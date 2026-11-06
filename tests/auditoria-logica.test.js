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
