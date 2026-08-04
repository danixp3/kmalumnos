# Migración: roles (jefe/empleado) y sucursales

Fecha: 2026-08-01. Archivos de esta carpeta:

- `2026-08-01_roles_y_sucursales.sql` — la migración.
- `2026-08-01_roles_y_sucursales_ROLLBACK.sql` — la red de seguridad, por si algo sale mal.

**Ninguno de los dos se ha aplicado a Supabase.** Son solo archivos en el repositorio, a la espera de que decidas aplicarlos.

## Qué hace, en llano

Hoy, en KMAlumnos, "una cuenta" y "una empresa" son la misma cosa: cuando inicias sesión, el sistema busca los datos cuyo dueño eres literalmente tú (tu usuario). Eso significa que no se puede dar de alta a un empleado con su propio usuario para que trabaje en la misma empresa sin verte todos tus datos, incluidos los pagos.

Esta migración añade dos cosas nuevas sin tocar ni un dato de los que ya existen:

1. **Roles**: se puede crear una cuenta de "empleado" que comparte la empresa contigo (el "jefe") pero que, si tú lo decides, **no puede ver la pantalla de Pagos** (eso queda protegido de verdad por el servidor, no solo escondido en la pantalla — ver más abajo la limitación sobre otros datos).
2. **Sucursales**: se puede dar de alta más de una sede y, opcionalmente, etiquetar vehículos, alumnos, prácticas, profesores, tarifas y pagos con la sucursal a la que pertenecen. Si no etiquetas nada, todo se sigue tratando como "sede única", exactamente igual que hoy.

Nada de esto se activa solo. Después de aplicar la migración, la app sigue funcionando exactamente igual que ahora hasta que tú (o un desarrollador) creéis manualmente una fila de sucursal o un segundo usuario con perfil de empleado. **Esta migración es solo la base de datos.** La parte de la app de escritorio para los roles (ver tu rol, invitar empleados, y ocultar Pagos y las estadísticas a quien sea empleado) ya está programada y funciona en "modo clásico" mientras la migración no esté aplicada: es decir, hoy no verás ninguna pantalla nueva y todo sigue igual. La parte de elegir sucursal en las pantallas todavía no está hecha.

## Pasos exactos para aplicarla

1. **Copia de seguridad ANTES de nada.** Desde la app: Ajustes → Copia de seguridad (genera un backup de `data.json` local). Además, desde Supabase, exporta o pide un `pg_dump` del proyecto `dmwoqugdnwgkcqtixhyw`, o al menos un `SELECT * FROM …` de las 7 tablas de datos guardado a un archivo. Si algo sale mal, sin copia no hay vuelta atrás fácil.
2. **Todos los PCs deben estar en la versión de la app que ya soporta este cambio** antes de aplicar la migración en Supabase (ver "Riesgos y limitaciones" — punto sobre versiones).
3. Aplicar `2026-08-01_roles_y_sucursales.sql` contra la base de datos de producción (vía el SQL Editor de Supabase, o `node .claude/scripts/sql.js` si ya se ha revisado y aprobado). El script está envuelto en una transacción: si algo falla a mitad, no deja el esquema a medias.
4. Verificar (paso siguiente).

## Qué verificar después

Con el usuario actual (el dueño), en el SQL Editor de Supabase o desde la app:

- `SELECT * FROM perfiles;` → debe aparecer exactamente una fila, con `user_id` = tu usuario, `empresa_id` = tu usuario también, y `rol = 'jefe'`.
- La app de escritorio sigue arrancando, sincronizando y mostrando los mismos alumnos, vehículos, prácticas y pagos que antes de la migración. Si algo desaparece o da error de sincronización, es la señal de que algo fue mal.
- `SELECT sucursal_id FROM alumnos LIMIT 5;` → todas las filas existentes deben salir con `sucursal_id = NULL`.
- (Opcional, para probar el aislamiento de roles) Crear un segundo usuario de prueba en Supabase Auth, insertar a mano una fila en `perfiles` con `rol = 'empleado'` y el mismo `empresa_id` que el jefe, iniciar sesión con ese usuario y comprobar que `SELECT * FROM pagos;` devuelve 0 filas, mientras que `SELECT * FROM alumnos;` sí devuelve datos.

## Cómo revertir

Ejecutar `2026-08-01_roles_y_sucursales_ROLLBACK.sql`. Deja las políticas de las tablas operativas exactamente como estaban antes (comparando solo contra `auth.uid()`, sin roles) y borra las tablas `perfiles` y `sucursales` — **si para entonces ya hay sucursales o perfiles de empleado reales, esos datos se pierden**, léase la advertencia dentro del propio archivo antes de ejecutarlo. Las columnas `sucursal_id` de las tablas operativas se quedan (son inofensivas, `NULL` y sin usar); el rollback incluye, comentado, un bloque opcional para quitarlas también si se quiere una reversión total.

## Riesgos y limitaciones

- **Todos los PCs deben estar en la versión nueva de la app antes de aplicar esto en producción.** La migración en sí es compatible hacia atrás a nivel de base de datos (por el `COALESCE`), pero si un PC con una versión antigua de la app inserta o edita filas asumiendo que solo existe un usuario por empresa, y mientras tanto ya hay un segundo usuario con perfil de empleado activo, ese PC antiguo seguiría escribiendo con su propio `auth.uid()` como `empresa_id`, no con el `empresa_id` compartido — cada PC tiene que hablar el mismo modelo de permisos para que los datos no se fragmenten entre "empresas" distintas.

- **La protección por roles tiene un límite de fondo, y hay que ser honesto sobre él.** Un empleado necesita tener alumnos, vehículos y prácticas disponibles en su PC para poder trabajar (apuntar kilómetros, ver a quién le toca circular, etc.), así que esos datos **no se le pueden ocultar** ni en el servidor ni en la app: si se le oculta, no puede hacer su trabajo. Lo único que este diseño protege *de verdad*, a nivel de servidor (RLS), son los **pagos**: un empleado sin rol de jefe no puede leerlos ni escribirlos aunque manipule la app o hable directamente con Supabase. En cambio, las estadísticas de rendimiento por profesor (si en el futuro se ocultan en la interfaz para empleados) se calculan a partir de las prácticas, que el empleado sí tiene delante — ocultarlas sería una barrera de interfaz, no seguridad real, porque los datos de origen ya están en su poder. No hay forma de evitar esto sin negarle al empleado los datos que necesita para trabajar; que quede dicho sin adornos.

- **`buscar_uid_por_email(email)` es SECURITY DEFINER y consulta `auth.users`.** La app la necesita para dar de alta a un empleado: se le pide su email y hay que traducirlo al identificador interno del usuario, algo que no se puede consultar de otro modo desde la aplicación. El peligro sería que cualquier usuario autenticado pudiese ir probando emails para averiguar quién está registrado en el sistema (lo que se llama enumeración de cuentas). Para evitarlo, la función comprueba internamente que quien la llama es jefe **antes** de mirar nada; si no lo es, lanza un error sin consultar. Si alguna vez se toca esta función, esa comprobación no se puede quitar.

- **Las funciones nuevas `empresa_actual()` y `rol_actual()` son SECURITY DEFINER ejecutables por cualquier usuario `authenticated`.** El linter de seguridad de Supabase avisará de esto, igual que ya avisa hoy sobre `reparar_secuencias()`. Es aceptable aquí porque ninguna de las dos funciones recibe parámetros ni permite consultar datos de otro usuario: ambas leen exclusivamente la fila de `perfiles` del que llama (filtran siempre por `auth.uid()` internamente). No exponen ni permiten modificar nada ajeno.

- **`logs` recibe la misma política compatible con roles que el resto de tablas de datos.** Se comprobó por SELECT de solo lectura contra `pg_policies` que su política actual se llama `empresa_all` (igual que en las demás tablas), así que el `DROP POLICY IF EXISTS empresa_all ON public.logs` del bloque 5 acierta con el nombre real. Un empleado con perfil propio puede seguir escribiendo y leyendo su registro de operaciones.

- **El trigger `proteger_campos_criticos_propios` bloquea más que el cambio de rol.** La política `perfiles_update_propio` solo exige `user_id = auth.uid()` para dejar que un usuario edite su propia fila; sin más control, ese usuario podría cambiarse a sí mismo el `empresa_id` al de otra empresa (un uuid visto en un log, por un ex-empleado, etc.) y, a partir de ahí, `empresa_actual()` devolvería ese id ajeno y todas las políticas operativas se lo concederían — es decir, tendría acceso a todos los datos de una empresa que no es la suya. El trigger impide, en la propia fila del usuario que edita (`OLD.user_id = auth.uid()`), cambiar `rol`, `empresa_id` o `sucursal_id`. Un jefe editando la fila de OTRO usuario sí puede cambiar los tres campos con normalidad.

- **No se ha añadido una clave foránea entre `sucursal_id` y `sucursales.id`.** Tal y como se pidió, la columna es una simple columna `bigint` nullable sin `default` ni `FOREIGN KEY`. Esto significa que la base de datos no impide guardar un `sucursal_id` que no corresponda a ninguna sucursal real, ni limpia automáticamente el campo si se borra una sucursal. Si en el futuro se quiere esa garantía, es un cambio pequeño y aparte (`ALTER TABLE … ADD CONSTRAINT … FOREIGN KEY … ON DELETE SET NULL`).

- **El backfill de `perfiles` asume que cada usuario actual de `auth.users` debe quedar como jefe de una empresa cuyo `empresa_id` es su propio `id`.** Esto reproduce exactamente el modelo de hoy, así que es correcto para el estado actual (un usuario = una empresa), pero si en el futuro hay usuarios de Auth que no deberían tener perfil propio (por ejemplo, cuentas de servicio), este backfill les crearía uno igualmente. Con los datos actuales (una empresa, un dueño) no aplica, pero queda anotado.

- **La restricción "nadie puede tocar los campos críticos de su propia fila" se implementa con un trigger (`proteger_campos_criticos_propios`), no con la política RLS.** RLS no permite comparar de forma fiable el valor viejo y el nuevo de una columna dentro de la misma expresión `USING`/`WITH CHECK` en un `UPDATE`, así que se usa un trigger `BEFORE UPDATE` que compara `OLD` contra `NEW` (`rol`, `empresa_id`, `sucursal_id`) y lanza una excepción si alguno difiere y quien edita es el propio dueño de la fila (`OLD.user_id = auth.uid()`). Un jefe editando la fila de OTRO usuario sí puede cambiarle esos tres campos con normalidad.

# Migración: índice único de matrícula en vehículos

Fecha: 2026-08-04. Archivos de esta carpeta:

- `2026-08-04_unique_matricula_vehiculos.sql` — la migración.
- `2026-08-04_unique_matricula_vehiculos_ROLLBACK.sql` — la red de seguridad.

**No se ha aplicado a Supabase.** Solo un archivo en el repositorio, a la espera de que decidas aplicarla.

## Qué hace, en llano

La sincronización empareja los vehículos por `id`, no por matrícula. Al fusionar dos instalaciones que habían numerado sus vehículos de forma independiente, el mismo coche real se subió con dos ids distintos y quedó duplicado en Supabase — la app de escritorio nunca lo notó (siempre lee su propio `data.json`), pero la web del móvil sí, porque lee directamente de la nube.

Esta migración crea un índice único parcial en `vehiculos` sobre `(empresa_id, matricula)` que solo cuenta las filas activas (`deleted = false`) con matrícula rellenada (`matricula <> ''`). A partir de aplicarla, Postgres rechaza cualquier intento de dejar dos vehículos activos con la misma matrícula en la misma empresa. Es la red de seguridad del lado del servidor: sync.js ya evita crear el duplicado de forma proactiva (ver `_reconciliarVehiculoPorMatricula` en `sync.js`, que antes de subir un vehículo comprueba si la nube ya tiene esa matrícula con otro id y adopta ese id en vez de duplicar), pero el índice cubre también cualquier cliente que no pase por esa comprobación.

En modo legado (sin la migración de roles/sucursales aplicada, `empresa_id` siempre `NULL`), el índice no restringe nada: dos `NULL` nunca se consideran iguales en SQL, así que el comportamiento es idéntico al actual hasta que haya una `empresa_id` real.

## Pasos exactos para aplicarla

1. **Comprobar que no hay ya duplicados activos** (los que motivaron esta migración se limpiaron a mano en Supabase el 2026-08-04, pero hay que reconfirmar antes de aplicar en producción, sobre todo si ha pasado tiempo):
   ```sql
   SELECT empresa_id, matricula, count(*)
   FROM public.vehiculos
   WHERE deleted = false AND matricula <> ''
   GROUP BY empresa_id, matricula
   HAVING count(*) > 1;
   ```
   Si devuelve filas, resolver esos duplicados (decidir qué id es el bueno, repuntar alumnos/prácticas del otro y darlo de baja) antes de seguir.
2. Aplicar `2026-08-04_unique_matricula_vehiculos.sql` (vía el SQL Editor de Supabase, o `node .claude/scripts/sql.js` si ya se ha revisado y aprobado).
3. Verificar: la app de escritorio sigue sincronizando con normalidad; dar de alta dos vehículos con la misma matrícula en la misma empresa desde dos PCs distintos ya no debería poder dejar dos filas activas en Supabase.

## Cómo revertir

Ejecutar `2026-08-04_unique_matricula_vehiculos_ROLLBACK.sql` (`DROP INDEX IF EXISTS`). No borra ni modifica ninguna fila: el índice no almacena datos por sí mismo, así que revertirlo es seguro en cualquier momento.

# Migración: módulos contratados por empresa (entitlements)

Fecha: 2026-08-04. Archivos de esta carpeta:

- `2026-08-04_modulos_empresa.sql` — la migración.
- `2026-08-04_modulos_empresa_ROLLBACK.sql` — la red de seguridad.

**No se ha aplicado a Supabase.** Solo un archivo en el repositorio, a la espera de que decidas aplicarla. Es el primer paso de `ROADMAP-SAAS.md` → Fase 0 · Bloque 1 (cimientos multi-empresa).

## Qué hace, en llano

Crea la tabla `modulos_empresa`: una fila por cada módulo que una empresa tiene contratado (por ejemplo, en el futuro, "portal_alumno" o "verifactu"), con un booleano `activo`. La app solo LEE esta tabla (nunca inserta, actualiza ni borra desde el cliente): el alta o baja de un módulo para una empresa se hace a mano por SQL, o con la clave de rol de servicio, nunca desde la aplicación. Así, aunque alguien manipulara la app instalada, no podría autoconcederse un módulo de pago que no ha contratado.

Aplicar esta migración, por sí sola, no cambia nada visible: hoy ningún sitio del código consulta todavía `moduloActivo()` para decidir qué mostrar (`renderer/roles.js`), así que la tabla existe pero no influye en nada hasta que una funcionalidad futura empiece a consultarla.

**⚠️ ORDEN OBLIGATORIO:** esta migración usa la función `empresa_actual()`, definida en `2026-08-01_roles_y_sucursales.sql`. Esa migración tiene que estar aplicada ANTES que esta — si no lo está, el `CREATE POLICY` de esta migración falla porque la función no existe todavía.

## Pasos exactos para aplicarla

1. Confirmar que `2026-08-01_roles_y_sucursales.sql` ya está aplicada en el proyecto (ver su propia sección de este README). Si no lo está, aplicarla primero.
2. Copia de seguridad (mismo criterio que el resto de migraciones de esta carpeta): backup de `data.json` desde Ajustes y, si se quiere, un `SELECT * FROM …` guardado de las tablas relevantes.
3. Aplicar `2026-08-04_modulos_empresa.sql` (vía el SQL Editor de Supabase, o `node .claude/scripts/sql.js` si ya se ha revisado y aprobado).
4. Verificar (paso siguiente).

## Qué verificar después

- `SELECT * FROM modulos_empresa;` → tabla vacía (nadie tiene módulos dados de alta todavía).
- La app de escritorio sigue arrancando y sincronizando exactamente igual que antes: `sync.getModulosActivos()` consulta la tabla, la encuentra vacía, y devuelve `{ disponible: true, modulos: {} }` — ningún módulo se considera activo porque no hay filas, no porque la tabla falte.
- (Opcional) Dar de alta a mano una fila de prueba (`INSERT INTO modulos_empresa (empresa_id, modulo, activo) VALUES ('<uuid de una empresa>', 'modulo_prueba', true);`) e iniciar sesión con esa cuenta: `sync.getModulosActivos()` debe devolver `{ disponible: true, modulos: { modulo_prueba: true } }`.

## Cómo revertir

Ejecutar `2026-08-04_modulos_empresa_ROLLBACK.sql` (`DROP TABLE ... CASCADE`). Si para entonces ya hay módulos contratados dados de alta de verdad, esos datos se pierden — leer la advertencia dentro del propio archivo antes de ejecutarlo.

## Nota sobre `2026-08-01_roles_y_sucursales.sql`: endurecimiento de `buscar_uid_por_email`

Al preparar esta migración se revisó `buscar_uid_por_email` (la función que usa `invitarEmpleado()` para traducir un email a su user_id) y se encontró una rendija: comprobaba el rol de quien llama con `coalesce(rol_actual(), 'jefe') = 'jefe'`, así que un usuario autenticado SIN fila todavía en `perfiles` pasaba la comprobación igual que un jefe de verdad, y podía usar la función como oráculo para averiguar qué emails están registrados (enumeración de cuentas). Se corrigió en el propio archivo `2026-08-01_roles_y_sucursales.sql` a una comprobación estricta (`rol_actual() IS NULL OR rol_actual() <> 'jefe'` → excepción). No hay pérdida funcional: `invitarEmpleado()` en `sync.js` ya exige `perfil.disponible` antes de llamar a esta RPC, así que un jefe legítimo (con su fila de backfill) nunca la dispara. Si `2026-08-01_roles_y_sucursales.sql` ya se hubiera aplicado en producción con la versión antigua de la función, hay que reaplicar solo el bloque 4b (`CREATE OR REPLACE FUNCTION public.buscar_uid_por_email`) para adoptar el arreglo.

# Migración: portal del alumno (email OTP de Supabase Auth)

Fecha: 2026-08-05. Archivos de esta carpeta:

- `2026-08-05_portal_alumno.sql` — la migración.
- `2026-08-05_portal_alumno_ROLLBACK.sql` — la red de seguridad.

**No se ha aplicado a Supabase.** Solo un archivo en el repositorio, a la espera de que decidas aplicarla. Es el entregable de `ROADMAP-SAAS.md` → Fase 0 · Bloque 2 (portal del alumno), ver también `PROPUESTA-BLOQUE2-PORTAL-ALUMNO.md`. Reemplaza al enfoque anterior de "enlace inadivinable" con `portal_token` (descartado, nunca llegó a aplicarse) por login con email + código OTP de un solo uso, usando Supabase Auth directamente.

**Dependencia:** requiere aplicar antes `2026-08-05_alumno_email.sql` (usa la columna `alumnos.email`).

**Dependencia opcional — módulo `portal_alumno`:** las funciones del portal comprueban, a través de la función auxiliar `empresa_tiene_portal(empresa_id)`, que la empresa del alumno tenga contratado el módulo `portal_alumno` en `modulos_empresa` (ver `2026-08-04_modulos_empresa.sql`, ROADMAP-SAAS.md → Fase 0 · Bloque 1). Es graceful: si esa migración todavía no está aplicada (la tabla `modulos_empresa` no existe), no bloquea nada y el portal funciona igual que si el gating no existiera. No hay orden de aplicación obligatorio entre las dos migraciones.

## Qué hace, en llano

Da a cada alumno acceso a sus prácticas desde `/alumno.html` iniciando sesión con su propio email: escribe el correo, Supabase le envía un código de 6 dígitos, lo introduce y entra. No hace falta que el alumno tenga contraseña ni cuenta de empresa. Tres funciones nuevas:

- `empresa_tiene_portal(empresa_id)` — booleano auxiliar: ¿esa empresa tiene contratado el módulo `portal_alumno`? Si el sistema de módulos no está aplicado (tabla `modulos_empresa` inexistente) devuelve siempre true (modo clásico, no bloquea).
- `alumno_email_existe(email)` — booleano: ¿hay algún alumno con este email cuya empresa tenga el portal activo? La usa el backend para decidir si pide a Supabase Auth que envíe el código (y siempre responde igual al navegador, exista o no el alumno, para no revelar nada).
- `portal_mis_datos()` — sin parámetros: lee el email del JWT ya verificado por Supabase Auth y devuelve los datos y últimas prácticas del alumno con ese email, o NULL si la empresa del alumno no tiene el portal activo. Al no aceptar ningún id ni email como argumento, un alumno no puede pedir los datos de otro cambiando un parámetro.

Aplicar esta migración, por sí sola, no cambia nada visible en la app de escritorio (no toca ninguna tabla, solo añade funciones). En el panel de Supabase hace falta además habilitar el login por email OTP y revisar la plantilla de correo — checklist completo en el comentario de cabecera de `web-remote/api/alumno-solicitar-codigo.js`.

## Pasos exactos para aplicarla

1. Copia de seguridad (mismo criterio que el resto de migraciones de esta carpeta): backup de `data.json` desde Ajustes y, si se quiere, un `SELECT * FROM alumnos` guardado.
2. Aplicar `2026-08-05_alumno_email.sql` si no se ha aplicado ya (dependencia).
3. Aplicar `2026-08-05_portal_alumno.sql` (vía el SQL Editor de Supabase, o `node .claude/scripts/sql.js` si ya se ha revisado y aprobado).
4. En el panel de Supabase: habilitar email OTP (Authentication → Providers → Email), añadir `{{ .Token }}` a la plantilla de "Magic Link"/OTP (Authentication → Email Templates) y revisar los límites de envío del SMTP (Authentication → Settings → SMTP Settings; el SMTP por defecto de Supabase es de pruebas, con volumen bajo).
5. Verificar (paso siguiente).

## Qué verificar después

- `SELECT alumno_email_existe('correo-de-un-alumno-real@ejemplo.com');` → `true` si ese email existe en `alumnos` (y `false` para uno inventado). Si ya se ha aplicado también `2026-08-04_modulos_empresa.sql` y esa empresa NO tiene el módulo `portal_alumno` activo, debe dar `false` aunque el email exista.
- `portal_mis_datos()` NO se puede probar de verdad desde el SQL Editor (corre con el rol de servicio, que no tiene un JWT de alumno con claim `email`): la única forma real de probarla es completar el flujo de Supabase Auth desde `/alumno.html` (pedir código, verificarlo, ver que llegan los datos).
- La app de escritorio sigue arrancando y sincronizando con normalidad (la migración no toca RLS ni ninguna tabla, solo añade funciones).

## Cómo revertir

Ejecutar `2026-08-05_portal_alumno_ROLLBACK.sql` (borra las tres funciones: las dos del portal y la auxiliar `empresa_tiene_portal`; no hay columna que perder en esta migración).

# Migración: email de alumno

Fecha: 2026-08-05. Archivos de esta carpeta:

- `2026-08-05_alumno_email.sql` — la migración.
- `2026-08-05_alumno_email_ROLLBACK.sql` — la red de seguridad.

**No se ha aplicado a Supabase.** Solo un archivo en el repositorio, a la espera de que decidas aplicarla. Es un prerequisito de `ROADMAP-SAAS.md` → Fase 0 · Bloque 2 (portal del alumno): antes de poder ofrecer un login por email + código al correo, cada alumno necesita tener un email guardado.

## Qué hace, en llano

Añade una columna `email` a `alumnos` (nullable, sin valor por defecto) y un índice para buscar por email en minúsculas. La app de escritorio ya sabe guardar y editar el email de cada alumno (campo "Email (para el portal del alumno)" en el alta y la edición), y desde antes de aplicar esta migración: en local ya se guarda en `data.json`. Lo único que falta hasta aplicar esta migración es que ese email también se suba a Supabase — `sync.js` detecta en tiempo de ejecución si la columna existe (mismo patrón que `_sucursalesDisponible`) y, mientras no exista, simplemente no lo incluye en la subida, sin errores ni sincronización rota.

Esta migración NO añade ningún mecanismo de login todavía, solo el campo de datos.

## Pasos exactos para aplicarla

1. Copia de seguridad (mismo criterio que el resto de migraciones de esta carpeta): backup de `data.json` desde Ajustes y, si se quiere, un `SELECT * FROM alumnos` guardado.
2. Aplicar `2026-08-05_alumno_email.sql` (vía el SQL Editor de Supabase, o `node .claude/scripts/sql.js` si ya se ha revisado y aprobado). No depende de ninguna otra migración de esta carpeta.
3. Verificar (paso siguiente).

## Qué verificar después

- `SELECT email FROM alumnos LIMIT 5;` → todo `NULL` salvo los alumnos a los que ya se les haya puesto email desde la app (esos se sincronizan al primer `sync()`/`pushAll()` tras aplicar la migración).
- La app de escritorio sigue arrancando y sincronizando con normalidad; editar el email de un alumno y forzar sincronización (`Ajustes → Sincronizar ahora`) debe reflejarlo en `SELECT email FROM alumnos WHERE id = ...`.

## Cómo revertir

Ejecutar `2026-08-05_alumno_email_ROLLBACK.sql`. Si para entonces ya hay emails de alumnos guardados de verdad, esos datos se pierden — leer la advertencia dentro del propio archivo antes de ejecutarlo.
