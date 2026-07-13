# Publicar nueva versión de KMAlumnos

Instrucciones para el agente AI. Cuando el usuario diga "publica una update", "nueva versión" o similar, seguir estos pasos en orden.

---

## Requisitos previos
- Repo: https://github.com/danixp3/kmalumnos
- El usuario debe tener sesión de GitHub activa en el navegador (para el push)

---

## Pasos

### 1. Incrementar versión en package.json
Editar el campo `"version"` en `package.json`. Usar versionado semántico:
- Bug fix menor → incrementar patch: `1.0.0` → `1.0.1`
- Nueva funcionalidad → incrementar minor: `1.0.0` → `1.1.0`
- Cambio grande → incrementar major: `1.0.0` → `2.0.0`

### 2. Hacer commit y push del código
Ejecutar en orden (uno por uno, NO con &&):
```
git add .
git commit -m "v1.X.X - descripción breve del cambio"
git push
```

### 3. Generar el instalador
```
npm run dist
```
Esto genera en `dist/`:
- `KMAlumnos Setup 1.X.X.exe` ← instalador principal
- `KMAlumnos Setup 1.X.X.exe.blockmap` ← necesario para el auto-update
- `latest.yml` ← necesario para el auto-update

### 4. Crear el Release en GitHub
Ejecutar este comando para abrir la página de nuevo release:
```
start https://github.com/danixp3/kmalumnos/releases/new
```

El usuario debe hacer manualmente en el navegador:
1. **Tag**: escribir `v1.X.X` (misma versión que en package.json)
2. **Title**: `KMAlumnos v1.X.X`
3. **Subir archivos** desde la carpeta `dist/`:
   - `KMAlumnos Setup 1.X.X.exe`
   - `KMAlumnos Setup 1.X.X.exe.blockmap`
   - `latest.yml`
4. Clic en **Publish release**

---

## Resultado
Las apps instaladas en otros ordenadores detectarán el nuevo release al arrancar y mostrarán un diálogo para instalar la actualización.

---

## Notas
- `node_modules/` y `dist/` están en `.gitignore`, nunca se suben al repo.
- El archivo `latest.yml` es el que usa `electron-updater` para saber qué versión hay disponible. Sin él el auto-update no funciona.
- Si el usuario no quiere subir los archivos manualmente, se puede configurar `GH_TOKEN` para que `npm run dist` publique automáticamente, pero requiere un token de GitHub con permisos `repo`.
