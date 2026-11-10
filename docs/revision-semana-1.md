# Revisión de la semana 1 — piloto Etiopía

Fecha: 10 de noviembre de 2026. Código revisado: rama `main`, commit `62fd428`.

## Dictamen y alcance

**La semana 1 todavía no está implementada por completo, incluso excluyendo la migración a Supabase.** Hay una base de semana 0: login por firma con Cavos o wallet propia, sesiones, administración de roles, precarga de caficultores y contrato v0. Faltan el despliegue y fondeo automático de Cavos, el faucet previsto, la wallet de caficultores y la integración con VoiceLedger. También hay fallos de seguridad y de despliegue que conviene corregir antes de abrir staging.

Esta revisión propone cambios; no modifica la implementación, la base, los contratos ni los estados de Notion. No se ejecutaron migraciones, pagos, transacciones on-chain ni cambios en cuentas reales. Se añadió únicamente este informe. La semana 1 está prevista para el 16–20 de noviembre: este dictamen describe cobertura del código, no un incumplimiento de fechas.

## Fuentes y decisiones vigentes

- [SOW original de Instawards](https://docs.google.com/document/d/14SzCxn43ef255CJ6d7dBl9W0rHzhyKeOvIgeQTr401c/edit): leído directamente desde el documento enlazado en Notion. Su semana 1 requiere login por email y una dirección Stellar creada y fondeada automáticamente. La evidencia incluye staging y repositorio.
- [Proyecto en Notion](https://app.notion.com/p/410fc647d56d804facf0f680b5490a5c): contexto y plan largo. Conserva la versión anterior de bot propio y voz fuera del sprint.
- [Tareas del sprint](https://app.notion.com/p/4f7ba79d521b4ad28c93089d9f03e91c): consultadas las tareas de semanas 0 y 1, con sus descripciones. Reflejan explícitamente el cambio del 10 de noviembre a bot operado por VoiceLedger. Todas las diez tareas clasificadas como semana 1 figuran pendientes, lo que coincide con las brechas principales del código.
- [Respuestas de la semana 1](https://app.notion.com/p/414fc647d56d8125a4e7fbf819c0ff5d): hosting previsto en Railway, Vercel y Supabase; señala que Cavos puede crear wallets sin un pago. Es una respuesta de coordinación, no una prueba de que ese flujo esté implementado.
- [Formulario de datos EUDR](https://docs.google.com/document/d/1ptJ3NRANBaxvXA-h-v2kMxYjaFP_4FCOMKGQSnN4t9k/edit): leído como contexto de privacidad, ubicación y separación de datos. No se evalúa cumplimiento jurídico.
- [Reunión del proyecto](https://app.notion.com/p/40efc647d56d80899261f8e7abf7ce9a): contexto histórico de participantes y operación del piloto.
- `docs/plan-implementacion.md`, en especial §2.3, §2.4 y semana 1: refleja VoiceLedger y coincide con las tareas actualizadas.

Se usa el SOW para el entregable comprometido y las tareas actualizadas más el plan local para el mecanismo de integración. No se exige construir un bot propio. El documento de flujo de Karla mencionado por el plan no quedó accesible como fuente independiente en esta revisión; no se presume haberlo leído.

## Matriz de cumplimiento

| Requisito | Estado en código | Evidencia y brecha |
|---|---|---|
| Login Cavos por email y Telegram | Implementación base presente | `webapp/lib/auth/cavos.ts`, `AppProviders.tsx`, `useCavosLogin.ts` y verificación en backend. La tarea de prueba con App ID real está hecha en Notion; no se repitió una autenticación real desde teléfono. |
| Crear la cuenta Cavos en el primer login | Falta | `useCavosLogin.ts:143` permite completar el login con `isUndeployed`; no despliega ni fondea. `auth.ts:144` excluye Cavos de la creación de cuentas. |
| Cuenta faucet y recarga con Friendbot | Falta el flujo previsto | `scripts/setup-testnet.sh` fondea al admin; no prepara un faucet dedicado con su servicio de recarga. |
| `POST /wallet/fund`, una carga por usuario | Falta | No hay ruta de wallet montada en `backend/src/index.ts`; `User` no tiene `fundedAt` ni `fundTx`. Es una brecha del modelo y del servicio, independiente de dónde se aloje Postgres. |
| Fondeo de wallet propia con Friendbot | Distinto del diseño | `OnChainAccountsService.ensureAccount` crea cuentas enviando 1 XLM desde el admin. No llama a Friendbot directamente. |
| Dirección, saldo y enlaces en inicio/perfil | Parcial | Ambas pantallas muestran dirección y enlace de cuenta a Stellar Expert. No muestran saldo XLM ni transacción de fondeo. |
| Wallet `cofi-farmer-agent` separada | Falta | Los servicios de firma usan `STELLAR_ADMIN_SECRET`. No hay configuración ni servicio dedicado al agente. |
| Endpoint VoiceLedger: HMAC, timestamp, `event_id` y almacenamiento | Falta | No hay rutas, esquemas, verificador HMAC ni modelo de eventos de integración. El bot viejo no sustituye este requisito. |
| `farmer.linked` registra on-chain y devuelve referencia/tx | Falta | `linkTelegram` vincula solamente en Postgres. El cliente y el contrato v0 aún requieren una dirección individual y firma admin para `register_farmer`. |
| Staging y evidencia de entregable 1 | No verificables como completados | Notion los mantiene pendientes; no se encontró URL de staging en las fuentes revisadas. Hay bloqueos de Docker y cookies descritos abajo. No se inspeccionaron los paneles de hosting. |
| Resolver preguntas de semana 2 | Coordinación pendiente | Figura como tarea de semana 1; conversión de fachasa y campos mínimos no se verifican con compilación. No se cuenta como código ausente. |

El contrato v1 completo, perfiles, entregas, documentos, CSV y el simulador integral corresponden a semanas posteriores. No se penaliza aquí su ausencia, excepto la adaptación mínima necesaria para registrar al caficultor con el agente en semana 1.

## Hallazgos prioritarios

P1: corregir antes de publicar staging o habilitar el flujo afectado. P2: corregir durante el cierre de semana 1 o antes de reutilizar el componente indicado. Las condiciones de cada riesgo se indican expresamente.

### R1 · P1 · Secretos JWT públicos como alternativa silenciosa

**Código:** `backend/src/services/app/JwtService.ts:10–14`; `backend/.env.example:51–52`.

Si faltan los secretos, el servicio usa cadenas conocidas del repositorio. Copiar el ejemplo sin cambiarlas produce el mismo resultado. Un atacante puede firmar un access token con `is_admin: true` y cualquier `userId`; `authenticate` y `requireAdmin` lo aceptan sin comprobar que el usuario exista. Las rutas administrativas pueden entonces invocar al backend que posee la clave admin del contrato.

**Comprobado:** en un proceso aislado sin secretos configurados se creó un token sintético con el secreto público y pasó ambos middleware. No se comprobó ni se afirma que el despliegue real use esos secretos.

**Cambio:** validar configuración al arrancar y rechazar valores vacíos, de ejemplo o débiles. Generar secretos aleatorios distintos para access y refresh; quitar la alternativa pública también en desarrollo compartido. Añadir prueba de arranque que debe fallar sin configuración válida.

### R2 · P1 · Revocación de sesiones sin comprobar correctamente al propietario

**Código:** `backend/src/routes/auth.ts:88–96`; `backend/src/services/db/dbSessions.ts:43`.

La ruta recibe un UUID de sesión, pero lo busca con `getSessionByRefreshToken(sessionId)`. Al no ser un refresh token, devuelve `null`; el control de propietario se omite y luego se borra por el UUID recibido. Un usuario autenticado que conozca el UUID de una sesión ajena puede revocarla. El UUID no es predecible, pero no debe actuar como autorización.

**Comprobado:** se recorrió la autenticación, validación y handler reales con Prisma simulado. Un usuario normal obtuvo 200 y se llamó al borrado de la sesión ajena.

**Cambio:** buscar/revocar por `{ id: sessionId, userId: req.user.userId }` y ejecutar el borrado de sesión y refresh token en una transacción. Devolver 404/403 sin modificar filas ajenas. Probar sesión propia, ajena e inexistente.

### R3 · P1 · Revocar sesión o quitar admin deja vigente el acceso administrativo

**Código:** `backend/src/middleware/auth.ts:37–51,99–111`; `backend/src/services/app/JwtService.ts:20–29`; `backend/src/services/app/UsersService.ts:103–110`.

Los privilegios se toman exclusivamente del access token. Este no incluye la sesión y el middleware no consulta si sigue activa, si el usuario existe ni si conserva permisos. Cerrar/revocar sesiones o quitar `isAdmin` no invalida los tokens emitidos: conservan acceso hasta vencer, 10 minutos por defecto. Un antiguo admin puede seguir cambiando usuarios y solicitar asignaciones de roles firmadas por el backend.

**Comprobado:** un token sintético de admin siguió pasando autorización sin efectuar una consulta de sesión/usuario, aunque se preparó un estado revocado en el doble de base.

**Cambio:** incluir `sessionId` y validar sesión activa y usuario actual; como mínimo, resolver permisos actuales en cada acción administrativa. Una versión de autorización o sesión permite invalidación inmediata sin depender solo del vencimiento. Probar logout, revocación, baja de usuario y retiro de admin.

### R4 · P1 · El alta pública gasta el saldo del admin sin límite de aplicación

**Código:** `backend/src/routes/auth.ts:137–147`; `backend/src/services/onchain/OnChainAccountsService.ts:33–51`; `backend/src/lib/StellarContracts/StellarClient.ts:21`.

El login con cualquier par de claves válido puede crear una cuenta usando 1 XLM del admin. No hay restricción a participantes del piloto, presupuesto ni límite de solicitudes en el código revisado. Obtener un nonce y firmarlo prueba posesión de una clave que cualquiera puede generar; no limita el número de altas. La red por defecto es mainnet si se omite `STELLAR_NETWORK`.

En testnet puede agotar temporalmente al patrocinador e impedir operaciones; si se configura una clave financiada en mainnet, puede gastar fondos reales. No se enviaron transacciones para probarlo ni se afirma una pérdida existente.

**Cambio:** para este piloto, exigir explícitamente testnet, usar Friendbot donde corresponde y separar admin/faucet/agente. Limitar frecuencia y presupuesto del faucet. Persistir el estado de fondeo y reservarlo atómicamente antes de enviar; guardar el hash para reconciliar reintentos y timeouts. Una marca en memoria no cubre varios procesos ni reinicios.

### R5 · P1 · El Dockerfile no produce un backend desplegable

**Código:** `backend/dockerfile:16–21,37–48`; `backend/package.json:16`; `backend/src/utils/notifications.ts:1–4`.

El builder copia `src` pero omite `locales`, aunque los JSON se importan desde esa carpeta. El build falla. Además, la etapa final ejecuta `npm ci` y el `postinstall: prisma generate` antes de copiar el schema. Copiar solo `node_modules/@prisma` no equivale a copiar el cliente generado de `node_modules/.prisma`.

**Comprobado:** se reprodujo en `/tmp` la estructura de fuentes copiada por el builder, usando las dependencias ya instaladas: TypeScript falla con cuatro TS2307 por los JSON ausentes. No se ejecutó una construcción completa con Docker; los problemas adicionales de instalación/generación se identificaron por lectura del orden de las instrucciones.

**Cambio:** copiar schema antes de instalar, usar `npm ci`, copiar las traducciones para compilar y al runtime (las referencias compiladas siguen apuntando a `/app/locales`). Generar Prisma con schema presente en la imagen final o copiar correctamente sus artefactos compatibles. Verificar build de imagen y arranque con healthcheck antes de staging.

### R6 · P2 · Cookies incompatibles con los dominios predeterminados de staging

**Código:** `backend/src/utils/authUtils.ts:8–24`; `webapp/middleware.ts:67`; `webapp/next.config.js:17–26`.

`cookieSameSite` siempre es `lax`, aunque se active `ALLOW_CROSS_DOMAIN_COOKIES`. En producción, `Domain` siempre es `.cofiblocks.com`. Una API alojada en un dominio predeterminado de Railway no puede establecer cookies para ese dominio; con frontend y API en sitios distintos, `lax` tampoco sirve para las llamadas fetch autenticadas. El middleware de Next necesita recibir la cookie en el dominio del frontend.

**Comprobado:** la función emite `SameSite=lax` aun con configuración cross-domain. El efecto en navegador depende de los dominios elegidos; no se ejecutó un login real de staging. Las restricciones de dominio y SameSite están documentadas en [Set-Cookie, MDN](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Set-Cookie).

**Cambio:** preferir `/api` mediante proxy del mismo origen también en staging/producción y cookies host-only sin dominio fijo. Otra opción es configurar subdominios propios compatibles y comprobar API y middleware juntos. No basta con cambiar a `SameSite=None`: hay que resolver también el dominio del frontend, CORS y protección de solicitudes mutables. Sustituir la autorización genérica de `*.vercel.app` en desarrollo por orígenes explícitos antes de compartir un entorno con datos reales.

### R7 · P2 · La renovación de sesión utiliza una URL diferente a las otras solicitudes

**Código:** `webapp/lib/api/api.ts:23,50–62`; `webapp/next.config.js:25–26`; `webapp/.env.example:2`.

Con el ejemplo `NEXT_PUBLIC_API_URL=http://localhost:4000`, las solicitudes normales van a `/api/...` mediante proxy, pero refresh llama a `http://localhost:4000/auth/refresh`, sin `/api`. El backend solo monta `/api/auth/refresh`. Al vencer el access token, la renovación falla aunque el refresh token sea válido. Añadir `/api` a la variable tampoco unifica el diseño: el rewrite concatena otro `/api`.

**Comprobado:** ejecutando el cliente API real transpilado con fetch simulado, se observaron `/api/auth/me` y después `http://localhost:4000/auth/refresh`.

**Cambio:** centralizar una sola resolución de URL para todas las rutas, incluido refresh. Definir si la variable representa el origen o la base API y aplicar esa definición también al rewrite. Probar una respuesta 401 seguida de refresh y reintento exitosos.

### R8 · P2 · La clave principal evita la comprobación de firmantes de Cavos

**Código:** `backend/src/utils/stellarSignature.ts:126–139`; `backend/src/services/app/UsersService.ts:32–46`.

`signer === address` permite entrar sin consultar el estado de la cuenta. Si una cuenta existente ha deshabilitado la clave principal o elevado sus umbrales, una firma de esa clave sigue obteniendo acceso web. El camino de wallet propia también verifica solo criptografía local. Esto importa en recuperación de dispositivos y multisig; no significa que cualquier tercero pueda falsificar una firma.

**Comprobado:** se firmó un mensaje sintético válido con la clave principal y se preparó una respuesta de cuenta con peso 0 y umbral 2. La verificación aceptó sin consultar esa respuesta. La posibilidad de reducir el peso de la clave principal está contemplada en [SEP-10, Stellar](https://github.com/stellar/stellar-protocol/blob/master/ecosystem/sep-0010.md).

**Cambio:** para cuentas existentes, comprobar firmantes y la política de umbral también cuando se usa la clave principal, con independencia del proveedor indicado por el cliente. Permitir el caso no desplegado solo con una política explícita de primer alta y sin habilitar alternativas que eludan la recuperación posterior. No es necesario migrar todo el login a SEP-10 para corregir este control.

### R9 · P2 · Borrar un usuario no retira su rol del contrato

**Código:** `backend/src/services/app/UsersService.ts:107–110,183–198`; `backend/src/routes/users.ts:65`.

`deleteUser` borra datos y sesiones, pero no llama a `revokeRole`. Una wallet de personal dada de baja conserva el permiso on-chain y puede invocar directamente el contrato. La autenticación de la web no impide una llamada directa a Stellar.

**Evidencia:** lectura de las rutas y servicios; no se realizó una baja ni una invocación real.

**Cambio:** bloquear la eliminación mientras exista un rol o implementar baja coordinada: desactivar usuario, revocar on-chain, guardar hash/resultado y conservar un registro auditable. Si falla la red, dejar una baja pendiente que se pueda reintentar, sin perder la dirección necesaria para revocarla.

### R10 · P2 · Escrituras simultáneas compiten por la secuencia del admin

**Código:** `backend/src/services/onchain/OnChainAccountsService.ts:39–51`; `backend/src/lib/StellarContracts/TxBuilder.ts:92–106`.

Dos operaciones cargan por separado la misma secuencia y construyen la siguiente transacción sin coordinarse. Afecta altas simultáneas, asignaciones de roles y operaciones que compartan cuenta fuente. La creación de cuenta se lanza en segundo plano y un fallo solo queda en logs; el usuario puede entrar sin una cuenta operativa.

**Comprobado:** dos llamadas concurrentes a `ensureAccount`, con RPC simulado, construyeron ambas secuencia `43` a partir de `42`. No se enviaron a Stellar.

**Cambio:** serializar la preparación y envío por cuenta fuente mediante una cola/worker con coordinación entre instancias. Ante conflictos o incertidumbre, consultar el hash antes de reconstruir. Exponer al usuario un estado de preparación y reintento; no tratar un 504 como prueba de que una transacción no ocurrió.

## Precaución al reutilizar la vinculación en VoiceLedger

`FarmersService.linkTelegram` lee el vínculo fuera de la transacción y luego actualiza solo por `id` (`FarmersService.ts:255–295`). Dos usuarios que intenten tomar el mismo caficultor pueden leer `telegramUserId=null` y ambas escrituras resultar exitosas: la segunda reemplaza la primera. La restricción `telegramUserId @unique` impide que un usuario tenga dos filas, pero no protege una fila de dos usuarios diferentes. Es un hallazgo estático; no se ejecutó una prueba concurrente contra Postgres.

Antes de reutilizarlo, actualizar con condición sobre el vínculo actual, comprobar el número de filas afectadas y coordinar cualquier liberación de un vínculo anterior en la misma transacción. Para altas on-chain ya confirmadas, evitar el cambio automático de identidad. La firma HMAC de VoiceLedger autentica al integrador; la verificación de que quien aporta un ID sea su titular debe acordarse con la cooperativa, porque el ID seudónimo por sí solo no es un secreto.

## Lo que está bien encaminado

- Nonces aleatorios, de cinco minutos y un solo uso, con consumo condicionado para evitar reutilización concurrente.
- Firma ed25519 y separación entre el formato de mensajes de Cavos y el de las wallets Stellar.
- Validación zod, paginación y protección administrativa en las rutas de gestión.
- Separación de datos personales y registros públicos en el modelo de trazabilidad.
- Importación CSV con validación por línea, modo de prueba y escritura agrupada.
- Contrato v0 con pruebas de roles, autorizaciones, cooperativa, duplicados y transiciones. Sus 20 pruebas pasan; verifican el diseño v0, no certifican el diseño nuevo con agente.

## Validación realizada y límites

| Verificación | Resultado |
|---|---|
| `backend`: `npm run build` | Pasa, incluida resolución de alias. |
| `webapp`: `tsc --noEmit --incremental false` | Pasa. |
| `webapp`: `npm run build` | Pasa. Advertencias de convención middleware, APIs de compresión de jose en Edge y Browserslist antiguo; no se observó un fallo de ejecución por ellas. |
| `contracts`: `cargo test --locked --offline` | 20 pruebas pasan. |
| Comprobaciones aisladas de auth/API con dependencias simuladas | Confirman R1, R2, R3, R6, R7 y R8 en los términos descritos. |
| Construcción concurrente con RPC simulado | Confirma colisión de secuencia de R10. |
| Compilación con la estructura de archivos del Docker builder | Falla con cuatro TS2307, confirmando el primer bloqueo de R5. |

No hay suite de tests de backend/frontend configurada en sus `package.json`. Las comprobaciones aisladas de revisión no sustituyen pruebas de integración con Postgres, navegador/Cavos real y testnet. No se certifica un despliegue ni el estado de servicios externos. No se efectuó un pentest ni una auditoría completa de dependencias o del futuro contrato v1.

## Orden propuesto de trabajo

1. Corregir secretos, propiedad de sesiones y revocación de privilegios; limitar el fondeo público y exigir testnet para el piloto.
2. Reparar Docker y unificar proxy, cookies y URL de refresh. Validar login, renovación y cierre de sesión en los dominios reales de staging.
3. Implementar despliegue Cavos y faucet con estado persistido, exclusión concurrente y reconciliación de hashes. Mostrar dirección, saldo y tx de fondeo.
4. Introducir el agente de caficultores separado del admin y adaptar el alta mínima del contrato/cliente a `farmer_ref`.
5. Implementar el evento `farmer.linked`: HMAC sobre cuerpo original, timestamp, zod, almacenamiento e idempotencia durable. Vincular de forma atómica, guardar la transacción y devolver siempre el mismo resultado para reintentos. Un mismo `event_id` con otro contenido debe rechazarse.
6. Ejecutar la demo de semana 1: email desde teléfono → cuenta creada y fondeada sin intervención → saldo y hash visibles; evento VoiceLedger → caficultor registrado on-chain. Conservar evidencia y probar también solicitudes no autorizadas, duplicadas y concurrentes.

La migración a Supabase queda excluida: estas correcciones y pruebas pueden prepararse con la Postgres temporal. El contrato JSON de VoiceLedger necesita coordinación, pero no impide definir y probar la parte receptora contra un evento de ejemplo acordado.
