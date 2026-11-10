# Plan de implementación — CofiBlocks Traceability (piloto Etiopía)

**Duración:** 4 semanas. Supuesto: del lunes 9 de noviembre al viernes 4 de diciembre de 2026.
**Fuente del alcance:** "CofiBlocks Traceability App Flow – Ethiopia Pilot" (Karla, 28 oct.), completo.
**Piloto:** las 3 cooperativas del documento (Kilole Kirkir, Dandi Misoma y Kananisa, en Jimma Zone, Gomma Woreda), con todos sus centros de acopio y **200 participantes** en total.

**Decisiones tomadas:**

- **Dos canales:**
  - **Caficultores:** usan solo un **bot de Telegram**, por voz o texto. El bot los registra con el ID que les dio la cooperativa.
  - **Personal de la coop y de la unión:** usa una **app web** y entra con Telegram o email.
- **Login y wallet con Cavos** (`@cavos/kit`). El App ID lo aporta Jonatan cuando se registre.
- **Cada usuario firma sus propias transacciones.** El caficultor firma desde una **Telegram Mini App** abierta desde el bot, con Cavos adentro.
- **La voz la procesa VoiceLedger.** Nosotros recibimos los datos ya estructurados.
- **GPS:** el botón nativo de Telegram "Compartir ubicación", o coordenadas escritas o dictadas.
- La cooperativa entrega la **lista de IDs de los caficultores**.
- Se **quita el código del marketplace** de este repo.

Cada semana termina con una **demo visual**: algo que se pueda mostrar en el teléfono o en pantalla, con transacciones reales en Stellar Testnet.

---

## Estado

**Semana 1 (rama `semana-1-base`):**

- [x] Repo limpio: sin marketplace en contratos, backend ni webapp.
- [x] Contrato `traceability` v0 con 20 tests, desplegado en testnet:
  [`CAFZUGHO…KB32Z`](https://stellar.expert/explorer/testnet/contract/CAFZUGHOGCYW2ULV4ZN62T5EC7IPYZXTBKVCA3QUKO3QWJHQ5X6KB32Z).
- [x] Base nueva (migración inicial) y seed de la unión, las 3 cooperativas y sus 11 centros.
- [x] Admin: asignar y quitar roles (on-chain), e importar la lista de caficultores por CSV.
- [x] Inicio según el rol, con sus tareas de las próximas semanas.
- [x] Bot v0: idioma, cooperativa e ID. Probado con updates simulados; falta el token del bot real.
- [ ] Login con Cavos (Telegram y email): espera el App ID. Mientras tanto queda el login actual (Privy y wallet).
- [ ] Spike de Cavos dentro de la Telegram Mini App.
- [ ] Staging.

**Decisiones de la semana 1:**

- **ID on-chain del caficultor:** `farmer_ref` = código de la cooperativa + su ID, por ejemplo `KK-ID001`. Los IDs que asigna cada cooperativa sólo son únicos dentro de ella.
- **IDs numéricos del contrato:** cooperativas 1 a 3, unión 100, centros 11 a 34. No se pueden cambiar una vez que hay lotes.
- **Cuenta Stellar del usuario:** la crea el backend al primer login, con 1 XLM.

---

## 1. Qué hay hoy en el repo y qué se reutiliza

El repo es una copia del marketplace de CofiBlocks ya migrado a Stellar.

| Pieza | Estado actual | Qué hacemos |
|---|---|---|
| `webapp/`: Next.js 16, next-intl (en/es/pt), Tailwind + DaisyUI, zustand | Marketplace completo (productos, carrito, checkout, pedidos, perfil, admin) | Se conservan el layout, el estilo, el header y footer, el i18n, el perfil y el admin. Se borran productos, carrito, checkout, pedidos, ventas y eventos. Se agrega la ruta de la **Mini App** del caficultor. |
| Login | Privy (email y passkey) más wallets externas (Freighter/LOBSTR) | Se reemplaza por **Cavos**: Telegram y email. Se sacan Privy y las wallets externas. |
| `backend/`: Express, Prisma, Postgres (Supabase), Supabase Storage | Auth con JWT y cookies, sesiones, nonce de firma, subida de imágenes, notificaciones | Se conservan auth, sesiones, storage y notificaciones. Se reemplazan los modelos y las rutas del marketplace. Se agrega el **bot de Telegram**. |
| `backend/src/lib/StellarContracts` | `TxBuilder`, `TxSubmitter` (fee-bump pagado por la cuenta admin), `EventsClient`, `ContractFactory` | Se reutilizan tal cual. Se agrega el cliente del contrato `traceability`. |
| `contracts/`: Soroban en Rust | `marketplace` y `distribution` | Se reemplazan por un contrato nuevo, `traceability`. Se conservan los scripts de deploy y de testnet. |

## 2. Arquitectura propuesta

```
Caficultor ── Telegram ──► Bot (backend, webhook) ──► VoiceLedger (audio → datos)
     │                          │
     └── Mini App (webapp + Cavos) ── firma ──┐
                                              ▼
Personal coop/unión ── Webapp (Cavos) ──► Backend API ──► Postgres + Supabase Storage
                                              │
                                              └──► Contrato traceability (Stellar)
```

### 2.1 Qué va on-chain y qué off-chain

Regla general: **en la cadena no va ningún dato personal.** On-chain van solo los identificadores seudónimos, las etapas, quién hizo cada cambio, la fecha y un **hash** del registro completo. El registro completo vive en Postgres y Supabase Storage.

| Dato | Dónde |
|---|---|
| Nombre, teléfono, familia, alfabetización, documentos de tenencia | Off-chain |
| GPS y polígonos de parcelas | Off-chain. Se exportan para EUDR. |
| Consentimiento EUDR y declaraciones del caficultor | Off-chain, más el **hash firmado por el caficultor** on-chain |
| Lote: ID, ID seudónimo del caficultor, centro de acopio, kg, madurez | On-chain: ID, centro, kg, etapa y hash. El resto, off-chain. |
| Cada cambio de etapa: actor, rol, fecha y datos de la etapa | On-chain: actor, etapa, fecha y hash. Detalle off-chain. |
| Fotos, recibos, certificados, documentos de venta | Supabase Storage, con el hash del archivo incluido en el hash del evento |
| Precios, costos, calificaciones de calidad | Off-chain con hash on-chain. Qué se publica en abierto depende de la definición de "Public vs Member-only". |

Así, cualquiera puede verificar que un registro no se alteró: el backend recalcula el hash y lo compara con el que está en Stellar. La página del lote muestra la insignia "Verificado en Stellar".

### 2.2 Contrato `traceability` (Soroban)

- **Roles:** `Admin`, `Collector`, `CommitteeMember`, `IndustryManager`, `StoreKeeper`, `ExportManager` y `Farmer`. Cada rol se asocia a una cooperativa, o a la unión en el caso del Export Manager. Los asigna el admin.
- **Funciones:**
  - `grant_role` y `revoke_role` (admin).
  - `register_farmer(farmer, farmer_ref, consent_hash)`: la firma el caficultor desde la Mini App y deja constancia del consentimiento EUDR.
  - `create_batch(collector, batch_id, farmer_ref, center_id, kg, data_hash)`: crea el lote en la etapa `Received`.
  - `advance_stage(actor, batch_id, stage, data_hash)`: valida que la transición sea válida y que el rol corresponda a esa etapa.
  - `get_batch` y `get_history`: el historial es acotado, de unas 8 entradas por lote, y se guarda en storage.
- **Etapas y quién las mueve:**
  - `Received`: Collector
  - `Washing`: Industry Manager
  - `Fermentation`: Industry Manager (pendiente de confirmar)
  - `Drying`: Industry Manager
  - `Storage`: Industry Manager o Store Keeper (pendiente de confirmar)
  - `InTransportToUnion`: Store Keeper
  - `PreparedWithExportableBag`: Export Manager
  - `Sold`: Export Manager
- **Eventos:** el contrato emite uno por cada cambio. El backend los indexa con el `EventsClient` existente y los usa para los avisos del bot.

### 2.3 Firma con Cavos

Cavos crea una **cuenta clásica de Stellar (G…)**. La llave vive en su vault, y el usuario no ve frases semilla.

Flujo propuesto, para mantener el control en el backend y reutilizar el código actual:

1. El usuario envía el formulario. El backend guarda el registro, calcula el hash y arma la invocación sin firmar (`TxBuilder`).
2. El frontend la firma con `wallet.signXdr(xdr)`, que firma solo la entrada de auth de esa cuenta.
3. El backend la envía con fee-bump (`TxSubmitter`) y guarda el `txHash`.

La alternativa es `wallet.invokeContract` con el relayer de Cavos pagando los fees. La **primera semana se valida** cuál de las dos funciona mejor. Hay que revisar sobre todo:

- si el vault muestra un modal de aprobación en cada llamada a contrato, y si eso se puede configurar en el dashboard de Cavos;
- que la cuenta exista on-chain antes de firmar, porque Cavos la crea de forma diferida, con el primer `execute`;
- **que Cavos funcione dentro de la Telegram Mini App.** El vault es un iframe en `vault.cavos.xyz` y el login con Telegram de Cavos es "solo web", así que hay que probarlo dentro del WebView de Telegram.

### 2.4 Bot de Telegram

- **Dónde vive:** en el backend, como un módulo con webhook. Librería sugerida: grammY.
- **Estado de la conversación:** se guarda en Postgres, para que el registro se pueda retomar donde quedó.

**Flujo de registro del caficultor:**

1. `/start` → elige el idioma → escribe su **ID de la cooperativa**. El bot lo valida contra la lista que entrega la coop.
2. El bot pregunta paso a paso, aceptando **texto** o **audio**:
   - datos personales;
   - integrantes de la familia;
   - nivel de alfabetización (con botones);
   - ubicación: región, zona, woreda, kebele y aldea, con botones a partir de las listas.
3. Parcelas, una o varias:
   - tamaño en fachasa (el sistema lo convierte a hectáreas);
   - edad y productividad;
   - tenencia y **foto del certificado**, enviada como foto en el chat;
   - **ubicación con el botón "Compartir ubicación"**, o coordenadas escritas o dictadas.
4. Resumen: el bot lee lo registrado y el caficultor toca **Confirmar** o **Corregir**.
5. Botón **"Firmar consentimiento"**: abre la **Mini App**. Ahí entra con Telegram vía Cavos (se crea su wallet), lee el consentimiento GDPR/EUDR, marca las 3 declaraciones y firma `register_farmer`.

**Audio:** el bot reenvía la nota de voz a **VoiceLedger** y recibe los campos ya estructurados. Si VoiceLedger no responde o no entiende, el bot pide la respuesta por texto. Así el texto siempre funciona y el piloto no queda bloqueado por la voz.

**Además del registro, el caficultor puede:**

- registrar las **prácticas de cosecha** de la temporada (paso 1.5 del PDF);
- **consultar sus lotes:** etapa actual, kg y precio de venta (según lo que se defina como visible);
- **recibir avisos** cuando un lote suyo cambia de etapa o se vende.

**Lo que no hace:** editar o borrar sus datos. Eso lo hace el personal de la coop desde la web, a pedido del caficultor.

### 2.5 Modelo de datos (Prisma, resumen)

- `Union`, `Cooperative`, `CollectionCenter`. Seed con Jimma Zone / Gomma Woreda, las 3 cooperativas y sus centros. La separación de los nombres de los centros sale del texto del PDF y hay que confirmarla:
  - **Kilole Kirkir:** Kirkir, Simbo, Madha Bereha, Nagade
  - **Dandi Misoma:** Sayiti, Kiltu Holka, Amuma
  - **Kananisa:** Kochi, Kiltu Bada, Buna Melka, Yeddu Yeriyo
- `User`: rol, cooperativa, centro de acopio, Telegram ID y dirección de wallet Cavos.
- `Farmer`:
  - identidad: ID asignado por la coop (precargado desde la lista), nombre legal, teléfono, Telegram ID;
  - hogar: integrantes de la familia, nivel de alfabetización;
  - ubicación: región, zona, woreda, kebele y aldea;
  - EUDR: consentimiento y declaraciones, con fecha y `consentTx`;
  - idioma preferido.
- `Plot`:
  - tamaño en fachasa y en hectáreas, edad y productividad;
  - tenencia y foto del certificado;
  - punto GPS (con su origen: compartido, escrito o dictado) o polígono en GeoJSON;
  - estado de los árboles con fotos.
- `BotConversation`: estado del flujo de cada chat.
- `HarvestRecord`, por caficultor y temporada:
  - prácticas agronómicas (con poda y renovación), orgánicas, sociales y ambientales;
  - producción y distancia al centro de acopio;
  - si contrata mano de obra.
- `Batch`: número `DD-MM-YYYY [FarmerID]`, caficultor, centro, kg, madurez, foto, recibo, etapa actual y `createTx`.
- `BatchEvent`: etapa, actor, datos específicos de la etapa en JSON (fermentación, higiene, camas de secado, humedad, bin cards, sacos de yute…), `dataHash`, `txHash` y adjuntos.
- `DailyPrice` (por cooperativa), `CoopFinanceEntry` (pago al caficultor, crédito de capital de trabajo, avance del plan de negocio), `QualityGrade`, `Sale` (precio del cliente y costos de procesamiento) y `Document`.

---

## 3. Milestones por semana

### Semana 1 (9–13 nov): Base, login con Cavos, contrato y primer contacto del bot

**Objetivo:** la app ya es "CofiBlocks Traceability". El personal entra con Telegram o email y ve su pantalla según el rol. El contrato está desplegado y el bot responde.

- Limpiar el repo:
  - webapp: borrar productos, carrito, checkout, pedidos, ventas y eventos;
  - backend: borrar las rutas y servicios equivalentes;
  - contratos: borrar `marketplace` y `distribution`.
  - Cambiar la marca y la navegación.
- Integrar Cavos en la web, cuando tengamos el App ID:
  - `CavosProvider` y login por Telegram y email;
  - conectar con el registro de sesión del backend, reemplazando la firma del nonce de `register_wallet`.
- **Spike de Cavos**, que define el resto del proyecto:
  - firma con `signXdr` y nuestro fee-bump, frente a `invokeContract` con el relayer de Cavos;
  - si aparece un modal de aprobación en cada llamada a contrato;
  - **si Cavos funciona dentro de una Telegram Mini App** (abrir un "hola mundo" de Mini App con Cavos desde el bot).
- Contrato `traceability` v0: roles, `register_farmer`, `create_batch` y `advance_stage`, con validación de transiciones, tests y deploy a testnet (`deploy.sh`).
- Prisma v1 (`Union`, `Cooperative`, `CollectionCenter`, `User` con rol, `Farmer` precargado desde la lista de IDs) y el seed de las 3 cooperativas.
- Panel de admin: lista de usuarios, asignación de rol y cooperativa (escribe el rol on-chain), y carga de participantes y de IDs de caficultores desde CSV.
- Bot v0: crear el bot, configurar el webhook, `/start`, elegir el idioma y validar el ID de la cooperativa.
- Deploy de staging accesible para Karla y WHH.

**Demo visual:**

1. Login con Telegram en la web desde el teléfono.
2. Pantalla de inicio según el rol, con estados vacíos.
3. El admin asigna el rol "Coffee Collector" y la transacción se ve en Stellar Expert.
4. En Telegram, un caficultor escribe su ID y el bot lo reconoce: "Hola, caficultor de Kilole Kirkir".

### Semana 2 (16–20 nov): Registro del caficultor por el bot, parcelas y consentimiento firmado

**Objetivo:** un caficultor se registra solo desde Telegram, sus parcelas aparecen en el mapa y su consentimiento queda firmado en cadena.

- Bot: el flujo completo de registro **por texto y botones**.
  1. Datos personales.
  2. Familia y alfabetización.
  3. Ubicación con listas.
  4. Parcelas: fachasa convertida a hectáreas, edad y productividad, tenencia con foto del certificado, y GPS con el botón "Compartir ubicación" o coordenadas escritas.
  5. Resumen con Confirmar o Corregir.
- Polígonos para fincas de 4 ha o más: subida de KML/GeoJSON desde la web por WHH o la coop. Probablemente ninguna finca del piloto los necesite.
- **Mini App de consentimiento:**
  - se abre desde el bot;
  - el caficultor entra con Telegram vía Cavos y se crea su wallet;
  - lee el consentimiento y marca las 3 declaraciones;
  - firma `register_farmer`.
- Web para el personal:
  - lista de caficultores con su estado de registro;
  - ficha del caficultor, con la edición y el borrado a cargo de la coop;
  - **mapa de parcelas** con Leaflet y OpenStreetMap.
- VoiceLedger: acordar con ellos el formato de intercambio (audio de entrada, campos de salida) y dejar el adaptador listo con un simulador.

**Demo visual:**

1. En Telegram, un caficultor se registra, comparte su ubicación y firma el consentimiento en la Mini App.
2. En la web, su parcela aparece en el mapa de Gomma.
3. Su ficha muestra la insignia "Consentimiento verificado en Stellar", con el enlace a la transacción.

### Semana 3 (23–27 nov): Ciclo del lote en la cooperativa y avisos por el bot

**Objetivo:** seguir un lote desde el centro de acopio hasta que sale a la unión, con una línea de tiempo verificable, y que el caficultor se entere por Telegram.

- **Collector (web):**
  - crea el lote con el número `DD-MM-YYYY [FarmerID]` autogenerado y editable;
  - elige el centro de acopio de la lista e ingresa los kg;
  - marca la madurez (overripe, well ripe, under ripe) con foto;
  - sube el recibo del pago al caficultor.

  Todo esto se registra on-chain con `create_batch`.
- **Industry Manager:**
  - Washing: tiempos de fermentación e higiene de la maquinaria;
  - Fermentation: si se confirma como etapa propia;
  - Drying: camas africanas, humedad y etiquetado de mesas.
- **Store Keeper:**
  - Storage: bin cards y sacos de yute limpios;
  - In Transport to Union.
- **Committee Member:** precio diario por cooperativa.
- Registro financiero de la coop: pago al caficultor, créditos de capital de trabajo y avance del plan de negocio.
- Listado interno de lotes (solo miembros), con filtros por centro, región y etapa.
- **Página del lote:** línea de tiempo con cada etapa, quién la hizo, la fecha, las fotos y el enlace a la transacción, más la verificación del hash.
- **Bot:**
  - **avisos** al caficultor en cada cambio de etapa de sus lotes;
  - registro de **prácticas de cosecha** de la temporada 2026–2027: agronómicas, orgánicas, sociales y ambientales, más los 6 puntos extra.
- VoiceLedger: integrar el audio en el registro, si ya tenemos su API.

**Demo visual:** el collector registra una entrega y el caficultor recibe en Telegram "Tu lote 22-11-2026 ID123 fue recibido en Kirkir: 45 kg". El lote avanza Washing → Drying → Storage → In Transport, y la línea de tiempo y los avisos se llenan en vivo.

### Semana 4 (30 nov – 4 dic): Unión, dashboard, reportes y preparación del piloto

**Objetivo:** cerrar el ciclo hasta la venta, con dashboard, reportes EUDR y la app lista para probar en campo con los 200 participantes.

- **Export Manager:**
  - recepción e inspección con calificación de calidad;
  - Prepared with Exportable Bag;
  - Sold, con el precio pagado por el cliente y los costos de procesamiento;
  - subida de estándares de calidad y documentos.
- **Dashboard:**
  - caficultores registrados, lotes por etapa y volumen en kg;
  - precio diario por coop y lotes vendidos;
  - montos pagados a caficultores y a la coop;
  - número de centros de acopio.

  Con filtros por centro de acopio, región y etapa.
- **Reportes anonimizados EUDR:**
  - CSV con volumen por calificación y región, usando IDs seudónimos;
  - **GeoJSON de parcelas** para la declaración de debida diligencia, sin nombres.
- **Bot:** **consultar mis lotes** (etapa, kg y precio de venta, según lo que se defina como visible) y aviso de venta.
- **Página pública de verificación del lote** con QR: muestra el recorrido y las transacciones. El contenido exacto depende de la definición de "Public vs Member-only".
- VoiceLedger: pruebas de punta a punta con audios reales en el idioma local.
- Traducciones de la web y de los mensajes del bot, aportadas por el equipo local.
- QA en teléfonos básicos y conexiones lentas.
- Carga de los 200 participantes reales y del personal de las 3 coops.
- Entregables del InstaAward: documentación, video demo y lista de transacciones verificables en testnet.

**Demo visual:** el video de punta a punta (registro por Telegram → lote → etapas con avisos → venta → dashboard → reporte EUDR → QR público).

### Qué se recorta primero si vamos atrasados

El alcance completo del PDF, más el bot, es ajustado para 4 semanas. Si al final de una semana vamos atrasados, se recorta en este orden, sin tocar el núcleo (login, roles, registro por bot con texto, consentimiento firmado, lotes con etapas on-chain, línea de tiempo, avisos y dashboard básico):

1. **Voz:** si VoiceLedger no está listo, el piloto arranca solo con texto y botones, y la voz entra después.
2. Los polígonos: quedan para una fase siguiente, porque casi no se usan con fincas menores de 4 ha.
3. Los 6 puntos extra de prácticas y las fotos de los árboles.
4. El registro financiero de la coop (créditos y plan de negocio).
5. Los reportes en PDF. Quedan solo CSV y GeoJSON.
6. La página pública con QR. Queda solo la página interna del lote.

---

## 4. Preguntas abiertas

Ordenadas por la semana en que bloquean.

**Antes o durante la semana 1**

- [ ] Cavos: **App ID** (lo aporta Jonatan al registrarse). ¿Ya está publicado `@cavos/kit@0.5.2` con login por Telegram? ¿Tiene costo?
- [ ] ¿Quién crea y administra el **bot de Telegram** (nombre y cuenta dueña)?
- [ ] ¿Dónde se aloja staging? (¿El mismo hosting del marketplace?)
- [ ] ¿En qué **idiomas** van la web y el bot (inglés, afaan oromo, amárico) y quién traduce?

**Semana 2**

- [ ] ¿Cuál es el factor de conversión de **fachasa a hectáreas**? En el PDF no se lee bien.
- [ ] La **lista de caficultores** de las 3 coops: ¿qué columnas trae (ID, nombre, teléfono, centro de acopio)? ¿Para cuándo?
- [ ] **VoiceLedger:**
  - ¿confirmaron su participación, alcance, costo y tiempos?
  - ¿cómo es su API (qué reciben y qué devuelven)?
  - ¿en qué idiomas transcriben?
- [ ] ¿Nos pasan las listas de woredas, kebeles y aldeas?
- [ ] ¿Qué campos del paso 1.5 (prácticas) son obligatorios y cuáles opcionales? Es lo que estaba en amarillo.

**Semana 3**

- [ ] ¿Los lotes se mezclan o se dividen después de la entrega? Si pasa, el modelo de lote cambia.
- [ ] Si un caficultor entrega dos veces el mismo día, ¿cómo se distingue el número de lote? ¿Se le agrega un sufijo?
- [ ] ¿Fermentation es una etapa propia o parte de Washing? ¿Storage lo marca el Industry Manager o el Store Keeper?
- [ ] ¿En qué unidad y moneda va el precio diario (ETB/kg de cereza)?

**Semana 4**

- [ ] **¿Qué información es pública y cuál es solo para miembros?** Define la página del QR, el dashboard y qué le muestra el bot al caficultor.
- [ ] Ejemplos de los reportes que necesitan: el formato EUDR y la escala de calidad que usa la unión.
- [ ] ¿Cuándo empiezan las pruebas en campo? (¿Diciembre, en paralelo al proceso en papel?)

---

## 5. Riesgos

- **Alcance:** el PDF completo, más el bot conversacional, en 4 semanas no tiene holgura. La lista de recortes de la sección 3 es el plan B.
- **Cavos dentro de Telegram:** el vault (un iframe) y el login con Telegram de Cavos tienen que funcionar dentro del WebView de la Mini App. Se prueba el primer día que tengamos el App ID.
  - Plan B 1: la Mini App abre el navegador externo para firmar.
  - Plan B 2: el backend registra el hash del consentimiento en nombre del caficultor, dejando constancia de que vino del bot.
- **Cavos en general:**
  - El login con Telegram se fusionó el 5 de noviembre, así que es muy reciente.
  - El vault puede pedir aprobación en cada llamada a contrato.
  - La cuenta Stellar se crea de forma diferida.

  Plan B: Privy, que ya está integrado y soporta Telegram.
- **VoiceLedger:** es un tercero sin confirmar, y su calidad en afaan oromo o amárico es desconocida. Mitigación: el bot funciona completo por texto y botones, y la voz se suma encima.
- **GPS escrito o dictado:** es propenso a errores. Se valida que las coordenadas caigan dentro de la zona de Gomma y se le pide al caficultor que las confirme. WHH puede corregirlas desde la web.
- **Respuestas de Etiopía:** varias preguntas bloquean una semana concreta. Si no llegan a tiempo, se avanza con supuestos marcados como configurables.
- **Conectividad en campo:** el modo offline de la web queda fuera del alcance. El bot ayuda en esto, porque Telegram encola los mensajes cuando no hay señal.
