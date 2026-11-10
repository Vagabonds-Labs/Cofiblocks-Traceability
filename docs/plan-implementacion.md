# Plan de implementación — CofiBlocks Traceability (piloto Etiopía)

**Alcance comprometido:** el SOW de Instawards presentado a Stellar el 8 de noviembre de 2026 ("Instawards SOW – CofiBlocks Traceability", USD 5000, 30 días). Si algo de este plan choca con el SOW, manda el SOW.
**Referencia de detalle:** el documento de Karla "CofiBlocks Traceability App Flow – Ethiopia Pilot" (28 oct.). Define roles, etapas y formularios. Lo que el PDF pide y el SOW no cubre pasa al [backlog después del sprint](#6-backlog-después-del-instaward).
**Sprint:** del lunes 16 de noviembre al martes 15 de diciembre de 2026. Son 4 semanas de trabajo y 2 días de margen para entregar la evidencia. La semana del 9 al 13 de noviembre es la **semana 0**, de preparación.
**Validación:** con usuarios de prueba (Karla, el equipo de WHH y algunos caficultores y personal de las cooperativas). **El piloto con los 200 caficultores queda fuera del sprint** (SOW, "Out-of-Scope"): se hace después de las pruebas iniciales.

**Decisiones tomadas:**

- **Dos canales:**
  - **Caficultores:** usan solo un **bot de Telegram**. El bot los registra con el ID que les dio la cooperativa.
  - **Personal de la coop y de la unión:** usa una **app web**. Entra con **email vía Cavos**, como pide el SOW. También puede entrar con Telegram vía Cavos, o con una wallet de Stellar propia.
- **Los caficultores no tienen wallet.** En Telegram no se puede embeber una wallet, así que **todas sus transacciones las firma una wallet del backend**, la "wallet de caficultores" (`farmer agent`).
  - On-chain, el caficultor se identifica solo por su `farmer_ref` seudónimo (por ejemplo `KK-ID001`).
  - La wallet de caficultores es distinta de la wallet admin y solo puede hacer acciones de caficultor.
  - Se descarta la Telegram Mini App con Cavos.
- **El personal firma sus propias transacciones** con su wallet invisible de Cavos. Esa wallet se **fondea automáticamente con XLM de testnet** desde un faucet. Los fees los paga el backend con fee-bump, así que el usuario nunca necesita XLM.
- **Flujo del lote del SOW:**
  1. El caficultor **registra su entrega** desde el bot. Ese registro es inmutable.
  2. El Coffee Collector **agrega el peso y el recibo**. También son inmutables.
  3. Desde ahí, los cambios solo **avanzan la etapa** o **adjuntan documentos**.
- **El perfil de la finca y las prácticas sí se pueden editar**, y los edita el propio caficultor desde el bot, como pide el SOW. Esto reemplaza la decisión anterior de que solo el personal editaba.
- **GPS:** el botón nativo de Telegram "Compartir ubicación", o coordenadas escritas.
- La cooperativa entrega la **lista de IDs de los caficultores**.
- **La voz (VoiceLedger) queda fuera del sprint.** El bot funciona con texto y botones.

> **Hay que avisarle a Alejandra Vargas (Ambassador Chapter Lead) de un cambio frente al SOW.** El SOW dice que todos los actores, también los caficultores, entran con email y reciben una wallet invisible. En la práctica, los caficultores usan Telegram y el backend firma por ellos. La evidencia "A Farmer creates a batch" va a ser una transacción firmada por la wallet de caficultores, con el `farmer_ref` en el evento. Conviene contárselo antes de entregar la evidencia.

Cada semana termina con una **demo visual**, con transacciones reales en Stellar Testnet. La demo además cumple lo que el SOW promete para esa semana.

---

## Estado

**Semana 0 (rama `semana-1-base`):**

- [x] Repo limpio: sin marketplace en contratos, backend ni webapp.
- [x] Contrato `traceability` v0 con 20 tests, desplegado en testnet:
  [`CAFZUGHO…KB32Z`](https://stellar.expert/explorer/testnet/contract/CAFZUGHOGCYW2ULV4ZN62T5EC7IPYZXTBKVCA3QUKO3QWJHQ5X6KB32Z). **Hay que cambiarlo** (ver [§2.2](#22-contrato-traceability-v1)): hoy el caficultor tiene una dirección propia y es el Collector quien crea el lote.
- [x] Base nueva (migración inicial) y seed de la unión, las 3 cooperativas y sus 11 centros.
- [x] Admin: asignar y quitar roles (on-chain), e importar la lista de caficultores por CSV.
- [x] Inicio según el rol.
- [x] Bot v0: idioma, cooperativa e ID. Probado con updates simulados; falta el token del bot real.
- [x] Login con Cavos (Telegram y email) en lugar de Privy, con el login por wallet de Stellar todavía disponible. Falta probarlo con el App ID real.
- [ ] Staging.

**Decisiones de la semana 0:**

- **ID on-chain del caficultor:** `farmer_ref` = código de la cooperativa + su ID, por ejemplo `KK-ID001`. Los IDs que asigna cada cooperativa solo son únicos dentro de ella.
- **IDs numéricos del contrato:** cooperativas 1 a 3, unión 100, centros 11 a 34. No se pueden cambiar una vez que hay lotes.
- **Cuentas Stellar del personal:**
  - Quien entra con wallet propia: la crea el backend en el primer login.
  - Quien entra con Cavos: la crea Cavos. Si el backend se adelanta, Cavos ve la cuenta sin sus datos y deja al usuario esperando aprobar el dispositivo. Por eso el faucet de Cavos se hace en dos pasos (ver [§2.3](#23-wallets-invisibles-cavos-y-faucet)).
- **Firma de login con Cavos:** Cavos no firma en SEP-53.
  - Antepone su propio prefijo (`Cavos Signed Message:\n<largo>\n`).
  - Firma con la "control key" del dispositivo, que puede no ser la misma dirección que la cuenta.
  - El backend verifica la firma con esa clave. Si no es la cuenta, comprueba en Horizon que la clave firme por ella.

---

## 1. Qué promete el SOW y cómo lo cumplimos

| Entregable del SOW | Presupuesto | Qué construimos | Evidencia que entregamos |
|---|---|---|---|
| **1. Frictionless Auth & Invisible Wallets** | USD 1100 | Login con email (y Telegram) vía Cavos. Wallet Stellar invisible, fondeada con XLM de testnet por un faucet automático. | Link a staging con el login por email y el repo de GitHub. |
| **2. Role-Based Traceability Smart Contracts** | USD 2300 | Contrato `traceability` v1 con permisos por rol. El caficultor crea su perfil (editable) y registra entregas (inmutables). El Collector agrega peso y recibo (inmutables). Después solo cambian la etapa o se adjuntan documentos. | Contrato desplegado en Stellar Expert, tests y 3 pruebas on-chain: **1)** un caficultor crea un lote; **2)** un Collector agrega un evento autorizado; **3)** un intento no autorizado es rechazado por el contrato. |
| **3. UI for State Tracking & Export** | USD 1600 | Web donde cada usuario hace lo que su rol permite, consulta el historial del lote, sube documentos y exporta CSV. | Video: un usuario crea un lote y se ve el hash de la transacción. Otro usuario consulta el historial, sube un documento y exporta un CSV. |

**Fuera del alcance del SOW:** rampas fiat, escrow o reparto de ingresos, datos personales on-chain, certificación legal para Europa, el piloto con 200 caficultores y la lógica del marketplace.

**Plan semanal del SOW** (lo que revisa la Ambassador):

| Semana | El SOW dice | Nuestro plan |
|---|---|---|
| 1 (16–20 nov) | Cavos con email, wallet invisible y faucet de testnet | Igual, más la wallet de caficultores y el registro on-chain del caficultor desde el bot. |
| 2 (23–27 nov) | Contratos con permisos por rol y cambios inmutables, probados localmente | Igual, y **adelantamos el deploy a testnet**. El bot ya registra perfil, prácticas y entregas. |
| 3 (30 nov – 4 dic) | Deploy a testnet y frontend: escribir datos, subir documentos, exportar CSV | Igual. |
| 4 (7–11 dic) | Pruebas de punta a punta, tests de permisos automáticos, demo y documentación | Igual. |

---

## 2. Diseño

### 2.1 Arquitectura

```
Caficultor ── Telegram ──► Bot (backend) ──► wallet de caficultores ──┐
                                                                     ▼
Personal coop/unión ── Webapp (Cavos) ── firma ──► Backend API ──► Contrato traceability (Stellar)
                                                       │
                                                       └──► Postgres + Supabase Storage
```

**Regla general: en la cadena no va ningún dato personal.** On-chain van solo:

- identificadores seudónimos (`farmer_ref`, número de lote);
- la etapa, quién hizo cada cambio y la fecha;
- el **hash** del registro completo y de cada documento.

El registro completo vive en Postgres y los archivos en Supabase Storage. El backend recalcula el hash y lo compara con el de Stellar. Así cualquiera puede comprobar que el registro no se alteró, y la página del lote muestra "Verificado en Stellar".

| Dato | Dónde |
|---|---|
| Nombre, teléfono, familia, ubicación, GPS de las parcelas | Off-chain |
| Perfil de la finca y prácticas | Off-chain, con el hash on-chain. Se puede editar; cada versión deja su hash. |
| Consentimiento EUDR | Off-chain, con el hash on-chain registrado por la wallet de caficultores |
| Entrega: lote, `farmer_ref`, centro de acopio | On-chain, más el hash del detalle |
| Peso y recibo | Peso on-chain; el recibo en Storage, con su hash on-chain |
| Cambio de etapa | On-chain: actor, etapa, fecha y hash. El detalle, off-chain. |
| Documentos | Supabase Storage, con el hash on-chain |

### 2.2 Contrato `traceability` v1

Cambios frente al v0 desplegado:

- **El caficultor ya no tiene dirección.** Se identifica por `farmer_ref`.
- **La wallet de caficultores** se configura en el contrato (`set_farmer_agent`, admin). Es la única que puede ejecutar las acciones de caficultor.
- **El lote lo crea el caficultor** (su entrega), no el Collector.
- **El peso y el recibo** se registran una sola vez.
- **Documentos adjuntos** al lote.

**Funciones:**

| Función | Quién | Qué hace |
|---|---|---|
| `grant_role`, `revoke_role`, `set_farmer_agent`, `set_admin`, `upgrade` | Admin | Administración |
| `register_farmer(farmer_ref, coop)` | Wallet de caficultores | Da de alta al caficultor cuando se vincula por el bot. |
| `record_consent(farmer_ref, consent_hash)` | Wallet de caficultores | Deja constancia del consentimiento EUDR. |
| `set_profile(farmer_ref, profile_hash)` | Wallet de caficultores | Perfil de la finca y prácticas. **Editable:** cada versión emite un evento con su hash. |
| `create_batch(batch_id, farmer_ref, center, data_hash)` | Wallet de caficultores | **Registro de la entrega. Inmutable.** El lote queda en la etapa `Delivered`. |
| `record_reception(collector, batch_id, weight_grams, receipt_hash, data_hash)` | Collector de la cooperativa del lote | **Peso y recibo, una sola vez.** El lote pasa a `Received`. |
| `advance_stage(actor, batch_id, stage, data_hash)` | Según la etapa | Solo avanza. Valida la transición y el rol. |
| `attach_document(actor, batch_id, doc_hash)` | Cualquier rol de la cooperativa del lote, o el Export Manager | Adjunta el hash de un documento (lista acotada). |
| `get_batch`, `get_farmer`, `get_member` | Cualquiera | Lectura |

**Etapas y quién las mueve:**

| Etapa | Quién |
|---|---|
| `Delivered` | Caficultor (vía la wallet de caficultores) |
| `Received` | Collector |
| `Washing` | Industry Manager |
| `Fermentation` | Industry Manager (pendiente de confirmar) |
| `Drying` | Industry Manager |
| `Storage` | Industry Manager o Store Keeper (pendiente de confirmar) |
| `InTransportToUnion` | Store Keeper |
| `PreparedWithExportableBag` | Export Manager |
| `Sold` | Export Manager |

**Tests de permisos** (evidencia del SOW). Cada caso tiene que ser rechazado:

- una cuenta cualquiera intenta crear un lote o registrar el peso;
- un Collector de otra cooperativa intenta registrar el peso;
- se intenta registrar el peso dos veces;
- se intenta crear un lote con un ID que ya existe;
- se intenta retroceder o saltar etapas;
- un rol intenta mover una etapa que no le toca;
- la wallet de caficultores intenta hacer algo del personal;
- alguien que no es el admin intenta asignar roles.

Para que el rechazo **se vea en el explorador**, el script de evidencia envía una de estas transacciones sin simularla antes. Queda como transacción fallida en Stellar Expert, con el código de error del contrato.

### 2.3 Wallets invisibles (Cavos) y faucet

- Cavos crea una **cuenta clásica de Stellar (G…)**. La llave vive en su vault, y el usuario no ve frases semilla.
- **El deploy es diferido:** Cavos no crea la cuenta al hacer login, sino con la primera operación (`execute`), y patrocinada por su relayer.
- **El faucet no puede ir antes que Cavos.** Si el backend crea la cuenta antes, por ejemplo con Friendbot, Cavos la ve sin sus datos y bloquea al usuario.

**Flujo:**

1. En el primer login, la web le pide a Cavos que cree la cuenta.
2. Cuando la cuenta existe, la web avisa al backend.
3. El backend envía XLM de testnet desde una **cuenta faucet**, que a su vez se carga con Friendbot. Lo hace una sola vez por usuario y lo guarda en la base.

Las cuentas con wallet propia se fondean directo con Friendbot.

**Spike de la semana 1:** Cavos no expone un "deploy" público.

- `execute(monto, destino)` crea la cuenta y después intenta un pago, que falla porque la cuenta queda con 0 XLM.
- Opciones a probar:
  - `execute` con un monto mínimo, aceptando que falle el pago;
  - preguntarle a Cavos por un deploy sin pago;
  - mandar el XLM desde el faucet justo después de la creación.

**Firma de transacciones del personal:**

1. El backend arma la invocación sin firmar (`TxBuilder`).
2. La web la firma con `wallet.signXdr`.
3. El backend la envía con fee-bump (`TxSubmitter`).

La cuenta tiene que existir antes de firmar, y el faucet lo garantiza. Si `signXdr` da problemas, la alternativa es `wallet.invokeContract` con el relayer de Cavos.

### 2.4 Bot de Telegram (caficultores)

- **Dónde vive:** en el backend, con grammY.
- **Estado de la conversación:** se guarda en Postgres, para retomar donde quedó.
- **Las transacciones** las firma la wallet de caficultores. El bot muestra el enlace a la transacción después de cada acción.

**Flujos del sprint:**

1. **Vincularse:** `/start` → idioma → cooperativa → **ID de la cooperativa**, validado contra la lista. El backend llama `register_farmer`. *Ya existe sin la parte on-chain.*
2. **Consentimiento EUDR:** el bot muestra el texto y las 3 declaraciones, y el caficultor acepta con botones. El backend llama `record_consent`.
3. **Perfil de la finca y prácticas (editable):**
   - datos básicos;
   - parcelas: tamaño en fachasa (el sistema lo convierte a hectáreas) y ubicación con "Compartir ubicación" o coordenadas escritas;
   - prácticas de la temporada.

   Al final hay un resumen con **Confirmar** o **Corregir**, y el backend llama `set_profile`. Después se puede volver a editar.
4. **Registrar una entrega:** el caficultor elige el centro de acopio. Opcionalmente escribe los kg estimados y la madurez. El bot genera el número `DD-MM-YYYY [FarmerID]` y el backend llama `create_batch`.
5. **Avisos:** cuando el Collector registra el peso, y en cada cambio de etapa de sus lotes.

**Fuera del sprint:** voz (VoiceLedger), fotos de tenencia y de árboles, el cuestionario completo del paso 1.5 del PDF, y consultar "mis lotes" (salvo que sobre tiempo).

### 2.5 Modelo de datos (cambios sobre lo que ya existe)

- **`Farmer`:**
  - se quita `walletAddress`, y `registerTx` pasa a ser la transacción de la wallet de caficultores;
  - se agregan el perfil (JSON con versión), `profileHash` y `profileTx`.
- **`Plot`:** tamaño en fachasa y en hectáreas, y punto GPS con su origen (compartido o escrito).
- **`Batch`:**
  - número, caficultor, centro y etapa;
  - los datos de la entrega: kg estimados y madurez;
  - los datos de la recepción: peso y recibo;
  - `createTx` y `receptionTx`.
- **`BatchEvent`:** etapa, actor, datos de la etapa (JSON), `dataHash` y `txHash`.
- **`Document`:** lote, tipo, archivo en Storage, `sha256`, quién lo subió y `txHash`.
- **`User`:** `fundedAt` y `fundTx` (faucet).

---

## 3. Milestones por semana

### Semana 0 (9–13 nov): preparación

Lo que ya está hecho aparece en [Estado](#estado). Falta:

- Probar Cavos con el App ID real (Jonatan).
- Token del bot real y staging.
- Avisarle a Alejandra del cambio de los caficultores sin wallet.

### Semana 1 (16–20 nov): Auth y wallets invisibles — *entregable 1 del SOW*

**Objetivo:** el personal entra con email desde el teléfono y recibe una dirección Stellar fondeada sin hacer nada. El caficultor que se vincula por el bot queda registrado on-chain.

- Cavos en staging, con el App ID real, para email y Telegram.
- Deploy de la cuenta Cavos en el primer login (spike de §2.3).
- **Faucet:**
  - la cuenta faucet se recarga con Friendbot;
  - endpoint `POST /wallet/fund`, con una sola carga por usuario;
  - para la wallet propia, Friendbot directo.
- Perfil y pantalla de inicio: dirección, saldo de XLM y enlace a Stellar Expert.
- **Wallet de caficultores:**
  - identidad `cofi-farmer-agent`, fondeada y configurada en el backend;
  - servicio para firmar y enviar con esa cuenta.
- Bot: la vinculación del caficultor llama `register_farmer` con la wallet de caficultores, sobre el contrato v0 adaptado o directamente sobre el v1 si ya está.
- Staging accesible para Karla y WHH.

**Demo visual:**

1. Login con email en el teléfono.
2. La dirección aparece en el perfil con su saldo, y el pago del faucet se ve en Stellar Expert.
3. En Telegram, un caficultor escribe su ID y el bot responde con el enlace a su registro on-chain.

**Evidencia del SOW:** link a staging y el repo.

### Semana 2 (23–27 nov): Contratos con permisos por rol — *entregable 2 del SOW*

**Objetivo:** el contrato v1 hace cumplir quién puede hacer qué, y el caficultor ya usa el bot de punta a punta hasta registrar una entrega.

- Contrato `traceability` v1 (§2.2):
  - wallet de caficultores, perfil editable, entrega inmutable, peso y recibo inmutables, etapas y documentos;
  - **tests de permisos**, con todos los casos de §2.2;
  - deploy a testnet (lo adelantamos desde la semana 3 del SOW) y configuración de la wallet de caficultores.
- Backend:
  - cliente del contrato v1;
  - migración de `Farmer` y `Batch`;
  - el servicio de caficultores firma con la wallet de caficultores.
- Bot:
  - consentimiento EUDR;
  - perfil de la finca y prácticas, con edición;
  - registro de la entrega (`create_batch`).

**Demo visual:**

1. Un caficultor acepta el consentimiento, carga su finca compartiendo la ubicación y registra una entrega desde Telegram. Cada paso tiene su enlace a Stellar Expert.
2. Salida de `cargo test` con los casos no autorizados rechazados.

**Evidencia del SOW:** el contrato en el explorador y el repo con los tests.

### Semana 3 (30 nov – 4 dic): Frontend del flujo completo — *entregable 3 del SOW*

**Objetivo:** cada rol hace en la web lo que le toca, y cualquier miembro ve el historial del lote, sube documentos y exporta CSV.

- **Collector:**
  - ve las entregas pendientes de su cooperativa;
  - registra el peso y sube la foto del recibo (`record_reception`, firmado con su wallet de Cavos).
- **Industry Manager, Store Keeper y Export Manager:** avanzan la etapa con un formulario corto por etapa (notas y campos clave del PDF) y una foto opcional.
- **Documentos:** cualquier rol de la cooperativa, o el Export Manager, sube un archivo. Se guarda en Storage y su hash va on-chain con `attach_document`.
- **Lotes:**
  - listado con filtros por cooperativa, centro y etapa;
  - **página del lote** con la línea de tiempo: quién, cuándo, documentos, enlace a cada transacción y "Verificado en Stellar".
- **Exportar CSV:**
  - lotes con su historial (IDs seudónimos, sin datos personales);
  - caficultores con su estado (solo para el personal).
- Bot: avisos al caficultor cuando se registra el peso y en cada cambio de etapa.
- Firma con Cavos: `signXdr` con nuestro fee-bump, o `invokeContract` si `signXdr` falla.

**Demo visual:** el caficultor registra su entrega por Telegram. El Collector la pesa en la web y el caficultor recibe "Tu lote 01-12-2026 KK-ID001 fue recibido en Kirkir: 45 kg". El lote avanza de etapa, alguien sube un documento y se exporta el CSV.

### Semana 4 (7–11 dic): Pruebas, demo y documentación — *cierre del SOW*

**Objetivo:** todo probado de punta a punta, con la evidencia lista para la Ambassador.

- **Script de punta a punta en testnet** (`scripts/`). Recorre todo el flujo y genera la lista de transacciones de evidencia:
  1. un caficultor crea un lote;
  2. un Collector agrega un evento autorizado;
  3. un intento no autorizado es rechazado.
- Tests automáticos de permisos en CI: los del contrato, más los de la API (cada rol contra cada endpoint).
- Validación con usuarios de prueba: Karla, WHH y algunos caficultores y personal de las cooperativas. Se corrige lo que salga.
- **Documentación open source:** README de cada parte, arquitectura, cómo correrlo y cómo verificar un lote.
- **Video demo:**
  1. login con email;
  2. entrega por Telegram;
  3. peso;
  4. etapas;
  5. documento;
  6. historial;
  7. CSV.
- **Lista de transacciones** en Stellar Expert para la entrega.
- 14 y 15 de diciembre: margen para ajustes y para la entrega a Alejandra.

### Qué se recorta primero si vamos atrasados

Lo que **no se toca** es lo que el SOW pide como evidencia: login por email con wallet fondeada, el contrato con sus tests, las 3 pruebas on-chain, crear un lote, historial, documentos y CSV.

Se recorta en este orden:

1. Los avisos del bot (el caficultor puede preguntarle a la coop).
2. La edición del perfil desde el bot (queda solo la carga inicial, también on-chain).
3. Los formularios específicos de cada etapa (quedan notas y foto).
4. El login con Telegram para el personal (queda email, que es lo que pide el SOW).
5. El CSV de caficultores (queda el de lotes).

---

## 4. Preguntas abiertas

**Semana 0 o 1**

- [ ] **Cavos:**
  - App ID (Jonatan);
  - ¿el relayer patrocina cuentas en testnet con nuestro plan?
  - ¿hay forma de crear la cuenta sin un pago?
- [ ] ¿Quién crea y administra el **bot de Telegram** (nombre y cuenta dueña)?
- [ ] ¿Dónde se aloja staging?
- [ ] ¿Alejandra está de acuerdo con que los caficultores firmen a través de la wallet del backend?
- [ ] ¿Quiénes son los usuarios de prueba de la semana 4, y cuándo están disponibles?

**Semana 2**

- [ ] Factor de conversión de **fachasa a hectáreas**.
- [ ] ¿Qué campos mínimos lleva el perfil de la finca y qué prácticas se preguntan en esta versión?
- [ ] ¿En qué idiomas va el bot para las pruebas (inglés, afaan oromo, amárico) y quién traduce?

**Semana 3**

- [ ] Si un caficultor entrega dos veces el mismo día, ¿se le agrega un sufijo al número de lote?
- [ ] ¿Fermentation es una etapa propia o parte de Washing? ¿Storage lo marca el Industry Manager o el Store Keeper?
- [ ] ¿Qué documentos se suben y en qué etapa (recibo, certificados, documentos de venta)?
- [ ] ¿Qué columnas necesitan en el CSV?

---

## 5. Riesgos

- **Cavos:**
  - El SDK es muy reciente: el login con Telegram se publicó el 5 de noviembre.
  - El deploy de la cuenta no tiene una función pública (ver el spike de §2.3).
  - Mitigación: el login con wallet de Stellar propia sigue funcionando, y el backend ya verifica las firmas de las dos.
- **Cambio frente al SOW (caficultores sin wallet):** se conversa con Alejandra en la semana 0 o 1, antes de entregar evidencia.
- **Una sola wallet para todos los caficultores:**
  - Si se filtra su clave, alguien podría registrar entregas falsas, pero no tocar etapas, pesos ni roles.
  - La clave vive solo en el backend y el admin puede cambiar la wallet con `set_farmer_agent`.
- **GPS escrito:** es propenso a errores. Se valida que las coordenadas caigan dentro de Gomma y se pide confirmación.
- **Respuestas de Etiopía:** si no llegan a tiempo, se avanza con supuestos configurables.

---

## 6. Backlog después del InstaAward

Lo que el PDF de Karla pide y el SOW no cubre. Es el candidato para el siguiente Instaward o para el SCF Build Award, y para preparar el piloto con 200 caficultores.

- Voz con VoiceLedger.
- Carga y onboarding de los 200 caficultores, más QA en campo con teléfonos básicos y conexiones lentas.
- Cuestionario completo del paso 1.5 (prácticas, más los 6 puntos extra), fotos de tenencia y de árboles.
- Polígonos para fincas de 4 ha o más y mapa de parcelas.
- Reportes EUDR: GeoJSON para la declaración de debida diligencia y volumen por calidad y región.
- Dashboard con indicadores (caficultores, lotes por etapa, kg, precios y montos pagados).
- Precio diario por cooperativa (Committee Member), registro financiero de la cooperativa, calificación de calidad y datos de venta (precio y costos).
- Página pública del lote con QR. Depende de qué información es pública y cuál es solo para miembros.
- Consultar "mis lotes" desde el bot y aviso de venta.
- Traducciones completas de la web y del bot.
