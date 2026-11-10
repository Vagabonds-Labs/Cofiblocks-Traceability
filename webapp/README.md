# Web app — CofiBlocks Traceability

Next.js web app for **cooperative and union staff**: collectors, processing and warehouse managers, the Export Manager and administrators. Farmers do not use the web app: they talk to VoiceLedger's Telegram bot (see the [main README](../README.md)).

> 🚧 **Status:** login, profile, role-based home page and user and farmer administration work. The batch screens (weight, stages, documents, history and CSV) arrive in week 3 of the sprint.

## Stack

- **Next.js 16** (App Router) and React 18.
- **next-intl** for languages, with the language in the route (`/es/...`; English has no prefix).
- **Tailwind CSS**.
- **[Cavos](https://cavos.xyz) (`@cavos/kit`)** for email or Telegram login and the invisible Stellar wallet.
- **Stellar Wallets Kit** for people who sign in with their own wallet (Freighter, xBull, Albedo, Lobstr, Rabet).

## Pages

| Route | Who | What it shows |
|---|---|---|
| `/` | anyone | Signed out: pilot overview. Signed in: role, organization, the role's tasks and the Stellar account. |
| `/login` | signed out | Login with email or Telegram (Cavos), or with a Stellar wallet. |
| `/profile` | session | Personal details, Stellar address and how the account is accessed. |
| `/admin/users` | admin | Users and role assignment. Each change is written to the contract. |
| `/admin/farmers` | admin | Upload of each cooperative's farmer list, and their status. |

**Coming next** (week 3): pending deliveries and weight and receipt recording for the Collector; stage changes per role; batch list with filters; batch page with its history verifiable on Stellar; document upload; CSV export.

## How users sign

The web app never builds transactions. The backend builds and simulates each transaction, the web app only signs it, and the backend submits it with fee-bump (the backend pays the fee).

- **Cavos users:** sign with their invisible wallet (`signXdr`). `CavosBridge` keeps the Cavos session alive, and `services/wallet/cavosSigner.ts` does the signing.
- **Users with their own wallet:** sign with Stellar Wallets Kit (`services/wallet/walletService.ts`). If the connected wallet is not the session's wallet, signing stops before it starts.

Login is signature-based too: the backend sends a nonce, the wallet signs it and the backend verifies it (`hooks/auth/useCavosLogin.ts` and `useWalletLogin.ts`).

## Layout

```
webapp/
├── app/[locale]/        # pages (one folder per route) and the layout with header, footer and language
├── components/          # auth, header, menu, profile, notifications, trace (Stellar Expert links), ui
├── hooks/               # per-screen logic (login, profile, menu, notifications)
├── services/            # api/ (backend calls), auth/, wallet/ (Cavos and Stellar Wallets Kit)
├── lib/                 # providers (user), Cavos config, HTTP client (lib/api)
├── locales/             # texts: en.json, es.json, om.json, am.json
├── i18n.ts              # available languages
└── middleware.ts        # language in the route and protection of /profile and /admin
```

## Getting started

```bash
npm install
cp .env.example .env.local
npm run dev                  # http://localhost:3000
```

It needs the backend running (see [backend/README.md](../backend/README.md)). In development, `/api/*` is proxied to the backend (`NEXT_PUBLIC_API_URL`).

| Variable | Purpose |
|---|---|
| `NEXT_PUBLIC_API_URL` | Backend URL. |
| `NEXT_PUBLIC_STELLAR_NETWORK` | `testnet` or `mainnet`: the network wallets sign for. |
| `NEXT_PUBLIC_ENV` | `development` or `production`. The `/api` proxy is not used in production. |
| `JWT_SECRET` | Same value as the backend's `JWT_ACCESS_SECRET`. The middleware uses it to read the role from the token and protect `/profile` and `/admin`. |
| `NEXT_PUBLIC_CAVOS_APP_ID` | Cavos app. If empty, only wallet login is shown. |
| `NEXT_PUBLIC_CAVOS_ENVIRONMENT` | Cavos console environment: `production` (default) or `development`. |

### Cavos

In the Cavos dashboard you need to:

- register the web app's origins (`http://localhost:3000`, staging…), because the Cavos vault only loads on registered origins;
- add the login callback URLs (`/login` and its per-language variants, such as `/es/login`);
- enable email and Telegram as login methods.

The configuration is in `lib/auth/cavos.ts`. **`appSalt` cannot change** once there are users: it names the place where each device stores its key, and if it changes, every user is left waiting to approve their device.

## Languages

English (default), Spanish, Afaan Oromoo (`om`) and Amharic (`am`).

- The language is chosen in the header and saved in a cookie.
- Amharic uses the Noto Sans Ethiopic font, because Manrope does not include its script.
- The Oromo and Amharic texts are a first draft and need review by a native speaker.
- To add a text: use the same key in all four files in `locales/`.
