# Marco legal de AulaMovil (España) — estado a 7 de octubre de 2026

Qué normas afectan a AulaMovil, qué cubre ya el programa y qué tiene que hacer cada parte. No sustituye a un abogado: conviene que uno revise los textos (sobre todo la limitación de responsabilidad y el contrato de encargo) antes de crecer.

Textos públicos (se generan con `node scripts/paginas-legales.js`): https://aulamovil.vercel.app/legal/ — aviso legal, privacidad, cookies, condiciones, contrato de encargo del tratamiento e información para alumnos. Versión `2026-10-07` (constante `VERSION_LEGAL` en el script y en `renderer/legal.js`: al cambiarla, la app vuelve a pedir que se acepten).

Titular: Daniel Alexis Pérez Nicolás, NIF 76735508X, Rúa Vicente Risco 1, 1.º B, 32630 Xinzo de Limia (Ourense) · pzdani04@gmail.com.

## 1. Quién es quién con los datos

| Datos | Responsable | AulaMovil |
|---|---|---|
| Alumnos, tutores, profesores, empleados, interesados que mete cada autoescuela | La autoescuela | **Encargado del tratamiento** (art. 28 RGPD). Contrato de encargo aceptado en la app |
| Cuentas de las autoescuelas, facturación del servicio, soporte, registros técnicos | Daniel (titular) | Responsable |

Subencargados: Supabase (base de datos y login, **Irlanda**) y Vercel (web y funciones, **Dublín** desde esta versión: antes corrían en Washington). Ambos con cláusulas contractuales tipo; Vercel además en el Marco de Privacidad UE-EE. UU.

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
