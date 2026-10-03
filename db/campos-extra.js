// ─── CAMPOS AMPLIADOS (los mismos datos que guarda Ariauto) ─────────────────
// Un solo sitio con los campos que se añadieron el 2026-10-03 a alumnos,
// profesores y vehículos (migración 2026-10-03_datos_ficha_vehiculos_activos):
// su tipo y cómo se limpian. Lo usan db/ (alta, edición, importación) y
// sync.js (subida y bajada, gateada por _columnasDisponibles: sin la
// migración aplicada no se mandan ni se piden).

const CAMPOS_EXTRA = {
  alumnos: {
    n_registro: 'texto', sexo: 'sexo', nacionalidad: 'texto', lugar_nacimiento: 'texto',
    provincia: 'texto', municipio: 'texto', telefono2: 'texto', dni_caducidad: 'fecha',
    tutor_nombre: 'texto', tutor_dni: 'texto', fecha_teorico: 'fecha', centro_medico: 'texto',
    restricciones: 'texto', n_solicitud: 'entero', convocatoria: 'entero',
    factura_nombre: 'texto', factura_nif: 'texto', factura_direccion: 'texto'
  },
  profesores: {
    telefono: 'texto', email: 'texto', direccion: 'texto', codigo_postal: 'texto', poblacion: 'texto',
    fecha_nacimiento: 'fecha', fecha_alta: 'fecha', fecha_baja: 'fecha', n_certificado: 'texto', fecha_certificado: 'fecha',
    // Coche habitual del profesor (migración 2026-10-03_profesor_vehiculo): el
    // que la web propone al iniciar o anotar sus clases. Se cambia aquí, en
    // Profesores, o en el móvil (Perfil → Coche de cada profesor).
    vehiculo_id: 'entero'
  },
  vehiculos: {
    activo: 'activo', marca: 'texto', modelo: 'texto', fecha_alta: 'fecha', fecha_baja: 'fecha',
    aseguradora: 'texto', poliza: 'texto', itv_ultima: 'fecha', cambio: 'cambio', observaciones: 'texto'
  }
};

const FECHA_RE = /^\d{4}-\d{2}-\d{2}$/;

// Valor limpio de un campo ampliado: texto recortado (vacío → null), fecha
// YYYY-MM-DD o null, entero > 0 o null, sexo H/M, cambio manual/automatico y
// activo siempre booleano (lo que no sea false explícito cuenta como en uso).
function normalizarCampoExtra(tipo, valor) {
  if (tipo === 'activo') return !(valor === false || valor === 'false' || valor === 0 || valor === '0');
  if (valor == null) return null;
  const t = String(valor).trim();
  if (!t) return null;
  switch (tipo) {
    case 'fecha': return FECHA_RE.test(t.slice(0, 10)) ? t.slice(0, 10) : null;
    case 'entero': { const n = parseInt(t, 10); return Number.isFinite(n) && n > 0 ? n : null; }
    case 'sexo': {
      // DGT: V (varón) / M (mujer); Ariauto: 1 / 2
      const s = t.toUpperCase();
      if (/^(H|V|1|HOMBRE|VAR[OÓ]N|MASC|MASCULINO)$/.test(s)) return 'H';
      if (/^(M|F|2|MUJER|FEM|FEMENINO)$/.test(s)) return 'M';
      return null;
    }
    case 'cambio': {
      const s = t.toLowerCase();
      if (/^auto/.test(s)) return 'automatico';
      if (/^man/.test(s)) return 'manual';
      return null;
    }
    default: return t.slice(0, 500);
  }
}

// Solo las claves de CAMPOS_EXTRA[tabla] PRESENTES en `datos` (para no pisar
// con null lo que no se envió en una edición parcial).
function extraerCamposExtra(tabla, datos) {
  const out = {};
  if (!datos || typeof datos !== 'object') return out;
  for (const [campo, tipo] of Object.entries(CAMPOS_EXTRA[tabla] || {})) {
    if (campo in datos) out[campo] = normalizarCampoExtra(tipo, datos[campo]);
  }
  return out;
}

// Todas las claves con su valor por defecto (alta de un registro nuevo).
function camposExtraVacios(tabla) {
  const out = {};
  for (const [campo, tipo] of Object.entries(CAMPOS_EXTRA[tabla] || {})) out[campo] = tipo === 'activo' ? true : null;
  return out;
}

// Coche retirado = activo === false (los antiguos, sin la marca, están en uso).
const vehiculoEnUso = v => !!v && v.activo !== false;

// ─── Nº DE REGISTRO DEL ALUMNO ───────────────────────────────────────────────
// El número que identifica a cada alumno (el «Nº ALUMNO» de Ariauto). El
// siguiente sigue la numeración correlativa que ya haya: el mayor + 1. Ariauto
// mezcla dos: la correlativa (4904, 4905…) y otra con el año delante (2026081,
// 2026082…; 200801 en secciones antiguas); manda la correlativa y la del año
// solo se sigue si es la única.
// Sin ningún número todavía devuelve null (no se inventa una numeración que
// luego chocaría con la del programa anterior al importarlo).
// La web tiene la misma regla en web-remote/api/_utils.js (siguienteNRegistro).
// Con el año delante: 2026082, 200801 (año + 2 a 4 cifras)
const RE_REGISTRO_ANIO = /^(199\d|20\d{2})\d{2,4}$/;
function siguienteNRegistro(alumnos, anioActual = new Date().getFullYear()) {
  let maxCorrelativo = 0, maxAnio = 0;
  for (const a of alumnos || []) {
    if (!a || a.deleted) continue;
    const t = String(a.n_registro == null ? '' : a.n_registro).trim();
    if (!/^\d{1,9}$/.test(t)) continue;
    const n = parseInt(t, 10);
    if (RE_REGISTRO_ANIO.test(t)) { if (n > maxAnio) maxAnio = n; } else if (n > maxCorrelativo) maxCorrelativo = n;
  }
  if (maxCorrelativo) return String(maxCorrelativo + 1);
  if (!maxAnio) return null;
  // «2026082» → el siguiente del año en curso; si cambió el año, empieza en 001
  const s = String(maxAnio), anio = s.slice(0, 4), cifras = s.length - 4;
  if (Number(anio) === anioActual) return String(maxAnio + 1);
  return String(anioActual) + '1'.padStart(cifras, '0');
}

// Otro alumno (vivo) con ese mismo nº de registro, o null
function alumnoConNRegistro(alumnos, n, exceptoId = null) {
  const t = String(n == null ? '' : n).trim();
  if (!t) return null;
  return (alumnos || []).find(a => a && !a.deleted && a.id !== exceptoId && String(a.n_registro == null ? '' : a.n_registro).trim() === t) || null;
}

module.exports = { CAMPOS_EXTRA, normalizarCampoExtra, extraerCamposExtra, camposExtraVacios, vehiculoEnUso, siguienteNRegistro, alumnoConNRegistro };
