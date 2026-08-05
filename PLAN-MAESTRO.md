# Plan maestro de AulaMovil — hoja de ruta hacia el "todo en uno"

_Creado el 2026-08-06. Documento **autocontenido** para arrancar en una ventana nueva sin perder contexto. Cruza la investigación de mercado (`ANALISISAUTGEST.md`, en Descargas del propietario) con **lo que el producto YA tiene de verdad** (incluido todo lo construido en la sesión del 2026-08-05/06, que el informe de investigación NO conocía). Complementa —no sustituye— a `ROADMAP-SAAS.md` (visión SaaS/módulos), `INVESTIGACION-AUES-VERIFACTU.md` (viabilidad AUES/VeriFactu/firma/pagos) y `CHECKLIST-PROPIETARIO.md` (tareas del dueño)._

> **Cómo usar este documento:** la Sección 1 es el estado real; la Sección 2 es el checklist del informe **corregido** con lo que ya existe; la Sección 3 es la hoja de ruta priorizada de lo que falta (con complejidad y dependencias); la Sección 4 lista lo que depende del propietario; la Sección 5 son las convenciones técnicas del código para implementar sin romper nada.

---

## 1. Estado real del producto (agosto 2026)

### 1.1. Núcleo ya existente (antes de esta sesión)
- Alumnos, profesores, vehículos; **prácticas con kilómetros** por alumno, con **detección de solapamientos** y relleno masivo de km.
- **Pagos/cobros por alumno**, **tarifas configurables** por permiso/tipo, y cálculo de **deuda/saldo por alumno** (`getDeudas`, `getDesglosePagosAlumno` con desglose FIFO práctica a práctica: pagada/parcial/pendiente).
- **Multi-sucursal**; **sincronización nube bidireccional offline-first** (Supabase), colas de cambios, resolución de colisiones de ids.
- **Dashboard** con 5 gráficos configurables; **buscador global** (Ctrl/⌘+K); **importación/exportación CSV**; **copias de seguridad**; **auto-actualización** (electron-updater).
- **Roles jefe/empleado** (básico) y **web móvil** con PIN para registrar prácticas (embrión de app del profesor).
- **Logs** de actividad (auditoría informal).

### 1.2. Construido en la sesión 2026-08-05/06 (el informe NO lo sabía)
- **Base SaaS multi-empresa aplicada en Supabase:** `perfiles` (usuario→empresa+rol), `sucursales`, y **módulos contratables por empresa** (`modulos_empresa` + `moduloActivo()`), con gating graceful. Producción ya es multi-empresa.
- **Portal del alumno (web, desplegado y validado):** login por **email + enlace mágico** (Supabase Auth), ver sus prácticas en solo lectura, **solicitar clases** (reserva 'solicitada' que la autoescuela confirma) y ver **"mis próximas clases"**. Gateado por el módulo `portal_alumno`.
- **Agenda de reservas (escritorio):** modelo "solicitudes de práctica" (estados solicitada/confirmada/cancelada/realizada), crear/confirmar/cancelar/**completar**. Al **completar** crea automáticamente las N prácticas del alumno. **Nº de prácticas por reserva** y **minutos por clase** configurables. Tarjeta en dashboard + entrada en buscador.
- **Semáforo de examen** (verde/ámbar/rojo por nº prácticas + km + recencia) por alumno y resumen en dashboard — equivale al "report card semáforo" de Drive Scout.
- **Alumnos en riesgo de abandono** (>30 días sin práctica) en dashboard.
- **Análisis de uso y coste de vehículos:** km totales, media km/práctica, km últimos 30 días y **coste de combustible estimado** (precio €/L y consumo L/100km configurables).
- **Ficha del alumno enriquecida:** email, **teléfono, DNI/NIE, fecha de nacimiento, dirección, fecha de alta, observaciones**, y **estado** (activo/aprobado/baja) con filtro. Buscador de alumnos por **nombre/DNI/teléfono**.
- **Economía por alumno desde su ficha** (generado/pagado/saldo + pagos + desglose) y **ficha imprimible/PDF** del alumno.
- Publicadas **v1.12.0** y **v1.13.0** (auto-update verificado). Investigación **AUES/VeriFactu/firma/pagos** cerrada (`INVESTIGACION-AUES-VERIFACTU.md`).

---

## 2. Checklist maestro re-contrastado

Estado real: ✅ hecho · 🟩 hecho en esta sesión (el informe lo daba por ❌/⚠️) · ⚠️ parcial · ❌ falta. Solo se listan las filas donde el estado cambia o merece matiz; el resto se mantiene como en `ANALISISAUTGEST.md`.

| Área | Función | Informe decía | Estado REAL |
|---|---|---|---|
| Alumnos | Ficha completa (DNI/NIE, tel, dirección, nacimiento) | ✅/parcial | 🟩 ✅ (ampliada esta sesión) |
| Alumnos | Estados del alumno | ⚠️ | 🟩 ⚠️→ básico hecho (activo/aprobado/baja); falta ciclo ligado a exámenes |
| Alumnos | Expediente/historial en una ficha | ⚠️ | 🟩 ⚠️ mejorado (datos+economía+progreso+imprimible) |
| Alumnos | Permisos múltiples por alumno | ⚠️ | ⚠️ FALTA (hoy 1 permiso por alumno) |
| Alumnos | Alertas de caducidades (psico/DNI/expediente) | ❌ | ❌ |
| Alumnos | Foto + escaneo/OCR de documentos | ❌ | ❌ |
| Alumnos | Libro de registro informatizado (art. 39) | ❌ | ❌ (legal) |
| Alumnos | Contrato de enseñanza + consentimientos RGPD | ❌ | ❌ (legal) |
| Prácticas | Agenda por profesor/vehículo | ⚠️ | 🟩 ⚠️ hay Agenda (reservas con estados); falta vista visual drag&drop |
| Prácticas | Reserva desde recepción | ⚠️ | 🟩 ✅ (crear reserva en la Agenda) |
| Prácticas | **Reserva self-service del alumno (móvil)** | ❌ | 🟩 ✅ (portal: solicitar clase) |
| Prácticas | Ficha práctica firmable con km (art. 40) | ⚠️ | ⚠️ km sí; falta firma y formato oficial |
| Prácticas | Bonos/packs de clases | ❌ | ❌ |
| Prácticas | Política de cancelación / recordatorios | ❌ | ❌ (cancelar existe; sin política de saldo ni avisos) |
| Prácticas | Valoración de la práctica por el profesor | ❌ | ❌ |
| Flota | Km del vehículo | ⚠️ | 🟩 ✅ (km_actual + análisis por vehículo) |
| Flota | Combustible | ❌ | 🟩 ⚠️ coste estimado (config global); falta consumo real/repostajes |
| Flota | Caducidades ITV/seguro/mantenimiento | ❌ | ❌ |
| Informes | Semáforo de progreso ("report card") | ❌ | 🟩 ✅ (semáforo de examen) |
| Informes | Alumnos en riesgo / retención | ❌ | 🟩 ✅ |
| Informes | Exportación PDF | ⚠️ | 🟩 ⚠️ ficha PDF por alumno; falta PDF/Excel de listados e informes |
| Sistema | Multi-sede/multi-empresa | ✅ | 🟩 ✅ aplicado (perfiles/empresa) |
| Sistema | Módulos contratables (SaaS) | (no listado) | 🟩 ✅ nuevo (`modulos_empresa`) |
| Sistema | Roles/permisos granulares por sección | ⚠️ | ⚠️ jefe/empleado; falta granularidad por módulo |
| Apps | Portal del alumno (expediente/reservar) | ❌ | 🟩 ⚠️→ ver+reservar hechos; falta pagar, tests, notificaciones |
| Apps | App del profesor | ⚠️ | ⚠️ web PIN; falta agenda del día y firma |
| Apps | Firma digital | ❌ | ❌ |
| **Facturación** | **VeriFactu** | ❌ | ❌ (legal, prioritario) |
| Facturación | Facturas/rectificativas/series | ⚠️ | ⚠️ hay cobros/recibos; falta factura formal |
| Facturación | Recibos/cobros por alumno | ✅ | ✅ |
| Facturación | Pagos a plazos / morosidad | ⚠️ | ⚠️ saldo sí; falta gestión formal de morosidad |
| Facturación | Formas de pago + pasarela online/Bizum | ❌ | ❌ |
| Facturación | Arqueo de caja por empleado/sede | ❌ | ❌ |
| Facturación | Tarifas + descuentos/promos | ⚠️ | ⚠️ tarifas sí; faltan descuentos/packs |
| **DGT** | Impresos oficiales, tasas, convocatorias, AUES, resultados | ❌ | ❌ (bloque entero pendiente; investigación AUES hecha) |
| **Personal** | Registro de jornada (art. 34.9 ET) | ❌ | ❌ (legal) |
| Personal | Caducidad certificado del profesor | ❌ | ❌ |
| Teórica | Aulas/asistencia/tests/temario | ❌ | ❌ (bloque entero pendiente) |
| Comunicaciones | SMS/email/WhatsApp/avisos automáticos | ❌ | ❌ (solo el email OTP del portal, vía Supabase) |
| CRM | Leads/origen/presupuestos/campañas | ❌ | ❌ |

**Lectura rápida:** el producto ya ha saltado buena parte del bloque "nueva generación" (portal + reserva self-service + report card + analítica) y toda la base SaaS. Lo que sigue **bloqueando la venta en España** es el **cumplimiento legal** (VeriFactu, jornada, contrato/RGPD, libro de registro) y el **bloque DGT**.

---

## 3. Hoja de ruta priorizada (lo que falta)

Complejidad orientativa: **S** (pequeña, 1 encargo), **M** (media, varios encargos), **L** (grande, proyecto). "Dep. dueño" = necesita cuenta/certificado/decisión del propietario (ver Sección 4).

### FASE A — Cumplimiento legal (bloqueante para vender en España)

**A1. Registro de jornada laboral (art. 34.9 ET).** Complejidad **M**. Dep. dueño: no.
Fichaje entrada/salida por empleado y sede; registro inalterable con historial de correcciones; conservación 4 años; informe exportable para Inspección. Encaja bien porque ya hay `perfiles`/empleados y sucursales. Tabla `jornadas` + UI de fichar + informe. *Es puro desarrollo nuestro, sin terceros → buen primer objetivo legal.*

**A2. Libro de registro de alumnos informatizado (RD 1295/2003 art. 39).** Complejidad **M**. Dep. dueño: no.
Nº y fecha de inscripción, nombre, DNI/NIE, fecha nacimiento, permisos que posee y a los que aspira, fechas de inicio/fin de enseñanza y resultado final. Casi todos los datos **ya están en la ficha** del alumno (los añadimos esta sesión); falta el **nº de inscripción secuencial**, permisos que ya posee, fechas inicio/fin y resultado, y la **vista/impresión "libro"** (numerado, exportable a PDF). Reutiliza la ficha imprimible.

**A3. Fichas de clases prácticas/teóricas firmables (art. 40).** Complejidad **M**. Dep. dueño: no (firma simple) / decisión (firma avanzada).
Formato oficial de la ficha de prácticas con km inicial/final por clase y **firma** (alumno y profesor). v1: ficha imprimible con hueco de firma manuscrita (rápido). v2: firma digital en tablet/portal (enlaza con la firma del bloque digital). Requiere modelar clases teóricas y asistencia (hoy no hay teórica).

**A4. Contrato de enseñanza + consentimientos RGPD.** Complejidad **M**. Dep. dueño: decisión (textos legales).
Plantilla de contrato (art. 42) rellenable con datos del alumno e imprimible/firmable; casillas de consentimiento RGPD; registro de aceptación; derechos ARCO (exportar/borrar datos de un alumno). Enlaza con firma digital (Fase C).

**A5. Facturación VeriFactu (RD 1007/2023).** Complejidad **L**. **Dep. dueño: sí** (elegir proveedor API certificado + credenciales).
Emitir facturas (con huella encadenada, firma, QR, series, rectificativas) integrando una **API certificada de tercero como colaborador social** (VerifactuAPI.es / Facturware — ver `INVESTIGACION-AUES-VERIFACTU.md`), NO desde cero. Modelo `facturas` a partir de `pagos`/alumnos. *Fabricante obligado desde jul-2025; clientes 2027 (aplazado por RD-ley 15/2025). Es el argumento comercial de sustitución del programa actual.*

### FASE B — Bloque DGT y exámenes (paridad con los veteranos)

**B1. Ciclo de estados del alumno ligado a exámenes + permisos múltiples.** Complejidad **M**. Dep. dueño: no.
Ampliar `estado` (matriculado→en teórica→apto teórico→en prácticas→presentado→apto/no apto→baja) y permitir **varios permisos** por alumno (B, A1, A2, AM, C, D, CAP, ADR). Base para convocatorias y libro de registro.

**B2. Control de tasas y convocatorias/presentación a examen.** Complejidad **M**. Dep. dueño: no.
Tasas por alumno (compra, caducidad, 2ª convocatoria); listas de presentación (teórico/maniobras/circulación); resultados (apto/no apto/aplazado/no presentado) y **estadísticas de aprobados por profesor/sede** (aprovecha el semáforo).

**B3. Alertas de caducidades (transversal).** Complejidad **S/M**. Dep. dueño: no.
Motor de avisos para psicotécnico, expediente, convocatorias, **ITV/seguro del vehículo**, certificado del profesor, DNI. Tabla de "vencimientos" + panel de alertas en dashboard.

**B4. Impresos oficiales DGT por Jefatura.** Complejidad **L**. Dep. dueño: parcial (recopilar modelos por provincia).
Talón foto, solicitud de pruebas de aptitud, traslado de expediente, ficha teórica/práctica, autorización de gestión. Plantillas rellenables/imprimibles.

**B5. Conexión AUES (Web Service DGT).** Complejidad **L**. **Dep. dueño: sí** (certificado @firma + alta `soportecau@dgt.es` + homologación).
Tramitación telemática de pruebas de aptitud. Muy diferenciadora. Ver `INVESTIGACION-AUES-VERIFACTU.md` (proceso, 2 operaciones: tramitabilidad y solicitud). Gestión segura del certificado por empresa.

### FASE C — Experiencia digital (ampliar lo ya iniciado)

**C1. Pago online en el portal (pasarela + Bizum).** Complejidad **M**. **Dep. dueño: sí** (Stripe y/o TPV Redsys).
El alumno paga packs/clases desde el portal; registra el pago en su economía. Redsys (comisión baja) y/o Stripe. Enlaza con facturación (A5).

**C2. Firma digital (contratos y ficha de prácticas).** Complejidad **M**. **Dep. dueño: decisión** (proveedor OTP/biométrico o hazlo con OTP propio).
Firma OTP (eIDAS) del contrato y de la ficha de prácticas desde el portal/tablet. Cierra A3/A4.

**C3. Bonos/packs de prácticas + política de cancelación.** Complejidad **M**. Dep. dueño: no.
Vales con nº de clases y caducidad; al reservar/cancelar se descuenta/repone saldo; reglas de cancelación (plazo, con/sin devolución). Amplía la Agenda actual.

**C4. Agenda visual (drag & drop) por profesor/vehículo.** Complejidad **L**. Dep. dueño: no.
Calendario semanal por recurso con arrastrar-soltar, puntos de recogida, lista de espera. Evolución de la Agenda de reservas actual.

**C5. Comunicaciones automáticas (email/SMS/WhatsApp/push).** Complejidad **M/L**. **Dep. dueño: sí** (proveedor de email/SMS; WhatsApp Business).
Recordatorio de clase, resultado de examen, pagos pendientes, caducidades, cumpleaños. Empezar por **email** (más barato) reutilizando SMTP; luego SMS/WhatsApp. Motor de plantillas + disparadores.

**C6. App del profesor (agenda del día + marcar/valorar/firmar).** Complejidad **M**. Dep. dueño: no.
Evolución de la web móvil actual: agenda del día del profesor, marcar clase realizada (ya enlaza con "completar reserva"), valorar la práctica y firmar la ficha.

### FASE D — Económico avanzado, informes y CRM (crecimiento)

**D1. Arqueo de caja por empleado/sede + formas de pago + morosidad.** Complejidad **M**. Dep. dueño: no.
**D2. Descuentos/promociones + cargos automáticos (matrícula/tasas).** Complejidad **S/M**. Dep. dueño: no.
**D3. Informes avanzados + exportación PDF/Excel** (ratios de aprobados, ocupación de profesores/vehículos, comparativas de sedes, ingresos/gastos). Complejidad **M**. Dep. dueño: no. *(Ya hay CSV; falta PDF/Excel formateado e informes.)*
**D4. CRM de captación** (leads, origen del alumno, presupuestos, conversión, campañas). Complejidad **M**. Dep. dueño: no.
**D5. Remesas SEPA + exportación contable (A3/Contaplus) + libro de ventas/IVA.** Complejidad **M**. Dep. dueño: parcial.
**D6. Roles/permisos granulares por módulo** (ver/editar por sección) y **auditoría formal**. Complejidad **M**. Dep. dueño: no. *(Encaja con módulos contratables ya existentes.)*
**D7. Foto del alumno + subida/OCR de documentos** (DNI, psicotécnico). Complejidad **M** (OCR: L). Dep. dueño: parcial (almacenamiento de ficheros en Supabase Storage).

### FASE E — Académica teórica (opcional / integrable con terceros)
Aulas y calendario de teóricas, control de asistencia (art. 40), tests DGT + progreso + simulacros, temario/aula virtual e idiomas. **Recomendación:** integrar tests/temario vía tercero (como hacen varios competidores) en vez de construir el banco de preguntas.

---

## 4. Dependencias del propietario (consolidado — ver también `CHECKLIST-PROPIETARIO.md`)
- **VeriFactu (A5):** contratar API certificada (VerifactuAPI.es/Facturware) y dar credenciales.
- **AUES (B5):** certificado electrónico @firma + alta en `soportecau@dgt.es` + homologación.
- **Pagos (C1):** cuenta Stripe y/o alta TPV Virtual Redsys en el banco.
- **Firma (C2):** decidir proveedor (Signaturit/Viafirma) o aceptar OTP propio.
- **Comunicaciones (C5):** proveedor de email transaccional/SMS; WhatsApp Business API.
- **Impresos DGT (B4):** recopilar los modelos vigentes de su Jefatura Provincial.
- **Contrato/RGPD (A4):** aportar/validar los textos legales con asesor.
- **SMTP propio** (ya en checklist) para volumen de correo del portal.

## 5. Convenciones técnicas (para implementar sin romper nada)
- **Columna nueva sincronizada:** patrón de `email`/`datos` del alumno — detección en runtime (`_..._Disponible` con caché) + gateo del push (`if (xOn) payload.campo = ...`) para no romper el modo sin migración aplicada; añadir al pull y a la lista de conflictos. Ver `sync.js`.
- **Tabla nueva sincronizada:** patrón de `sucursales`/`reservas` (detección `_..._Disponible`, cola `pending.<tabla>`, push/pull/deleted/pushAll gateados, entrada en `_TABLAS_COLISION`).
- **Ids offline vs web:** el escritorio asigna ids pequeños por dispositivo; lo que crea la **web** usa un **rango alto disjunto** (ver `reservas_portal_id_seq` ≥ 1e9 y el tope en el pull de `sync.js`).
- **Funciones del portal:** `SECURITY DEFINER` acotadas, email del alumno desde `auth.jwt()` (no parámetro), gateadas por `empresa_tiene_portal` (módulo). Revocar EXECUTE de anon/PUBLIC salvo lo imprescindible.
- **Módulos contratables:** todo módulo nuevo se activa por empresa en `modulos_empresa` y se consulta con `moduloActivo()` / `empresa_tiene_portal`.
- **Migraciones:** SQL + ROLLBACK + entrada en `migraciones/README.md`; aplicar con `node .claude/scripts/sql.js --file ...`; verificar contra el esquema real antes.
- **Ajustes locales** (minutos por clase, combustible, etc.): `localStorage` con getter global, como en `renderer/ajustes.js`.
- **Cierre de cada tarea:** tests verdes (`npm test`), `node --check` de los `.js` de renderer tocados, commit, y agrupar cambios de escritorio en un **release** (`/publicar-release`) cuando haya un bloque listo.

---

### Orden recomendado de ataque
1. **A1 (jornada)** y **A2 (libro de registro)** — legales, sin terceros, aprovechan lo ya hecho: victorias rápidas y vendibles.
2. **A5 (VeriFactu)** en cuanto el dueño elija proveedor — es EL argumento de sustitución.
3. **B1/B2/B3** (estados+permisos, tasas/convocatorias, caducidades) — abren el bloque DGT con desarrollo propio.
4. **C1/C2** (pago online + firma) — completan el portal ya existente.
5. El resto por valor/decisión del dueño.
