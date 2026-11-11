# VoiceLedger integration — proposal

> **Status:** proposal for VoiceLedger to review. `farmer.linked` is implemented and running against Stellar Testnet. `farmer.consent`, `farmer.profile` and `delivery.created` are defined here so both sides can build in parallel; our side implements them in week 2 (Nov 23–27) and returns `422 UNSUPPORTED_EVENT` until then.

## Who does what

- **VoiceLedger** runs the farmers' Telegram bot: the conversation, voice recognition in the local languages (Afaan Oromoo, Amharic), the bot's texts and translations. It turns what the farmer says or types into the JSON events below and sends them to us.
- **CofiBlocks** receives the events, checks them against the cooperatives' data, stores the full record privately and writes the on-chain record on Stellar. Farmers have no wallet: a CofiBlocks backend account (the *farmer agent*) signs every farmer action. On chain, a farmer is only their pseudonymous `farmer_ref` (e.g. `KK-ID001`); names, phone numbers and GPS points never go on chain.

## Transport

- **Endpoint:** `POST {API}/api/integrations/voiceledger/events`, one event per request, `Content-Type: application/json`.
- **Status of an event:** `GET {API}/api/integrations/voiceledger/events/{event_id}`.
- **Environments:** a staging URL and a per-environment secret will be shared privately. Locally: `http://localhost:4000`.

### Authentication

Every request (including `GET`) carries two headers:

| Header | Value |
|---|---|
| `X-VoiceLedger-Timestamp` | Unix time in seconds when the request was signed. |
| `X-VoiceLedger-Signature` | `sha256=` + hex of `HMAC-SHA256(secret, "<timestamp>.<METHOD>.<path>.<raw body>")`. |

- `METHOD` is upper case (`POST`, `GET`). `path` is the request path exactly as sent, with the query string if any (e.g. `/api/integrations/voiceledger/events`). For `GET`, the body is empty.
- Signing the method and the path means a captured request cannot be pointed at another route or another event.
- Requests more than **5 minutes** away from our clock are rejected (`STALE_TIMESTAMP`), so a captured request cannot be replayed later.
- Sign the exact bytes you send. Example in Node.js:

  ```js
  const path = '/api/integrations/voiceledger/events';
  const body = JSON.stringify(event);
  const timestamp = String(Math.floor(Date.now() / 1000));
  const signature = 'sha256=' + crypto.createHmac('sha256', secret)
    .update(`${timestamp}.POST.${path}.`).update(body).digest('hex');
  ```

- Authentication errors use HTTP `401` with `code` `MISSING_SIGNATURE`, `STALE_TIMESTAMP` or `INVALID_SIGNATURE`; `503 INTEGRATION_DISABLED` means the secret is not configured on our side.

The signature proves the request comes from VoiceLedger. It does not prove that the person behind a Telegram account owns the cooperative ID they typed; that check is agreed with each cooperative.

### Retries and idempotency

Every event has an `event_id` chosen by VoiceLedger (a UUID is fine).

- **Retry with the same `event_id`** (timeouts, 5xx, network errors): we return the stored answer and do not write on chain again. A retry may re-serialize the JSON or refresh `occurred_at`; only `type` and `data` are compared.
- **Same `event_id` with a different `type` or `data`:** rejected with `409 EVENT_ID_REUSED`.
- **A new farmer action** (for example the farmer types their ID again after a mistake) needs a **new** `event_id`.
- Business errors (4xx) are final for that `event_id`. Server errors (5xx) are retried when the same `event_id` arrives again.
- `503 REGISTRATION_PENDING` means the on-chain transaction was sent but is not confirmed yet: retry the same `event_id` a minute later. We never send a second transaction for it until the network proves the first one never landed.
- `503 STELLAR_RPC_UNAVAILABLE` and `503 TRANSACTION_NOT_FOUND` mean the Stellar network could not be read at that moment: retry the same `event_id` later.
- If two copies arrive at the same time, one is processed and the other gets `202` with `"status": "processing"`; check `GET …/events/{event_id}` a few seconds later.

## Envelope

```json
{
  "event_id": "9b2f3c1e-7d1a-4c55-9a51-2f0f4f6f8a10",
  "type": "farmer.linked",
  "occurred_at": "2026-11-16T09:30:00Z",
  "data": { }
}
```

| Field | Type | Notes |
|---|---|---|
| `event_id` | string, 1–128 | VoiceLedger's ID for the event. |
| `type` | string | One of the event types below. |
| `occurred_at` | ISO 8601, optional | When it happened on VoiceLedger's side. Informational. |
| `data` | object | Depends on `type`. |

## Responses

Success (`200`):

```json
{
  "event_id": "9b2f3c1e-7d1a-4c55-9a51-2f0f4f6f8a10",
  "type": "farmer.linked",
  "status": "succeeded",
  "result": { }
}
```

Failure (`4xx`/`5xx`):

```json
{
  "event_id": "9b2f3c1e-7d1a-4c55-9a51-2f0f4f6f8a10",
  "type": "farmer.linked",
  "status": "failed",
  "error": { "code": "FARMER_NOT_FOUND", "message": "Farmer ID ID999 is not on KK's list" }
}
```

`error.code` is stable; use it to decide what the bot tells the farmer. `error.message` is for logs, not for farmers. `INVALID_PAYLOAD` includes a `details` array with the fields that failed validation.

## Events

### `farmer.linked` — implemented

The farmer identified themselves in the bot with the ID their cooperative gave them. We check the ID against the cooperative's list, link it to the Telegram account and register the farmer on chain.

`data`:

| Field | Type | Notes |
|---|---|---|
| `coop_code` | string | Cooperative code: `KK` (Kilole Kirkir), `DM` (Dandi Misoma) or `KN` (Kananisa). Case-insensitive. |
| `farmer_id` | string | The ID as typed or dictated. Spaces and case are normalized (`" id001 "` → `ID001`). |
| `telegram_user_id` | string of digits | Telegram's numeric user ID, as a string (it can exceed JS's safe integer range). |
| `telegram_username` | string, optional | |
| `language` | string, optional | Language used in the bot: `om`, `am` or `en`. |

`result`:

```json
{
  "farmer_ref": "KK-ID001",
  "coop_code": "KK",
  "tx_hash": "c511e6a2…683c",
  "explorer_url": "https://stellar.expert/explorer/testnet/tx/c511e6a2…683c",
  "already_linked": false
}
```

The bot can show `explorer_url` to the farmer as proof of registration. Sending `farmer.linked` again for an already linked farmer and the same Telegram account returns the same `tx_hash` with `already_linked: true`.

| Error code | HTTP | Meaning for the bot |
|---|---|---|
| `COOP_NOT_FOUND` | 404 | Unknown cooperative code. |
| `FARMER_NOT_FOUND` | 404 | The ID is not on that cooperative's list: ask the farmer to check it, or to contact the cooperative. |
| `FARMER_REF_TAKEN` | 409 | That ID is already linked to another Telegram account: the cooperative has to resolve it. |
| `TELEGRAM_ALREADY_LINKED` | 409 | This Telegram account is already linked to another farmer: the cooperative has to resolve it. |
| `INVALID_PAYLOAD` | 400 | A field is missing or invalid (see `details`). |

### `farmer.consent` — week 2

The farmer accepted the EUDR consent and its declarations. CofiBlocks defines the consent text and its versions in the three languages and shares them with VoiceLedger; the bot shows them and sends back what was accepted. We store it and record its hash on chain.

```json
{
  "farmer_ref": "KK-ID001",
  "consent_version": "2026-11-v1",
  "language": "om",
  "accepted": true,
  "declarations": {
    "data_processing": true,
    "no_deforestation_since_2020_12_31": true,
    "information_is_accurate": true
  },
  "transcript": "optional text of what the farmer said",
  "audio_ref": "optional VoiceLedger reference to the recording"
}
```

### `farmer.profile` — week 2

Farm profile and practices. Editable: each new version is another `farmer.profile` event with a new `event_id`.

```json
{
  "farmer_ref": "KK-ID001",
  "full_name": "optional",
  "household_size": 5,
  "plots": [
    {
      "name": "Plot 1",
      "size": { "value": 1.5, "unit": "fachasa" },
      "location": { "lat": 7.86, "lng": 36.62, "source": "shared" }
    }
  ],
  "practices": { "shade_trees": true, "fertilizer": "compost" },
  "transcript": "optional",
  "audio_ref": "optional"
}
```

- `location.source`: `shared` (Telegram "Share location"), `typed` or `dictated`. We check that the point falls inside Gomma woreda and reject it otherwise, so the bot can ask the farmer to confirm.
- We convert fachasa to hectares on our side. The minimum fields and the practices to ask are still being agreed with the cooperatives.

### `delivery.created` — week 2

The farmer delivered coffee at a collection center. We generate the batch number and record the delivery on chain; the Collector later records the weight and receipt in the web app.

```json
{
  "farmer_ref": "KK-ID001",
  "collection_center": "Kirkir",
  "estimated_kg": 45,
  "ripeness": "ripe",
  "transcript": "optional",
  "audio_ref": "optional"
}
```

`result` will include `batch_id` (format `DD-MM-YYYY KK-ID001`), `tx_hash` and `explorer_url`.

## Notifications back to VoiceLedger (proposal)

When the Collector records the weight or a batch changes stage, we would call a VoiceLedger webhook so the bot can tell the farmer (for example "Your batch 01-12-2026 KK-ID001 was received at Kirkir: 45 kg"). We would sign it with the same HMAC scheme. If VoiceLedger prefers polling, we can expose a farmer's batches instead.

## Open questions for VoiceLedger

1. Do the transport, signature and idempotency rules work for you?
2. When will the bot be available on a staging environment?
3. Will you send the transcript and/or a reference to the audio? We store them off chain as backup evidence.
4. Notifications: webhook or polling?
5. Which languages does the voice recognition support today?

## Testing it locally

With the backend running, sign and send an event exactly as the bot would:

```bash
npm run voiceledger:send -- farmer.linked '{"coop_code":"KK","farmer_id":"ID001","telegram_user_id":"123456789"}'
npm run voiceledger:send -- --status <event_id>
```
