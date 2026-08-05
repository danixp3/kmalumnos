# Inventario exhaustivo de funcionalidades estándar de un software de gestión de autoescuelas y análisis de carencias de tu producto

## TL;DR
- Un software de gestión de autoescuelas "completo" para el mercado español gira en torno a 12 áreas funcionales. Tu producto ya cubre con solvencia el núcleo operativo (alumnos, prácticas con kilómetros, agenda, cobros, multi-sede, sincronización nube), pero le faltan bloques que la práctica totalidad de competidores ya considera básicos: **facturación con VeriFactu, impresos oficiales DGT, control/compra de tasas, integración AUES, portal/app del alumno con reserva y pago online, firma digital, comunicaciones automáticas (SMS/email/WhatsApp) y control horario de jornada**.
- Tres carencias son de máxima prioridad porque son legales o "puerta de entrada" comercial: **(1) facturación conforme a VeriFactu, (2) el módulo DGT (impresos oficiales, libro de registro, tasas, presentación a examen y conexión AUES) y (3) el registro de jornada laboral**. Sin el bloque DGT, ninguna autoescuela española sustituye su programa actual por el tuyo.
- Para alcanzar paridad y venderte como "todo en uno", la hoja de ruta recomendada es: primero cierra el cumplimiento legal (VeriFactu + jornada + RGPD/contratos), después el bloque DGT/exámenes, después el portal del alumno con reserva y pago online + firma digital, y por último CRM de captación, informes avanzados y comunicaciones automatizadas.

## Key Findings

1. **El bloque DGT es la línea divisoria del mercado español.** Todos los programas veteranos españoles (WinAutoGest, Galibo, Ariauto, Gestionetrasa/ETRASA, Control-L) se venden sobre la base de impresos oficiales de la DGT, libro de registro de alumnos, control de tasas y convocatorias, presentación a examen y conexión AUES. Tu producto hoy no tiene nada de esto: es la carencia más grave para el mercado español.

2. **La ola nueva (Drovify, Autopractik, Practicavial, Dribo, Autius) compite en experiencia digital del alumno.** Reserva y pago online de prácticas, app del alumno, firma digital de contratos, notificaciones automáticas, chat interno, reconocimiento de DNI por foto. Aquí está el terreno donde un SaaS moderno como el tuyo puede diferenciarse, pero también donde ya te llevan ventaja.

3. **Cumplimiento legal obligatorio en España que obliga a funciones concretas:**
   - **Libro de registro de alumnos informatizado.** El RD 1295/2003 (art. 39) exige llevar "un libro de alumnos matriculados con hojas numeradas, diligenciadas y selladas por la Jefatura Provincial de Tráfico"; su informatización quedó habilitada por el RD 369/2010, de 26 de marzo, que renumeró el precepto como art. 39. Debe cumplimentarse diariamente por orden de inscripción con número/fecha de inscripción, nombre, DNI/NIE, fecha de nacimiento, permisos que posee y a los que aspira, fechas de inicio y fin de la enseñanza y resultado final.
   - **Fichas de clases teóricas y prácticas** (art. 40/42): en las prácticas se anotan fecha y hora de cada clase y, en circulación en vías abiertas, el kilometraje del vehículo al principio y al final, con firma de alumno y profesor; en teóricas figuran las faltas de asistencia.
   - **Conservación de documentación por plazos distintos:** las fichas del alumno se conservan "durante, al menos, dos años contados a partir de la fecha en que el alumno dejó de serlo" (art. 40 RD 1295/2003, redacción del RD 369/2010); el libro de registro, cuatro años desde la última inscripción; y los registros de jornada laboral, cuatro años.
   - **Facturación VeriFactu** (RD 1007/2023): registro de cada factura con huella, firma electrónica, inalterabilidad y remisión/conservación conforme a la AEAT.
   - **Registro diario de jornada** (art. 34.9 del Estatuto de los Trabajadores, introducido por el RD-ley 8/2019, de 8 de marzo, en vigor desde el 12 de mayo de 2019): "La empresa garantizará el registro diario de jornada, que deberá incluir el horario concreto de inicio y finalización de la jornada de trabajo de cada persona trabajadora"; los registros se conservan cuatro años y su incumplimiento es infracción grave (art. 7.5 LISOS).
   - **RGPD/LOPDGDD:** consentimiento explícito y verificable, cifrado, registro de actividades de tratamiento y notificación de brechas a la AEPD en 72 horas.

4. **Funciones que tienes y que son un activo:** offline-first con sincronización nube bidireccional, multi-sucursal, control de kilómetros por alumno con detección de solapamientos, dashboard con gráficos, buscador global, importación/exportación CSV, copias de seguridad y auto-actualización. Varias de estas (offline, buscador global, relleno masivo de kilómetros) son incluso superiores a parte de la competencia.

## Details — Inventario completo por áreas funcionales

Cada funcionalidad se clasifica en **[IMP]** Imprescindible (casi todos la tienen o es obligatoria legalmente), **[EST]** Estándar (la mayoría la tiene) o **[PLUS]** Deseable (aporta valor, algunos la tienen). Se marca **(TIENES)** / **(TIENES PARCIAL)** / **(FALTA)** según tu producto actual.

### a) Gestión de alumnos
- **[IMP]** Ficha completa: datos personales, DNI/NIE, fecha nacimiento, dirección, teléfono, email. **(TIENES)**
- **[IMP]** Foto del alumno y escaneo/subida de documentos (DNI, psicotécnico). **(FALTA)** — Drovify y Galibo (GaliboDroid) hacen reconocimiento del DNI por foto y autocompletan datos.
- **[IMP]** Libro de registro de alumnos matriculados informatizado (obligatorio, RD 1295/2003 art. 39). **(FALTA)** — WinAutoGest, Galibo, Practicavial y ETRASA lo ofrecen explícitamente; Ariauto documenta que "con el programa de gestión Ariauto podemos sacar el libro de registro de los alumnos de manera informatizada".
- **[IMP]** Permisos múltiples por alumno (B, A1, A2, AM, C, D, CAP, ADR...). **(FALTA/PARCIAL)**
- **[IMP]** Estados del alumno (matriculado, en teórica, apto teórico, en prácticas, presentado, apto/no apto, baja). **(TIENES PARCIAL)** — tienes estados básicos; falta el ciclo completo ligado a exámenes.
- **[EST]** Expediente/historial completo del alumno (económico + académico + prácticas en una ficha). **(TIENES PARCIAL)**
- **[IMP]** Alertas de caducidades: psicotécnico, expediente, convocatorias, plazos de examen, DNI. **(FALTA)** — WinAutoGest, Galibo, Ariauto lo destacan como función central ("el programa te avisa con tiempo").
- **[IMP]** Notas/observaciones por alumno. **(TIENES)**
- **[IMP]** Contrato de enseñanza (obligatorio, art. 42). **(FALTA)**
- **[IMP]** Consentimientos RGPD / cláusulas de protección de datos. **(FALTA)**

### b) Gestión académica teórica
- **[EST]** Aulas y horarios de clases teóricas / calendario de teóricas. **(FALTA)** — Drovify, WinAutoGest, ETRASA.
- **[EST]** Control de asistencia a clases teóricas. **(FALTA)** — Drovify y Control-L registran asistencia; el reglamento obliga a anotar faltas de asistencia (art. 40).
- **[PLUS]** Tests online tipo DGT (banco de preguntas oficiales). **(FALTA)** — Galibo/Tuautoescuela, ETRASA (novatest.es), Autius (SuperaTest 5 niveles), Dribo, Fahrschulcard (DE). Muchos lo integran vía enlace a plataforma externa (Drovify).
- **[PLUS]** Estadísticas de tests del alumno / seguimiento del progreso teórico. **(FALTA)**
- **[PLUS]** Simulacros de examen. **(FALTA)**
- **[PLUS]** Contenidos/temario digital (manual, vídeos, aula virtual online). **(FALTA)** — Drovify permite subir manual, presentaciones y videoclases; Galibo (Aula21); Dribo.
- **[PLUS]** Idiomas del temario/test. **(FALTA)** — Fahrschulcard ofrece 12+ idiomas.

### c) Gestión de prácticas
- **[IMP]** Agenda/calendario de profesores y vehículos (con detección de solapamientos). **(TIENES PARCIAL)** — tienes registro con detección de solapamientos, pero no una agenda visual drag & drop por profesor/vehículo como Drovify o Autopractik.
- **[IMP]** Ficha de clases prácticas con kilometraje inicial/final y firma (obligatorio art. 40). **(TIENES PARCIAL)** — registras kilómetros por alumno; falta la ficha oficial firmable.
- **[IMP]** Control de clases dadas/pendientes por alumno. **(TIENES PARCIAL)**
- **[EST]** Bonos/packs de prácticas (vales con duración). **(FALTA)** — WinAutoGest (vales), Autopractik, Drovify (packs).
- **[EST]** Reserva de clases desde recepción. **(TIENES PARCIAL)**
- **[PLUS→EST]** Reserva self-service del alumno (móvil). **(FALTA)** — Drovify, Autopractik, Dribo, Autius. Se está convirtiendo en estándar de mercado.
- **[EST]** Cancelaciones y política de cancelación (con/sin devolución de saldo). **(FALTA)** — Drovify y Autopractik lo gestionan.
- **[EST]** Recordatorios automáticos de clase. **(FALTA)**
- **[PLUS]** Puntos de encuentro/recogida. **(FALTA)** — Drovify, Dribo.
- **[PLUS]** Lista de espera. **(FALTA)**
- **[PLUS]** Valoración/evaluación de la práctica por el profesor. **(FALTA)** — Autopractik, Control-L, Drovify.

### d) Exámenes y DGT
- **[IMP]** Impresos y modelos oficiales DGT (talón foto, solicitud pruebas de aptitud, traslado de expediente, ficha teórica/práctica, autorización gestión de expedientes). **(FALTA)** — núcleo de WinAutoGest, Ariauto, Galibo, ETRASA, Control-L, adaptados por Jefatura Provincial.
- **[IMP]** Gestión de convocatorias y listas de presentación a examen (teórico, maniobras, circulación). **(FALTA)**
- **[IMP]** Control de tasas DGT por alumno (compra, caducidad, segundas convocatorias). **(FALTA)** — Galibo permite comprar tasas; todos controlan tasas.
- **[IMP/EST]** Conexión AUES (tramitación telemática de pruebas de aptitud con la DGT). **(FALTA)** — Galibo, WinAutoGest, Practicavial (en desarrollo), Dribo (vía API). Requiere certificado electrónico y desarrollo contra el servicio web de la DGT.
- **[EST]** Resultados de exámenes (apto/no apto/aplazado/no presentado, fallos cometidos). **(FALTA)**
- **[EST]** Estadísticas de aprobados (por autoescuela y por profesor). **(FALTA)** — WinAutoGest.

### e) Facturación y cobros
- **[IMP]** Facturación conforme a **VeriFactu** (RD 1007/2023). **(FALTA)** — Drovify y Galibo ya lo anuncian como preparados. Obligatorio próximamente (ver Caveats).
- **[IMP]** Facturas, facturas rectificativas, series por sección. **(FALTA/PARCIAL)**
- **[IMP]** Recibos y control de cobros por alumno. **(TIENES)**
- **[IMP]** Pagos parciales/a plazos y seguimiento de deuda/morosidad. **(TIENES PARCIAL)** — controlas cobros; falta gestión formal de morosidad.
- **[EST]** Formas de pago (efectivo, tarjeta, transferencia, Bizum, pasarela online). **(FALTA/PARCIAL)**
- **[EST]** Pasarela de pago online (alumno paga desde app). **(FALTA)** — Drovify, Autopractik.
- **[IMP]** Arqueo/control de caja diario por empleado y por sede. **(FALTA)** — WinAutoGest, Galibo, ETRASA, Control-L.
- **[EST]** Cargos automáticos (matrícula, tasas, expediente). **(FALTA)** — Drovify, Galibo.
- **[EST]** Tarifas configurables por permiso/pack; descuentos y promociones. **(TIENES PARCIAL)** — tienes tarifas; falta descuentos/promos.
- **[PLUS]** Remesas bancarias SEPA. **(FALTA)**
- **[PLUS]** Exportación contable (A3, Contaplus) e informes de IVA / libro de ventas. **(FALTA)** — WinAutoGest exporta Excel del libro de ventas para el gestor.

### f) Gestión de personal
- **[IMP]** Registro diario de jornada laboral (obligatorio, art. 34.9 ET). **(FALTA)** — Galibo (JornadaBot), Drovify (control horario integrado), Control-L.
- **[EST]** Profesores: alta, horarios, tarifas/sueldos. **(TIENES PARCIAL)**
- **[EST]** Caducidad del certificado de aptitud del profesor. **(FALTA)**
- **[PLUS]** Nóminas/horas trabajadas, comisiones/honorarios automáticos. **(FALTA)** — Control-L calcula honorarios al registrar la clase; Teachworks calcula la nómina automáticamente.
- **[EST]** Directores y roles diferenciados. **(TIENES PARCIAL)**

### g) Gestión de flota
- **[IMP]** Vehículos: alta, asignación vehículo-profesor. **(TIENES)**
- **[EST]** Caducidades del vehículo: ITV, seguro, mantenimiento, revisiones (con alertas). **(FALTA)** — WinAutoGest avisa de caducidades de vehículos.
- **[EST]** Kilometraje del vehículo. **(TIENES PARCIAL)** — llevas km por alumno/práctica; falta km acumulado del vehículo.
- **[PLUS]** Consumo de combustible, incidencias/partes. **(FALTA)**
- **[PLUS]** GPS/telemetría de las clases. **(FALTA)** — Fahrschulcockpit (DE, KI-Pilot graba por GPS con resumen por IA), Ariauto (en desarrollo). Nicho.

### h) Comunicaciones
- **[IMP]** Envío de SMS a alumnos. **(FALTA)** — Ariauto, WinAutoGest.
- **[IMP]** Envío de email. **(FALTA)**
- **[EST]** WhatsApp integrado. **(FALTA)** — Control-L (WhatsApp Web).
- **[EST]** Notificaciones push (app). **(TIENES PARCIAL)** — tienes web móvil; falta app con push.
- **[EST]** Avisos automáticos: recordatorio de clase, resultado de examen, pagos pendientes, caducidades. **(FALTA)** — Drovify los configura automáticamente.
- **[PLUS]** Aviso de cumpleaños. **(FALTA)**
- **[PLUS]** Comunicación masiva/campañas. **(FALTA)**
- **[PLUS]** Chat interno alumno-profesor-autoescuela. **(FALTA)** — Drovify.

### i) CRM y ventas
- **[PLUS]** Gestión de interesados/leads (personas que llaman y no compran). **(FALTA)** — Drive Scout guarda leads; herramientas tipo Clientify.
- **[PLUS]** Seguimiento comercial y conversión. **(FALTA)**
- **[PLUS]** Presupuestos. **(FALTA)**
- **[PLUS]** Origen del alumno (cómo nos conoció). **(FALTA)**
- **[PLUS]** Campañas de captación / marketing. **(FALTA)**

### j) Informes y estadísticas
- **[EST]** Dashboard con métricas del negocio. **(TIENES)** — 5 gráficos personalizables.
- **[EST]** Informes de ingresos/gastos. **(TIENES PARCIAL)**
- **[EST]** Alumnos por estado, altas, aptos. **(TIENES PARCIAL)**
- **[EST]** Ratios de aprobados. **(FALTA)**
- **[EST]** Ocupación de profesores y vehículos. **(FALTA/PARCIAL)**
- **[EST]** Comparativas entre sedes. **(TIENES PARCIAL)**
- **[IMP]** Exportación PDF/Excel. **(TIENES PARCIAL)** — exportas CSV; falta PDF y Excel formateado.

### k) Administración del sistema
- **[IMP]** Usuarios y roles/permisos granulares. **(TIENES PARCIAL)** — roles jefe-empleado; falta granularidad por módulo/sección como WinAutoGest (ver/editar por sección).
- **[IMP]** Multi-sede/multi-empresa. **(TIENES)**
- **[EST]** Auditoría/registro de actividad de usuarios. **(TIENES PARCIAL)** — tienes logs; conviene formalizarlo como auditoría.
- **[IMP]** Copias de seguridad. **(TIENES)**
- **[IMP]** RGPD: cifrado, gestión de consentimientos, derechos ARCO, notificación de brechas. **(TIENES PARCIAL)** — usas Supabase (cifrado); falta gestión formal de consentimientos y ARCO.
- **[EST]** Personalización: logo, plantillas de documentos/contratos. **(TIENES PARCIAL)** — tienes temas visuales; falta plantillas de documentos.

### l) Apps y portales
- **[EST→IMP]** Portal/app del alumno (ver expediente, reservar, pagar, tests, notificaciones). **(FALTA)** — Drovify, Autopractik, Control-L, Dribo, Autius. Se ha vuelto casi imprescindible en la nueva generación.
- **[EST]** App del profesor (agenda del día, marcar clases realizadas, firmar, valorar). **(TIENES PARCIAL)** — tienes web móvil con PIN para registrar prácticas; falta agenda visual y firma.
- **[EST]** Firma digital (contratos, ficha de prácticas). **(FALTA)** — Drovify, Control-L, Autopractik.
- **[PLUS]** Portal para padres/tutores. **(FALTA)** — común en producto internacional (Drive Scout, Total Drive).

### Referencias internacionales (funciones que amplían el estándar)
- **Teachworks (Canadá):** arquitectura modular con más de 60 complementos; reserva desde la web, recordatorios SMS, pagos con Stripe, cálculo automático de nómina, gestor de vehículos, facturación automática (Invoice Autopilot).
- **Drive Scout (EEUU):** reserva por alumnos y padres, sistema de zonificación automática de profesores, "report card" con semáforo verde/amarillo/rojo del progreso, automatización de nómina, plantillas de web, registros para auditorías (DMV).
- **Total Drive / BookingTimes (Reino Unido):** diario del instructor, bonos regalo (gift vouchers), recordatorios SMS/email, app gratis para alumno y padres, seguimiento de km para impuestos, marketing por SMS/email.
- **Fahrschulcockpit (Alemania):** app del alumno todo-en-uno (drive.buzz), rutas de aprendizaje con gamificación, aula de teoría online, pagos LivePay con semáforo, grabación GPS de las clases con resumen por IA.

## Lista clara de carencias priorizadas (resumen)

**Carencias legales/bloqueantes (implementar primero):** VeriFactu; registro de jornada laboral; contrato de enseñanza + consentimientos RGPD; libro de registro informatizado; ficha de clases prácticas/teóricas firmable con km.

**Carencias de paridad con veteranos españoles:** impresos oficiales DGT; control/compra de tasas; convocatorias y listas de examen; conexión AUES; resultados y estadísticas de aprobados; arqueo de caja; alertas de caducidades (incl. ITV/seguro/psicotécnico).

**Carencias de paridad con la nueva generación:** portal/app del alumno con reserva y pago online; pasarela de pago + Bizum; firma digital; agenda visual con bonos/packs y política de cancelación; app del profesor con firma; comunicaciones automáticas (SMS/email/WhatsApp/push).

**Carencias de valor añadido (diferenciación):** CRM de captación (leads, origen, presupuestos); informes avanzados con exportación PDF/Excel; tests DGT/aula virtual; remesas SEPA y exportación contable; portal de padres.

## Recommendations — Hoja de ruta priorizada de producto

**FASE 0 — Cumplimiento legal (bloqueante; sin esto no puedes vender en España).**
1. **Facturación VeriFactu** (RD 1007/2023): facturas con huella, series, rectificativas, código QR y remisión/conservación conforme a la AEAT. Es el requisito que hará que las autoescuelas cambien de programa.
2. **Registro de jornada laboral** (art. 34.9 ET): fichaje entrada/salida por empleado y sede, registro inalterable con historial de correcciones, conservación 4 años, informe para la Inspección.
3. **RGPD + contrato de enseñanza + consentimientos**: plantilla de contrato firmable, cláusulas de consentimiento, gestión de derechos ARCO, registro de actividades de tratamiento.
4. **Libro de registro de alumnos informatizado** (art. 39) y **fichas de clases teóricas/prácticas** con km y firma (art. 40).

*Umbral que cambia la prioridad:* aunque el calendario de VeriFactu se ha aplazado (ver Caveats), sigue siendo prioritario porque es el argumento comercial de sustitución del programa actual del cliente.

**FASE 1 — Módulo DGT y exámenes (paridad con los veteranos españoles).**
5. Impresos oficiales DGT por Jefatura Provincial (talón foto, solicitud de pruebas de aptitud, traslado de expediente, ficha teórica/práctica, autorización de gestión de expedientes).
6. Control de tasas por alumno (compra, caducidad, 2ª convocatoria) y gestión de convocatorias/listas de presentación a examen.
7. Alertas de caducidades (psicotécnico, expediente, convocatorias, ITV/seguro del vehículo).
8. Resultados de examen y estadísticas de aprobados por profesor/sede.
9. **Conexión AUES** (integración telemática con la DGT). Compleja pero muy diferenciadora.

**FASE 2 — Experiencia digital del alumno (paridad con la nueva generación y diferenciación).**
10. Portal/app del alumno: ver expediente, reservar prácticas, pagar online (pasarela + Bizum), recibir notificaciones.
11. Agenda visual drag & drop por profesor/vehículo con bonos/packs, política de cancelación y puntos de recogida.
12. Firma digital de contratos y ficha de prácticas.
13. App del profesor con agenda del día, marcar clase realizada, valorar y firmar.
14. Comunicaciones automáticas: SMS, email, WhatsApp y push (recordatorio de clase, resultado, pagos, caducidades).

**FASE 3 — Gestión económica avanzada y crecimiento.**
15. Arqueo de caja diario por empleado/sede, cargos automáticos, formas de pago múltiples, morosidad, remesas SEPA, exportación contable e IVA.
16. CRM de captación (leads, origen del alumno, presupuestos, conversión, campañas).
17. Informes avanzados (ratios de aprobados, ocupación, comparativas) con exportación PDF/Excel.
18. Tests DGT integrados / aula virtual (opcional; puede resolverse con integración de terceros como hacen varios competidores).

**Benchmarks que deberían guiar decisiones:** prioriza según cuántos competidores directos tienen cada función y si es legal. Todo lo marcado [IMP] debe estar antes del lanzamiento comercial serio; lo [EST] en los 6-12 meses siguientes; lo [PLUS] como diferenciación.

## Checklist maestro final (hoja de ruta de paridad funcional)

| Área | Función | Nivel | ¿Lo tienes? |
|---|---|---|---|
| Alumnos | Ficha completa (datos, DNI/NIE) | IMP | ✅ |
| Alumnos | Foto + escaneo/reconocimiento de documentos | IMP | ❌ |
| Alumnos | Libro de registro informatizado (art. 39) | IMP (legal) | ❌ |
| Alumnos | Permisos múltiples (B, A, AM, C, D, CAP, ADR) | IMP | ⚠️ |
| Alumnos | Ciclo completo de estados ligado a exámenes | IMP | ⚠️ |
| Alumnos | Alertas de caducidades | IMP | ❌ |
| Alumnos | Contrato de enseñanza (art. 42) | IMP (legal) | ❌ |
| Alumnos | Consentimientos RGPD | IMP (legal) | ❌ |
| Teórica | Calendario de aulas/teóricas | EST | ❌ |
| Teórica | Control de asistencia (art. 40) | EST (legal) | ❌ |
| Teórica | Tests DGT + progreso + simulacros | PLUS | ❌ |
| Teórica | Temario/aula virtual + idiomas | PLUS | ❌ |
| Prácticas | Agenda visual por profesor/vehículo | IMP | ⚠️ |
| Prácticas | Ficha práctica firmable con km (art. 40) | IMP (legal) | ⚠️ |
| Prácticas | Bonos/packs de clases | EST | ❌ |
| Prácticas | Reserva self-service del alumno | EST | ❌ |
| Prácticas | Política de cancelación | EST | ❌ |
| Prácticas | Recordatorios de clase | EST | ❌ |
| Prácticas | Puntos de recogida / lista de espera / valoración | PLUS | ❌ |
| DGT | Impresos oficiales por Jefatura | IMP | ❌ |
| DGT | Convocatorias y listas de examen | IMP | ❌ |
| DGT | Control/compra de tasas | IMP | ❌ |
| DGT | Conexión AUES | IMP/EST | ❌ |
| DGT | Resultados + estadísticas de aprobados | EST | ❌ |
| Facturación | VeriFactu | IMP (legal) | ❌ |
| Facturación | Facturas/rectificativas/series | IMP | ⚠️ |
| Facturación | Recibos y cobros por alumno | IMP | ✅ |
| Facturación | Pagos a plazos y morosidad | IMP | ⚠️ |
| Facturación | Formas de pago + pasarela online/Bizum | EST | ❌ |
| Facturación | Arqueo de caja por empleado/sede | IMP | ❌ |
| Facturación | Cargos automáticos | EST | ❌ |
| Facturación | Tarifas + descuentos/promos | EST | ⚠️ |
| Facturación | SEPA + exportación contable + IVA | PLUS | ❌ |
| Personal | Registro de jornada (art. 34.9 ET) | IMP (legal) | ❌ |
| Personal | Profesores: horarios/tarifas | EST | ⚠️ |
| Personal | Caducidad certificado de aptitud | EST | ❌ |
| Personal | Nóminas/comisiones automáticas | PLUS | ❌ |
| Flota | Vehículos + asignación profesor | IMP | ✅ |
| Flota | Caducidades ITV/seguro/mantenimiento | EST | ❌ |
| Flota | Km del vehículo | EST | ⚠️ |
| Flota | Combustible/incidencias/GPS | PLUS | ❌ |
| Comunicaciones | SMS / email | IMP | ❌ |
| Comunicaciones | WhatsApp | EST | ❌ |
| Comunicaciones | Push (app) | EST | ⚠️ |
| Comunicaciones | Avisos automáticos | EST | ❌ |
| Comunicaciones | Campañas / chat interno / cumpleaños | PLUS | ❌ |
| CRM | Leads, origen, presupuestos, conversión | PLUS | ❌ |
| Informes | Dashboard con gráficos | EST | ✅ |
| Informes | Ingresos/gastos, alumnos por estado | EST | ⚠️ |
| Informes | Ratios de aprobados, ocupación, comparativas | EST | ⚠️ |
| Informes | Exportación PDF/Excel | IMP | ⚠️ |
| Sistema | Roles/permisos granulares | IMP | ⚠️ |
| Sistema | Multi-sede/multi-empresa | IMP | ✅ |
| Sistema | Auditoría de actividad | EST | ⚠️ |
| Sistema | Copias de seguridad | IMP | ✅ |
| Sistema | RGPD (cifrado, ARCO, brechas) | IMP (legal) | ⚠️ |
| Sistema | Personalización logo/plantillas | EST | ⚠️ |
| Apps | Portal/app del alumno | EST→IMP | ❌ |
| Apps | App del profesor con firma | EST | ⚠️ |
| Apps | Firma digital contratos/fichas | EST | ❌ |
| Apps | Portal de padres | PLUS | ❌ |

(✅ = lo tienes · ⚠️ = parcial · ❌ = falta)

## Caveats
- La clasificación IMP/EST/PLUS es un juicio basado en las páginas de características públicas de los competidores y en la normativa; algunos programas pueden ofrecer funciones no publicitadas en su web.
- **VeriFactu ha sufrido varios aplazamientos.** El más reciente lo fija el Real Decreto-ley 15/2025, de 2 de diciembre (BOE de 3 de diciembre de 2025), que modifica la disposición final cuarta del RD 1007/2023: para contribuyentes del Impuesto sobre Sociedades el plazo pasa del 1 de enero de 2026 al **1 de enero de 2027**, y para el resto de obligados (autónomos en IRPF) del 1 de julio de 2026 al **1 de julio de 2027**. Los fabricantes/comercializadores de software siguen obligados a tener sus productos adaptados desde el 29 de julio de 2025. Conviene verificar el calendario vigente antes de planificar.
- "AUES" requiere certificado electrónico admitido por @firma y desarrollo contra el servicio web de la DGT; su disponibilidad y requisitos varían por Jefatura Provincial.
- El alcance real de las funciones de cada competidor puede haber cambiado; las webs se consultaron en agosto de 2026.
- No se pudo acceder a la página de características de Practicavial directamente; sus funciones se han inferido de fuentes secundarias (comparativas del sector) y de su blog oficial.
- Los recuentos de complementos y de usuarios de algunos productos internacionales (p. ej. "60+/70+ add-ons" de Teachworks, cifras de usuarios de Total Drive) son cifras de marketing y varían entre fuentes.