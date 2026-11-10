# CofiBlocks Traceability — backend

API REST (Express + Prisma/Postgres) y bot de Telegram de los caficultores.

## Puesta en marcha

```bash
npm install
cp .env.example .env          # completar DATABASE_URL, STELLAR_ADMIN_SECRET, JWT_*
npx prisma migrate deploy     # crea las tablas
npm run db:seed               # unión, 3 cooperativas y sus centros de acopio
npm run dev                   # http://localhost:4000
```

El primer admin se da desde la consola, después de que entró una vez a la web:

```bash
npm run admin:grant -- G…
```

## Endpoints

| Método y ruta | Quién | Qué hace |
|---|---|---|
| `POST /api/auth/nonce`, `POST /api/auth/register_wallet` | todos | Login por firma: SEP-53 para wallets de Stellar, prefijo de Cavos con `provider: 'cavos'` (y `signer`, la control key). A quien no usa Cavos le crea la cuenta Stellar si no existe. |
| `GET /api/auth/me` | sesión | Usuario actual con su rol, organización y centro. |
| `GET /api/organizations` | sesión | Cooperativas y unión con sus centros de acopio. |
| `GET /api/users` | admin | Usuarios, filtrables por rol y organización. |
| `PUT /api/admin/users/:id/role` | admin | Asigna el rol: lo escribe en el contrato y después en la base. |
| `DELETE /api/admin/users/:id/role` | admin | Quita el rol en el contrato y en la base. |
| `GET /api/admin/farmers` | admin | Caficultores con filtros y conteo por estado. |
| `POST /api/admin/farmers/import` | admin | Importa la lista de la cooperativa (CSV como texto; `dryRun` para revisar). |
| `GET /api/config/stellar` | todos | Red, passphrase y dirección del contrato. |

## Bot de Telegram

`src/bot/`. Se enciende con `TELEGRAM_BOT_TOKEN`:

- Sin `TELEGRAM_WEBHOOK_URL` hace long polling (desarrollo local).
- Con `TELEGRAM_WEBHOOK_URL` y `TELEGRAM_WEBHOOK_SECRET` recibe los mensajes en
  `POST /api/telegram/webhook` (staging/producción).

v0: el caficultor elige idioma y cooperativa, escribe su ID y el bot lo vincula
con el caficultor que cargó la cooperativa. Los textos están en
`src/bot/messages.ts`; afaan oromoo y amárico caen en inglés hasta tener las
traducciones.

## Stellar

`src/lib/StellarContracts/` arma, simula y envía las transacciones del contrato
`traceability` (ver `contracts/README.md`). La cuenta `STELLAR_ADMIN_SECRET` es
el admin del contrato, paga los fees de los usuarios con fee-bump y crea sus
cuentas.
