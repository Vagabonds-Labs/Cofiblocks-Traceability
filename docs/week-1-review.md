# Week 1 review — Ethiopia pilot

Date: November 10, 2026. Code reviewed: branch `main`, commit `62fd428`.

> **Status update (November 10, 2026):** the five P1 findings (R1–R5) and the follow-up logout case for R3 have been fixed and verified against the local backend and database. The P2 findings (R6–R10) and the week 1 feature gaps are still open.

## Verdict and scope

**Week 1 is not fully implemented yet, even leaving out the Supabase migration.** There is a week 0 base: signature-based login with Cavos or an own wallet, sessions, role administration, farmer pre-loading and the v0 contract. Still missing are Cavos's automatic deployment and funding, the planned faucet, the farmer-agent wallet and the VoiceLedger integration. There are also security and deployment issues worth fixing before opening staging.

This review proposes changes; it does not modify the implementation, the database, the contracts or the Notion statuses. No migrations, payments, on-chain transactions or changes to real accounts were executed. Only this report was added. Week 1 is scheduled for November 16–20: this verdict describes code coverage, not a missed deadline.

## Sources and current decisions

- [Original Instawards SOW](https://docs.google.com/document/d/14SzCxn43ef255CJ6d7dBl9W0rHzhyKeOvIgeQTr401c/edit): read directly from the document linked in Notion. Its week 1 requires email login and a Stellar address that is created and funded automatically. The evidence includes staging and the repository.
- [Project in Notion](https://app.notion.com/p/410fc647d56d804facf0f680b5490a5c): context and long-term plan. It still has the earlier version with our own bot and voice out of the sprint.
- [Sprint tasks](https://app.notion.com/p/4f7ba79d521b4ad28c93089d9f03e91c): the week 0 and week 1 tasks and their descriptions were consulted. They explicitly reflect the November 10 change to a bot run by VoiceLedger. All ten tasks classified as week 1 are pending, which matches the main gaps in the code.
- [Week 1 answers](https://app.notion.com/p/414fc647d56d8125a4e7fbf819c0ff5d): hosting planned on Railway, Vercel and Supabase; it notes that Cavos can create wallets without a payment. This is a coordination answer, not proof that the flow is implemented.
- [EUDR data form](https://docs.google.com/document/d/1ptJ3NRANBaxvXA-h-v2kMxYjaFP_4FCOMKGQSnN4t9k/edit): read as context for privacy, location and data separation. Legal compliance is not assessed.
- [Project meeting](https://app.notion.com/p/40efc647d56d80899261f8e7abf7ce9a): historical context on participants and pilot operations.
- `docs/implementation-plan.md`, especially §2.3, §2.4 and week 1: reflects VoiceLedger and matches the updated tasks.

The SOW is used for the committed deliverable, and the updated tasks plus the local plan for the integration mechanism. Building our own bot is not required. Karla's flow document mentioned by the plan was not accessible as an independent source in this review; it is not assumed to have been read.

## Compliance matrix

| Requirement | Status in code | Evidence and gap |
|---|---|---|
| Cavos login with email and Telegram | Base implementation present | `webapp/lib/auth/cavos.ts`, `AppProviders.tsx`, `useCavosLogin.ts` and backend verification. The test task with the real App ID is done in Notion; a real authentication from a phone was not repeated. |
| Create the Cavos account on first login | Missing | `useCavosLogin.ts:143` lets the login complete with `isUndeployed`; it neither deploys nor funds. `auth.ts:144` excludes Cavos from account creation. |
| Faucet account and Friendbot top-up | Planned flow missing | `scripts/setup-testnet.sh` funds the admin; it does not set up a dedicated faucet with its top-up service. |
| `POST /wallet/fund`, one top-up per user | Missing | There is no wallet route mounted in `backend/src/index.ts`; `User` has no `fundedAt` or `fundTx`. This is a model and service gap, independent of where Postgres is hosted. |
| Funding own wallets with Friendbot | Different from the design | `OnChainAccountsService.ensureAccount` creates accounts by sending 1 XLM from the admin. It does not call Friendbot directly. *(Fixed: it now uses Friendbot, testnet only.)* |
| Address, balance and links on home/profile | Partial | Both screens show the address and an account link to Stellar Expert. They do not show the XLM balance or the funding transaction. |
| Separate `cofi-farmer-agent` wallet | Missing | The signing services use `STELLAR_ADMIN_SECRET`. There is no dedicated configuration or service for the agent. |
| VoiceLedger endpoint: HMAC, timestamp, `event_id` and storage | Missing | No routes, schemas, HMAC verifier or integration event model. The old bot does not replace this requirement. |
| `farmer.linked` registers on chain and returns a reference/tx | Missing | `linkTelegram` links in Postgres only. The v0 client and contract still require an individual address and an admin signature for `register_farmer`. |
| Staging and deliverable 1 evidence | Not verifiable as complete | Notion keeps them pending; no staging URL was found in the sources reviewed. There are Docker and cookie blockers described below. Hosting dashboards were not inspected. |
| Resolve week 2 questions | Coordination pending | Listed as a week 1 task; the fachasa conversion and minimum fields cannot be verified by compiling. Not counted as missing code. |

The full v1 contract, profiles, deliveries, documents, CSV and the full simulator belong to later weeks. Their absence is not penalized here, except for the minimal adaptation needed to register the farmer with the agent in week 1.

## Priority findings

P1: fix before publishing staging or enabling the affected flow. P2: fix while closing week 1 or before reusing the component involved. The conditions for each risk are stated explicitly.

### R1 · P1 · Public JWT secrets as a silent fallback

**Code:** `backend/src/services/app/JwtService.ts:10–14`; `backend/.env.example:51–52`.

If the secrets are missing, the service uses well-known strings from the repository. Copying the example without changing them has the same result. An attacker can sign an access token with `is_admin: true` and any `userId`; `authenticate` and `requireAdmin` accept it without checking that the user exists. The admin routes can then call into the backend that holds the contract's admin key.

**Verified:** in an isolated process with no secrets configured, a synthetic token was created with the public secret and passed both middlewares. It was not checked, and it is not claimed, that the real deployment uses those secrets.

**Change:** validate the configuration at startup and reject empty, example or weak values. Generate different random secrets for access and refresh; remove the public fallback in shared development too. Add a startup test that must fail without valid configuration.

### R2 · P1 · Session revocation without a proper owner check

**Code:** `backend/src/routes/auth.ts:88–96`; `backend/src/services/db/dbSessions.ts:43`.

The route receives a session UUID, but looks it up with `getSessionByRefreshToken(sessionId)`. Since it is not a refresh token, it returns `null`; the owner check is skipped and then the session is deleted by the received UUID. An authenticated user who knows the UUID of someone else's session can revoke it. The UUID is not predictable, but it must not act as authorization.

**Verified:** the real authentication, validation and handler were run with a mocked Prisma. A regular user got 200 and the deletion of the other user's session was called.

**Change:** look up/revoke by `{ id: sessionId, userId: req.user.userId }` and run the deletion of the session and refresh token in a transaction. Return 404/403 without modifying other users' rows. Test own, foreign and non-existent sessions.

### R3 · P1 · Revoking a session or removing admin leaves admin access in place

**Code:** `backend/src/middleware/auth.ts:37–51,99–111`; `backend/src/services/app/JwtService.ts:20–29`; `backend/src/services/app/UsersService.ts:103–110`.

Privileges come exclusively from the access token. The token does not include the session, and the middleware does not check whether it is still active, whether the user exists or whether they keep their permissions. Closing/revoking sessions or removing `isAdmin` does not invalidate issued tokens: they keep access until they expire, 10 minutes by default. A former admin can keep changing users and requesting role assignments signed by the backend.

**Verified:** a synthetic admin token kept passing authorization without any session/user query, even though a revoked state had been prepared in the database double.

**Change:** include `sessionId` and validate the active session and the current user; at a minimum, resolve current permissions on every admin action. An authorization or session version allows immediate invalidation without relying only on expiry. Test logout, revocation, user deletion and admin removal.

### R4 · P1 · Public sign-up spends the admin's balance without an application limit

**Code:** `backend/src/routes/auth.ts:137–147`; `backend/src/services/onchain/OnChainAccountsService.ts:33–51`; `backend/src/lib/StellarContracts/StellarClient.ts:21`.

Logging in with any valid key pair can create an account using 1 XLM from the admin. The reviewed code has no restriction to pilot participants, no budget and no request limit. Getting a nonce and signing it proves possession of a key that anyone can generate; it does not limit the number of sign-ups. The default network is mainnet if `STELLAR_NETWORK` is omitted.

On testnet it can temporarily drain the sponsor and block operations; if a funded key is configured on mainnet, it can spend real funds. No transactions were sent to test this, and no actual loss is claimed.

**Change:** for this pilot, explicitly require testnet, use Friendbot where appropriate and separate admin/faucet/agent. Limit the faucet's rate and budget. Persist the funding state and reserve it atomically before sending; store the hash to reconcile retries and timeouts. An in-memory flag does not cover multiple processes or restarts.

### R5 · P1 · The Dockerfile does not produce a deployable backend

**Code:** `backend/dockerfile:16–21,37–48`; `backend/package.json:16`; `backend/src/utils/notifications.ts:1–4`.

The builder copies `src` but omits `locales`, even though the JSON files are imported from that folder. The build fails. In addition, the final stage runs `npm ci` and the `postinstall: prisma generate` before copying the schema. Copying only `node_modules/@prisma` is not the same as copying the generated client in `node_modules/.prisma`.

**Verified:** the source structure copied by the builder was reproduced in `/tmp`, using the already-installed dependencies: TypeScript fails with four TS2307 errors for the missing JSON files. A full Docker build was not run; the additional install/generation problems were identified by reading the order of the instructions.

**Change:** copy the schema before installing, use `npm ci`, copy the translations for both the build and the runtime (the compiled references still point to `/app/locales`). Generate Prisma with the schema present in the final image, or copy its compatible artifacts correctly. Verify the image build and startup with a healthcheck before staging.

### R6 · P2 · Cookies incompatible with the default staging domains

**Code:** `backend/src/utils/authUtils.ts:8–24`; `webapp/middleware.ts:67`; `webapp/next.config.js:17–26`.

`cookieSameSite` is always `lax`, even when `ALLOW_CROSS_DOMAIN_COOKIES` is enabled. In production, `Domain` is always `.cofiblocks.com`. An API hosted on a default Railway domain cannot set cookies for that domain; with frontend and API on different sites, `lax` does not work for authenticated fetch calls either. The Next middleware needs to receive the cookie on the frontend's domain.

**Verified:** the function emits `SameSite=lax` even with cross-domain configuration. The browser effect depends on the chosen domains; a real staging login was not run. The domain and SameSite restrictions are documented in [Set-Cookie, MDN](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Set-Cookie).

**Change:** prefer `/api` through a same-origin proxy in staging/production too, with host-only cookies and no fixed domain. Another option is to set up compatible custom subdomains and test API and middleware together. Switching to `SameSite=None` is not enough: the frontend domain, CORS and protection of mutating requests also need to be solved. Replace the generic `*.vercel.app` allowance in development with explicit origins before sharing an environment with real data.

### R7 · P2 · Session renewal uses a different URL from the other requests

**Code:** `webapp/lib/api/api.ts:23,50–62`; `webapp/next.config.js:25–26`; `webapp/.env.example:2`.

With the example `NEXT_PUBLIC_API_URL=http://localhost:4000`, normal requests go to `/api/...` through the proxy, but refresh calls `http://localhost:4000/auth/refresh`, without `/api`. The backend only mounts `/api/auth/refresh`. When the access token expires, renewal fails even though the refresh token is valid. Adding `/api` to the variable does not unify the design either: the rewrite appends another `/api`.

**Verified:** running the real, transpiled API client with a mocked fetch showed `/api/auth/me` and then `http://localhost:4000/auth/refresh`.

**Change:** centralize a single URL resolution for every route, including refresh. Decide whether the variable is the origin or the API base and apply that definition to the rewrite too. Test a 401 response followed by a successful refresh and retry.

### R8 · P2 · The master key skips the Cavos signer check

**Code:** `backend/src/utils/stellarSignature.ts:126–139`; `backend/src/services/app/UsersService.ts:32–46`.

`signer === address` allows login without checking the account's state. If an existing account has disabled its master key or raised its thresholds, a signature from that key still gets web access. The own-wallet path also only verifies the cryptography locally. This matters for device recovery and multisig; it does not mean that any third party can forge a signature.

**Verified:** a valid synthetic message was signed with the master key, and an account response with weight 0 and threshold 2 was prepared. The verification accepted it without consulting that response. The possibility of lowering the master key's weight is covered in [SEP-10, Stellar](https://github.com/stellar/stellar-protocol/blob/master/ecosystem/sep-0010.md).

**Change:** for existing accounts, check signers and the threshold policy also when the master key is used, regardless of the provider the client claims. Allow the undeployed case only with an explicit first-sign-up policy and without enabling alternatives that bypass later recovery. Moving the whole login to SEP-10 is not required to fix this check.

### R9 · P2 · Deleting a user does not remove their role from the contract

**Code:** `backend/src/services/app/UsersService.ts:107–110,183–198`; `backend/src/routes/users.ts:65`.

`deleteUser` deletes data and sessions, but does not call `revokeRole`. A removed staff wallet keeps its on-chain permission and can call the contract directly. Web authentication does not stop a direct call to Stellar.

**Evidence:** reading the routes and services; no deletion or real invocation was performed.

**Change:** block deletion while a role exists, or implement a coordinated removal: deactivate the user, revoke on chain, store the hash/result and keep an auditable record. If the network fails, leave a pending removal that can be retried, without losing the address needed to revoke it.

### R10 · P2 · Concurrent writes race for the admin's sequence number

**Code:** `backend/src/services/onchain/OnChainAccountsService.ts:39–51`; `backend/src/lib/StellarContracts/TxBuilder.ts:92–106`.

Two operations load the same sequence separately and build the next transaction without coordinating. This affects concurrent sign-ups, role assignments and operations that share a source account. Account creation runs in the background and a failure only shows up in the logs; the user can sign in without a working account.

**Verified:** two concurrent calls to `ensureAccount`, with a mocked RPC, both built sequence `43` from `42`. They were not sent to Stellar.

**Change:** serialize preparation and submission per source account through a queue/worker coordinated across instances. On conflicts or uncertainty, check the hash before rebuilding. Expose a preparation and retry state to the user; do not treat a 504 as proof that a transaction did not happen.

## Caution when reusing the linking flow for VoiceLedger

`FarmersService.linkTelegram` reads the link outside the transaction and then updates by `id` only (`FarmersService.ts:255–295`). Two users trying to claim the same farmer can both read `telegramUserId=null`, and both writes can succeed: the second replaces the first. The `telegramUserId @unique` constraint stops one user from having two rows, but does not protect one row from two different users. This is a static finding; no concurrent test against Postgres was run.

Before reusing it, update with a condition on the current link, check the number of affected rows and coordinate any release of a previous link in the same transaction. For on-chain registrations that are already confirmed, avoid automatic identity changes. VoiceLedger's HMAC signature authenticates the integrator; verifying that whoever provides an ID is its owner must be agreed with the cooperative, because the pseudonymous ID alone is not a secret.

## What is on the right track

- Random, five-minute, single-use nonces, with conditional consumption to prevent concurrent reuse.
- ed25519 signatures and a clear separation between the Cavos message format and the Stellar wallet format.
- zod validation, pagination and admin protection on the management routes.
- Separation of personal data and public records in the traceability model.
- CSV import with per-line validation, dry-run mode and batched writes.
- v0 contract with tests for roles, authorization, cooperative, duplicates and transitions. Its 20 tests pass; they verify the v0 design, not the new agent-based design.

## Validation performed and limits

| Check | Result |
|---|---|
| `backend`: `npm run build` | Passes, including alias resolution. |
| `webapp`: `tsc --noEmit --incremental false` | Passes. |
| `webapp`: `npm run build` | Passes. Warnings about the middleware convention, jose compression APIs on Edge and an old Browserslist; no runtime failure was observed from them. |
| `contracts`: `cargo test --locked --offline` | 20 tests pass. |
| Isolated auth/API checks with mocked dependencies | Confirm R1, R2, R3, R6, R7 and R8 as described. |
| Concurrent build with a mocked RPC | Confirms the R10 sequence collision. |
| Compiling with the Docker builder's file structure | Fails with four TS2307 errors, confirming the first R5 blocker. |

There is no backend/frontend test suite configured in their `package.json`. The isolated review checks do not replace integration tests with Postgres, a real browser/Cavos and testnet. No deployment or external service status is certified. No pentest and no full audit of dependencies or of the future v1 contract was performed.

## Proposed order of work

1. Fix secrets, session ownership and privilege revocation; limit public funding and require testnet for the pilot.
2. Repair Docker and unify the proxy, cookies and refresh URL. Validate login, renewal and logout on the real staging domains.
3. Implement Cavos deployment and the faucet with persisted state, concurrency exclusion and hash reconciliation. Show address, balance and funding tx.
4. Introduce the farmer agent separate from the admin and adapt the minimal contract/client sign-up to `farmer_ref`.
5. Implement the `farmer.linked` event: HMAC over the raw body, timestamp, zod, storage and durable idempotency. Link atomically, store the transaction and always return the same result for retries. The same `event_id` with different content must be rejected.
6. Run the week 1 demo: email from a phone → account created and funded without intervention → balance and hash visible; VoiceLedger event → farmer registered on chain. Keep the evidence, and also test unauthorized, duplicate and concurrent requests.

The Supabase migration is excluded: these fixes and tests can be prepared with the temporary Postgres. VoiceLedger's JSON contract needs coordination, but it does not block defining and testing the receiving side against an agreed sample event.
