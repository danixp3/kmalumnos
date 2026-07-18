// Tests de backups automáticos: carpeta propia, último backup y retención.
const fs = require('fs');
const path = require('path');
const db = require('../db');
const { resetData, userDataDir } = require('./helpers');

const backupsDir = path.join(userDataDir, 'backups');

beforeEach(() => {
  resetData(db);
  if (fs.existsSync(backupsDir)) fs.rmSync(backupsDir, { recursive: true, force: true });
});

test('obtenerUltimoBackup() devuelve null cuando no hay ningún backup', () => {
  expect(db.obtenerUltimoBackup()).toBeNull();
});

test('crearBackup() sin argumentos guarda en la carpeta backups y obtenerUltimoBackup lo detecta', () => {
  db.addVehiculo('Coche 1', '', 0);

  const result = db.crearBackup();

  expect(result.ok).toBe(true);
  expect(fs.existsSync(path.join(backupsDir, result.nombre))).toBe(true);

  const ultimo = db.obtenerUltimoBackup();
  expect(ultimo).not.toBeNull();
  expect(ultimo.nombre).toBe(result.nombre);
});

test('crearBackup() mantiene como máximo 20 backups en la carpeta', () => {
  db.addVehiculo('Coche 1', '', 0);
  fs.mkdirSync(backupsDir, { recursive: true });
  for (let i = 0; i < 24; i++) {
    const nombre = `backup-2026-01-01_00-00-${String(i).padStart(2, '0')}.json`;
    fs.writeFileSync(path.join(backupsDir, nombre), '{}', 'utf-8');
  }

  const result = db.crearBackup();

  const restantes = fs.readdirSync(backupsDir).filter(f => f.endsWith('.json'));
  expect(restantes).toHaveLength(20);
  expect(restantes).toContain(result.nombre);
});
