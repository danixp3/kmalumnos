// Utilidades de ficheros para D7 (foto + documentos del alumno, almacenamiento local).
// CommonJS, sin dependencias externas.

// Deja solo letras (incluidos acentos/ñ españoles), números, punto, guion y guion bajo.
// Todo lo demás (barras, "..", espacios, etc.) se sustituye por "_" para neutralizar
// cualquier intento de path traversal o de escapar de la carpeta de destino.
function sanitizarNombre(nombre) {
  let n = String(nombre == null ? '' : nombre);
  n = n.replace(/[^a-zA-Z0-9áéíóúÁÉÍÓÚñÑüÜ._-]/g, '_');
  // Colapsa secuencias de puntos (evita ".." aunque queden sueltos tras el reemplazo anterior)
  n = n.replace(/\.{2,}/g, '_');
  n = n.slice(0, 120);
  return n;
}

// Extrae la extensión de imagen soportada a partir de un dataURL (data:<mime>;base64,...).
// Devuelve 'jpg' | 'png' | 'webp' o null si el MIME no es una de esas imágenes.
function extensionDeDataUrl(dataUrl) {
  if (typeof dataUrl !== 'string') return null;
  const m = dataUrl.match(/^data:([^;,]+);base64,/);
  if (!m) return null;
  const mime = m[1].toLowerCase();
  if (mime === 'image/jpeg') return 'jpg';
  if (mime === 'image/png') return 'png';
  if (mime === 'image/webp') return 'webp';
  return null;
}

module.exports = { sanitizarNombre, extensionDeDataUrl };
