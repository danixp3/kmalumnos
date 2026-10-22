# Marco legal de AulaMovil (España) — estado a 7 de octubre de 2026

Qué normas afectan a AulaMovil, qué cubre ya el programa y qué tiene que hacer cada parte. No sustituye a un abogado: conviene que uno revise los textos (sobre todo la limitación de responsabilidad y el contrato de encargo) antes de crecer.

Textos públicos (se generan con `node scripts/paginas-legales.js`): https://aulamovil.vercel.app/legal/ — aviso legal, privacidad, cookies, condiciones, contrato de encargo del tratamiento e información para alumnos. Versión `2026-10-07` (constante `VERSION_LEGAL` en el script y en `renderer/legal.js`: al cambiarla, la app vuelve a pedir que se acepten).

Titular: Daniel Alexis Pérez Nicolás, NIF 76735508X, Rúa Vicente Risco 1, 1.º B, 32630 Xinzo de Limia (Ourense) · pzdani04@gmail.com.

## 1. Quién es quién con los datos

| Datos | Responsable | AulaMovil |
|---|---|---|
| Alumnos, tutores, profesores, empleados, interesados que mete cada autoescuela | La autoescuela | **Encargado del tratamiento** (art. 28 RGPD). Contrato de encargo aceptado en la app |
| Cuentas de las autoescuelas, facturación del servicio, soporte, registros técnicos | Daniel (titular) | Responsable |

Subencargados: Supabase (base de datos y login, **Irlanda**) y Vercel (web y funciones, **Dublín** desde esta versión: antes corrían en Washington). Ambos con cláusulas contractuales tipo; Vercel además en el Marco de Privacidad UE-EE. UU. **Ojo:** el contrato de tratamiento de Vercel no cubre el plan gratuito (Hobby): ver § 5, tarea 1.

## 2. Normas y cómo se cubren

| Norma | Qué exige | Qué hace la app | Qué falta / quién |
|---|---|---|---|
| **RGPD + LOPDGDD** — contrato de encargo (art. 28) | Contrato escrito entre autoescuela y proveedor | `encargo-tratamiento.html`, aceptado en la app (Ajustes → Legal; queda en `ajustes_empresa.legal_aceptacion` con versión, fecha y cuenta) | Revisión por abogado (recomendado) |
| RGPD — informar al alumno (art. 13) | Hoja informativa al recoger los datos | Genera la **hoja de protección de datos** (en blanco o con los datos del alumno) con consentimientos y firma | La autoescuela la entrega y archiva |
| RGPD — registro de actividades (art. 30) | La autoescuela y el encargado | Genera el **registro de actividades** de la autoescuela | Daniel: llevar el suyo como encargado (art. 30.2): basta la lista de clientes + este documento |
| RGPD — derechos | Acceso, portabilidad, supresión… | Ficha → Documentos: **Exportar sus datos** (Excel/JSON) y **Anonimizar** (también en la nube); queda en el historial | — |
| RGPD — conservación (art. 5.1.e) | No guardar más de lo necesario | Ajustes → Legal → **Conservación**: alumnos terminados sin actividad desde hace N años (6 por defecto) para anonimizar | La autoescuela decide y ejecuta |
| RGPD — seguridad (art. 32) | Medidas adecuadas | Ver `CHANGELOG-SECURITY.md` (auditoría 2026-10) | Autoescuela: cifrado del disco, usuario con contraseña, bloqueo de móviles |
| RGPD — brechas (arts. 33-34) | AEPD en 72 h | El contrato obliga a avisar a la autoescuela en ≤ 48 h | Daniel: si pasa, avisar a los clientes afectados |
| LOPDGDD art. 7 — menores | < 14 años: consentimiento de padres | La hoja tiene firma del tutor; el contrato de enseñanza, la del representante legal (menores de 18) | La autoescuela |
| Firma en la tablet | Prueba de la clase | Solo imagen (firma electrónica simple, eIDAS art. 25); **no** datos biométricos | — |
| **LSSI-CE** art. 10 — aviso legal | Identidad del titular en la web | `aviso-legal.html` enlazado en el login, el Perfil del móvil, el portal y la app | — |
| LSSI art. 22.2 — cookies | Consentimiento salvo técnicas | La web **no usa cookies**; solo almacenamiento técnico y de preferencias (exento). Listado en `cookies.html` | — |
| **Reglamento (UE) 2022/2065** (servicios digitales) | Punto único de contacto | En el aviso legal | — |
| **RD 1295/2003** (autoescuelas) art. 39 | Libro de alumnos, informatizable, 4 años | Libro de registro (alumnos con nº, datos y fechas) | La autoescuela lo conserva 4 años |
| RD 1295/2003 art. 40 | Fichas de formación con **fecha, km**, firmas; ≥ 2 años a disposición de Tráfico | Ficha DGT con km y firmas. **Los km calculados por la app se marcan con «*» y nota al pie** (casilla «Señalar…», activada por defecto) | Ver § 4 |
| RD 1295/2003 art. 42 | **Contrato de enseñanza** con cada alumno, por duplicado | Genera el **contrato de enseñanza** con precios, duración de clase, anulaciones, derechos, hojas de reclamaciones | La autoescuela lo revisa, firma y archiva |
| Normativa de consumo (CCAA) | Hojas de reclamaciones, información de precios | Mención en el contrato | La autoescuela (cartel y hojas) |
| ET art. 34.9 — registro de jornada | Diario, 4 años | Módulo Jornada (fichajes y correcciones con rastro) | **RD de registro digital**: en tramitación (Consejo de Estado crítico en marzo 2026; reforma prevista desde septiembre 2026). Revisar cuando se publique |
| **VeriFactu** (RD 1007/2023; RDL 15/2025) | Software que **emite facturas** | AulaMovil **no emite facturas** (el libro de ventas es un informe): no es un SIF | Si un día factura: obligatorio desde el primer día (fabricantes desde 29-07-2025). Las autoescuelas: SIF adaptado desde 1-1-2027 (IS) o 1-7-2027 (resto) |
| IVA de las clases | — | IVA por defecto 21 % (las clases de autoescuela no están exentas: TJUE C-449/17) | Gestoría |
| Accesibilidad (Ley 11/2023) | Servicios a consumidores | Servicio B2B de microempresa: no aplica | — |
| Licencias de software | Respetar las de terceros | Todas permisivas (MIT, ISC, Apache-2.0, BSD, OFL; GeoNames CC BY 4.0). Listado en Ajustes → Legal | Regenerar con `node scripts/licencias-terceros.js` al cambiar dependencias |

## 3. Tareas de Daniel antes de vender

Obligatorias:
1. **Vercel → plan Pro.** El plan Hobby es solo para uso personal no comercial y no tiene contrato de tratamiento (DPA).
2. **Supabase → plan Pro** (recomendado fuerte): copias de seguridad diarias, el proyecto no se pausa, protección de contraseñas filtradas y caducidad de sesiones. Firmar su DPA (Dashboard → Organization → Legal Documents).
3. **Alta fiscal** como autónomo (o sociedad) y facturar el servicio con un programa **VeriFactu** a partir de su fecha (1-7-2027 si no es sociedad). Epígrafe del IAE: el que diga la gestoría.
4. **SMTP propio** en Supabase Auth: el correo de serie solo permite 2 emails por hora (confirmar cuentas, portal del alumno).

Recomendadas:
5. Revisión de los textos por un abogado.
6. Seguro de responsabilidad civil profesional (errores del software).
7. Registrar la marca «AulaMovil» en la OEPM.
8. Certificado de firma de código (Authenticode) para el instalador.
9. **Repositorio de GitHub público**: el código y la documentación interna se ven. Ya no hay datos de alumnos en el árbol actual (se quitó `registro_kilometraje_alumnos.csv`, con nombres reales, que estaba desde la v1.0.0), pero sigue en el historial. Plan: publicar las actualizaciones desde un repositorio público aparte y poner este en privado (los PCs instalados buscan las actualizaciones aquí: primero hay que sacar una versión que apunte al nuevo).

## 4. Kilómetros calculados y fichas oficiales

La ficha de formación práctica lleva los km de cada clase y se conserva para Tráfico (art. 40 RD 1295/2003). Las herramientas de km (Cuadrar y generar km, «Los pone la app», compañeros sin registrar del modo avanzado) **estiman** los km que nadie anotó a partir del cuentakilómetros real; no crean alumnos ni clases. Por honestidad documental:
- Todos los km que pone la app quedan marcados como calculados (`tipo_detalle = 'km_auto'`).
- La ficha DGT los señala con «*» y una nota al pie, salvo que se desmarque conscientemente.
- Las condiciones dejan claro que la autoescuela responde de que los documentos oficiales reflejen la realidad.
Lo mejor es que los profesores anoten el km real en el móvil al empezar y terminar cada clase: entonces no hay nada que estimar.

## 5. Revisión del 20 de octubre de 2026 (la autoescuela del propio titular)

Daniel es el dueño de la autoescuela y hace el programa. Para sus alumnos, **la autoescuela es la responsable** de los datos; AulaMovil (Daniel como desarrollador) es el encargado y Supabase y Vercel son subencargados.

### ¿Basta con el documento de protección de datos que firman al matricularse?
Sirve, **si dice lo que de verdad pasa con los datos**. Lo que exige la ley (art. 13 RGPD) es *informar*, no pedir permiso: la autoescuela trata los datos porque hace falta para el contrato de enseñanza y porque lo exigen las normas de Tráfico y fiscales (arts. 6.1.b y 6.1.c). La firma solo prueba que se informó. Un modelo genérico (de gestoría o de antes de usar AulaMovil) suele quedarse corto en:
1. Que los datos se gestionan con un programa en la nube y quién es el proveedor (AulaMovil, con servidores en Irlanda; Supabase y Vercel, empresas de EE. UU. con garantías).
2. Que el alumno **firma cada clase en la tablet** (se guarda la imagen) y que puede recibir **un enlace por WhatsApp** para firmar desde su móvil.
3. Que los móviles de los profesores guardan una copia reducida para trabajar sin cobertura.
4. Los plazos de conservación (libro 4 años, fichas 2, cobros 6) y el derecho a reclamar ante la AEPD.
5. Los consentimientos aparte (casillas): foto, restricciones médicas, publicidad.

**Qué hacer:** a los alumnos nuevos, darles la hoja que genera AulaMovil (Ficha del alumno → menú de documentos → «Hoja de protección de datos»; en blanco, desde Ajustes → Legal y privacidad), que ya incluye todo lo anterior (actualizada el 20-10-2026). A los que ya están no hace falta volver a firmarles nada: basta con tenerles informados (la página https://aulamovil.vercel.app/legal/alumnos.html, un cartel en la oficina o mandarles el enlace). Solo lo opcional (foto, médico, publicidad) necesita su firma.

### Tareas del propietario, por orden
1. **Vercel → plan Pro** (≈ 20 $/mes). La web del móvil pasa por Vercel los nombres, clases y firmas de los alumnos; el plan gratuito es solo para uso personal no comercial y no tiene contrato de tratamiento de datos (DPA). Sin él falta el contrato del art. 28 con ese proveedor. Al pasar a Pro, aceptar su DPA. Alternativa: mover la web a otro proveedor con DPA.
2. **Supabase:** pedir y firmar su DPA (panel → Organization → Legal Documents; gratis). Recomendable el plan Pro (copias diarias, que el proyecto no se pause).
3. **Incidente del repositorio público:** `registro_kilometraje_alumnos.csv` (56 filas con nombre de alumno, coche, fecha y km) estuvo publicado en GitHub desde el 13-07-2026, y en pruebas y notas había además el NIE y el teléfono de dos alumnos, nombres de otros 6 y el de un profesor. Es una violación de la confidencialidad (art. 4.12 RGPD). **Ya está quitado de todo el historial (20-10-2026)**, sin romper las actualizaciones. Riesgo bajo (pocos datos, sin datos sensibles ni rastro de que alguien los usara), por lo que probablemente no hay que notificarlo a la AEPD, pero **hay que anotarlo** en el registro de incidentes (art. 33.5) con esta valoración y pedir al soporte de GitHub que borre las copias en caché de los commits antiguos (https://support.github.com → «Remove sensitive data», indicando el repositorio `danixp3/kmalumnos`).
4. **Alumnos antiguos:** tras traer Ariauto hay ~3.150 alumnos terminados, algunos de 1998. Lo que pase de los plazos legales no se debe guardar (art. 5.1.e): Ajustes → Legal y privacidad → Conservación (6 años por defecto) para anonimizarlos. Desde el 20-10-2026 ya no viajan a los móviles los terminados sin actividad en 2 años.
5. **Profesores y empleados:** informarles también (cláusula en su contrato) de que sus datos, su firma y su registro de jornada están en AulaMovil; pedirles bloqueo de pantalla en el móvil y, si se pierde uno, cerrar la sesión en los demás dispositivos (Ajustes → Cuenta). Los enlaces de firma, mejor desde el WhatsApp de la autoescuela que desde el personal.
6. **Ordenadores de la oficina:** usuario de Windows con contraseña y cifrado del disco (BitLocker o «Cifrado del dispositivo»); `data.json` y las copias de seguridad tienen todos los datos.
7. **Registro de actividades** (art. 30): generarlo en Ajustes → Legal y guardarlo firmado; repasarlo si cambia algo.
8. Que un abogado revise los textos antes de vender AulaMovil a otras autoescuelas.

## 6. Revisión del 22 de octubre de 2026 (v1.38.0)

**Normas:** sin cambios desde el 20-10. El **real decreto del registro de jornada digital sigue sin publicarse en el BOE** (Consejo de Estado desfavorable en marzo; aplazado en julio; sin fecha). VeriFactu sigue en 2027 (1-1 sociedades, 1-7 resto). Cuando salga el decreto de jornada habrá que revisar el módulo Jornada: hoy el registro está en cada PC (no en la nube) y los borradores piden que Inspección pueda consultarlo a distancia y que cada trabajador acceda al suyo.

**Arreglado en la app:**
- **Registro de jornada (art. 34.9 ET, conservar 4 años):** un fichaje ya **no se puede borrar**: se *anula* con su motivo, sigue en la lista (tachado) y en la exportación, y queda en el Historial. La exportación para Inspección lleva ahora el estado y todas las correcciones. Un turno que pasa de la medianoche se cierra en la misma jornada (con la fecha de salida). La fecha del fichaje era la de UTC: entre las 00:00 y las 02:00 quedaba en el día anterior.
- **Responsabilidad proactiva (art. 5.2 RGPD):** el Historial guardaba solo las 500 últimas operaciones y «Borrar historial» lo vaciaba todo, así que se perdía la prueba de las exportaciones y anonimizaciones de datos de alumnos. Ahora esas anotaciones, las anulaciones de jornada y **cada aceptación de las condiciones** (antes solo se guardaba la última) se conservan siempre.
- Fechas de «hoy» en hora de España en todo el programa y en la web (caja, cargos, bonos, caducidades, interesados, exportaciones, filtros del Historial).
- **Minimización (art. 5.1.c y 32 RGPD):** las pruebas automáticas de la interfaz dejaban una copia completa de los datos de los alumnos en la carpeta temporal de Windows; ahora la borran al terminar (v1.38.1).

**Comprobado y correcto:** la web no usa cookies; al cerrar sesión en el móvil se borra la copia de datos del teléfono; la ficha DGT no incluye las «clases sin fecha» (solo cuentan en el total del alumno). Los avisos de seguridad de Supabase siguen siendo los conocidos (`pg_net` en `public`, funciones con secreto del servidor; la protección de contraseñas filtradas necesita el plan Pro: § 5, tarea 2).
