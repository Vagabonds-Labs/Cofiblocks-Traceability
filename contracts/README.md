# Contrato de trazabilidad (Soroban)

Un contrato en Rust sobre Stellar/Soroban, `traceability`, que registra:

- **Roles** del personal del piloto, cada uno dentro de una organización (una
  cooperativa o la unión).
- **Caficultores**: el vínculo entre su wallet y el ID seudónimo que les asigna la
  cooperativa, más el hash del consentimiento EUDR que firman ellos mismos.
- **Lotes** y su recorrido por las etapas, con quién hizo cada cambio, cuándo y el
  hash del registro completo de esa etapa.

En la cadena **no va ningún dato personal**: nombres, teléfonos, GPS, fotos y
documentos viven off-chain. Cada registro off-chain se resume en un SHA-256
(`data_hash`, `consent_hash`); recalcularlo y compararlo prueba que no se alteró.

## Roles y etapas

| Etapa | Quién la marca |
|---|---|
| `Received` (`create_batch`) | `Collector` |
| `Washing`, `Fermentation`, `Drying` | `IndustryManager` |
| `Storage` | `IndustryManager` o `StoreKeeper` |
| `InTransportToUnion` | `StoreKeeper` |
| `PreparedWithExportableBag`, `Sold` | `ExportManager` |

- Las etapas avanzan de a una. La única que se puede saltear es `Fermentation`
  (Washing → Drying), hasta que Etiopía confirme si es una etapa propia.
- El personal de una cooperativa sólo mueve lotes de su cooperativa. El Export
  Manager trabaja a nivel de unión y mueve lotes de cualquiera.
- `CommitteeMember` no mueve lotes: carga precios diarios, que van off-chain.
- Cada cuenta tiene un solo rol. Los asigna el admin (el backend).

## Funciones

| Función | Firma | Qué hace |
|---|---|---|
| `grant_role(account, role, org)` | admin | Asigna un rol de personal. |
| `revoke_role(account)` | admin | Quita el rol; si era caficultor, libera su `farmer_ref`. |
| `register_farmer(account, farmer_ref, coop)` | admin | Vincula la wallet del caficultor con su ID de cooperativa. |
| `record_consent(farmer, consent_hash)` | caficultor | Registra el consentimiento EUDR firmado. |
| `create_batch(actor, id, farmer_ref, collection_center, weight_grams, data_hash)` | collector | Crea el lote en `Received`. |
| `advance_stage(actor, id, stage, data_hash)` | rol de la etapa | Lleva el lote a la etapa siguiente. |
| `get_member`, `get_farmer`, `get_farmer_by_ref`, `get_batch`, `get_admin` | — | Lecturas. |
| `set_admin`, `upgrade` | admin | Administración. |

## Requisitos

```bash
cargo install --locked stellar-cli   # 28.x
rustup target add wasm32v1-none
```

## Test

```bash
cargo test --workspace
```

## Build

```bash
stellar contract build
```

Deja el WASM en `target/wasm32v1-none/release/traceability.wasm`.

## Despliegue

```bash
../scripts/setup-testnet.sh        # identidad admin fondeada
./scripts/deploy.sh testnet
```

El script compila, sube y despliega el contrato con la identidad
`STELLAR_ADMIN_IDENTITY` (por defecto `cofi-admin`) como admin, y escribe
`deployments/<network>.json`. La clave secreta de esa identidad es la que va en
`STELLAR_ADMIN_SECRET` del backend.
