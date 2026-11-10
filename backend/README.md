# Backend — CofiBlocks Traceability

API REST en Express + Prisma/Postgres. Es el centro del sistema: autentica a los usuarios, guarda los datos privados, arma y envía las transacciones al contrato `traceability` en Stellar, y recibe lo que los caficultores registran desde el bot de VoiceLedger.

> 🚧 **Estado:** login, roles on-chain, carga de caficultores y notificaciones funcionan. La integración con VoiceLedger, la wallet de caficultores, el faucet y todo lo de los lotes están en construcción. Ver [Qué falta](#qué-falta).

## Qué hace

- **Login por firma.** No hay contraseñas: el usuario firma un nonce con su wallet. Soporta wallets de Stellar (SEP-53) y wallets de Cavos, que usan su propio prefijo y firman con una "control key" que el backend comprueba en Horizon. La sesión usa JWT de corta duración y refresh tokens en cookies.
- **Roles.** El admin asigna un rol y una organización a cada persona. El rol se escribe primero en el contrato y después en la base, así la base nunca dice algo que la cadena no respalde.
- **Caficultores.** Importa la lista de cada cooperativa desde un CSV, con validación por línea y modo de prueba (`dryRun`). Volver a subir el mismo archivo no duplica nada.
- **Stellar.** Arma, simula y envía las transacciones. La cuenta admin del backend paga las comisiones de todos con fee-bump, así ningún usuario necesita XLM.
- **Notificaciones** en inglés, español, afaan oromo y amárico (`locales/`).

## Estructura

```
backend/
├── prisma/
│   ├── schema.prisma          # modelos (ver abajo)
│   └── migrations/            # una sola migración inicial: necesita una base nueva
├── scripts/
│   ├── seed.ts                # unión, 3 cooperativas y sus 11 centros de acopio
│   └── grant-admin.ts         # da permisos de admin a una dirección
├── locales/                   # textos de las notificaciones (en, es, om, am)
└── src/
    ├── index.ts               # app de Express y rutas
    ├── routes/                # endpoints
    ├── schemas/               # validación de entrada con zod
    ├── services/
    │   ├── app/               # lógica: auth, usuarios, caficultores, organizaciones, notificaciones
    │   ├── db/                # acceso a la base
    │   ├── onchain/           # cuentas de Stellar y llamadas al contrato traceability
    │   └── storage/           # archivos en Supabase Storage
    ├── lib/StellarContracts/  # cliente de Soroban: TxBuilder, TxSubmitter, eventos, direcciones
    ├── middleware/            # autenticación, roles, logging, errores
    └── bot/                   # bot propio de Telegram (ya no se usa, ver abajo)
```

**Modelos principales:**

| Modelo | Qué guarda |
|---|---|
| `User` | Personal que entra a la web: wallet, proveedor (Cavos o wallet propia), rol, organización, centro. |
| `Organization`, `CollectionCenter` | La unión, las cooperativas y sus centros de acopio, con el ID numérico que usa el contrato. |
| `Farmer` | Caficultor: ID de la cooperativa, datos personales, estado (`PRELOADED` → `LINKED` → `REGISTERED` → `CONSENTED`) y las transacciones on-chain. |
| `AuthNonce`, `RefreshToken`, `Session` | Login y sesiones. |
| `Notification` | Avisos para los usuarios de la web. |

## Puesta en marcha

Requisitos: Node.js 20+ y una base Postgres **nueva**. La migración inicial no es compatible con la base del marketplace.

```bash
npm install
cp .env.example .env
npx prisma migrate deploy    # crea las tablas
npm run db:seed              # unión, cooperativas y centros
npm run dev                  # http://localhost:4000
```

El primer admin se da desde la consola, después de que esa persona entró una vez a la web:

```bash
npm run admin:grant -- G…
```

### Variables de entorno

| Variable | Para qué |
|---|---|
| `DATABASE_URL`, `DIRECT_URL` | Postgres. Con Supabase, la primera va por el pooler y la segunda es la conexión directa para las migraciones. |
| `PORT`, `FRONTEND_URL`, `BACKEND_URL` | URLs. Si la web y la API están en dominios distintos, las cookies se emiten como cross-domain. |
| `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, `JWT_*_EXPIRY` | Sesiones. `JWT_ACCESS_SECRET` tiene que ser igual a `JWT_SECRET` de la webapp. |
| `STELLAR_NETWORK` | `testnet` o `mainnet`. |
| `STELLAR_ADMIN_SECRET` | Clave de la cuenta admin del contrato, que también paga los fees. Sale de `stellar keys show cofi-admin`. |
| `STELLAR_RPC_URL`, `STELLAR_HORIZON_URL` | Opcionales. Por defecto, los públicos de la red. |
| `STELLAR_TRACEABILITY_ADDRESS` | Opcional. Reemplaza la dirección del contrato de `src/lib/StellarContracts/deployments.ts`. |
| `SUPABASE_URL`, `SUPABASE_SECRET_KEY`, `SUPABASE_STORAGE_BUCKET` | Archivos (recibos, fotos, documentos). |
| `TELEGRAM_*` | Solo para el bot propio, que ya no se usa. |

### Scripts

| Comando | Qué hace |
|---|---|
| `npm run dev` | Servidor con recarga automática. |
| `npm run build` / `npm start` | Compila a `dist/` y lo corre. También hay un `dockerfile`. |
| `npm run prisma:migrate` | Crea una migración nueva en desarrollo. |
| `npm run prisma:studio` | Explorador de la base. |
| `npm run db:seed` | Carga organizaciones y centros. Se puede correr más de una vez. |
| `npm run admin:grant -- G…` | Da permisos de admin. |

## Endpoints

Todos bajo `/api`.

| Método y ruta | Quién | Qué hace |
|---|---|---|
| `POST /auth/nonce` | todos | Pide el mensaje a firmar. |
| `POST /auth/register_wallet` | todos | Verifica la firma e inicia sesión. Si el usuario usa una wallet propia y su cuenta Stellar no existe, la crea con Friendbot (solo en testnet; el backend no gasta saldo propio). |
| `POST /auth/refresh`, `POST /auth/logout` | sesión | Renueva o cierra la sesión. |
| `GET /auth/me` | sesión | Usuario actual con su rol, organización y centro. |
| `GET /auth/sessions`, `DELETE /auth/sessions[/:sessionId]` | sesión | Sesiones abiertas. |
| `GET /organizations` | sesión | Cooperativas y unión, con sus centros de acopio. |
| `GET /users`, `DELETE /users/:userId` | admin | Usuarios, filtrables por rol y organización. |
| `PATCH /users` | sesión | Edita el perfil propio (nombre, email). |
| `PATCH /users/:userId/admin` | admin | Da o quita permisos de admin. |
| `PUT /admin/users/:userId/role` | admin | Asigna un rol: lo escribe en el contrato y después en la base. |
| `DELETE /admin/users/:userId/role` | admin | Quita el rol en el contrato y en la base. |
| `GET /admin/farmers` | admin | Caficultores con filtros y conteo por estado. |
| `POST /admin/farmers/import` | admin | Importa la lista de una cooperativa (CSV como texto). |
| `GET /notifications?lang=` | sesión | Notificaciones del usuario en `en`, `es`, `om` o `am`. |
| `PATCH /notifications` | sesión | Marca notificaciones como leídas. |
| `POST /notifications` | admin | Crea una notificación. |
| `GET /config/stellar` | todos | Red, passphrase y dirección del contrato. |
| `GET /health` | todos | Estado del servicio. |

## Integración con VoiceLedger (en construcción)

Los caficultores no usan la web: hablan con un **bot de Telegram con voz que construye y opera VoiceLedger**. VoiceLedger convierte lo que dice el caficultor en JSON y nos lo envía. El backend:

1. verifica la firma HMAC y el timestamp del mensaje, y descarta los repetidos por `event_id`;
2. valida los datos, por ejemplo que el ID del caficultor esté en la lista de su cooperativa o que el GPS caiga en Gomma;
3. guarda el registro completo off-chain;
4. firma la acción on-chain con la **wallet de caficultores**, una cuenta del backend dedicada solo a eso, porque los caficultores no tienen wallet;
5. responde con el resultado y el enlace a la transacción, para que el bot se lo muestre al caficultor.

| Evento | Acción on-chain (contrato v1) |
|---|---|
| `farmer.linked` | `register_farmer` |
| `farmer.consent` | `record_consent` |
| `farmer.profile` | `set_profile` |
| `delivery.created` | `create_batch`; el número de lote `DD-MM-YYYY [FarmerID]` lo generamos nosotros |

De vuelta, avisamos a VoiceLedger (webhook firmado) cuando el Collector registra el peso o el lote cambia de etapa. El formato exacto se está acordando con VoiceLedger. La propuesta está en [`docs/plan-implementacion.md` §2.4](../docs/plan-implementacion.md#24-integración-con-voiceledger-caficultores).

**El bot propio (`src/bot/`)** es un prototipo de la semana 0, de antes de que VoiceLedger tomara el bot. Valida el ID del caficultor contra la lista. Ya no se usa: queda apagado mientras `TELEGRAM_BOT_TOKEN` esté vacío.

## Qué falta

Por semana del sprint (detalle en el [plan](../docs/plan-implementacion.md)):

- **Semana 1:** faucet de XLM de testnet para las wallets nuevas (`POST /wallet/fund`), wallet de caficultores, endpoint de integración con VoiceLedger, staging, y migrar la base a Supabase.
- **Semana 2:** cliente del contrato v1 y modelos `Batch`, `BatchEvent`, `Plot` y `Document`; eventos de VoiceLedger para consentimiento, perfil y entregas; simulador de VoiceLedger.
- **Semana 3:** endpoints de recepción (peso y recibo), avance de etapas, documentos, historial del lote y exportación a CSV; avisos hacia VoiceLedger.
- **Semana 4:** tests de permisos de cada rol contra cada endpoint en CI.
