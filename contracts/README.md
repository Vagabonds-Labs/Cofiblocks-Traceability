# Contratos — CofiBlocks Traceability

Contrato `traceability` en Rust para [Soroban](https://developers.stellar.org/docs/build/smart-contracts/overview), la plataforma de contratos inteligentes de Stellar. Es la fuente de verdad pública del sistema: quién tiene qué rol, qué caficultores están registrados y por qué etapas pasó cada lote.

> 🚧 **Estado:** la **v0** está desplegada en testnet y es la que usa hoy el backend. La **v1**, que cumple todo el alcance del Instaward, se construye en la semana 2 (23–27 nov). Más abajo están las dos.

## Qué registra

- **Roles del personal**, cada uno dentro de una organización (una cooperativa o la unión).
- **Caficultores**, identificados por un ID seudónimo (`farmer_ref`, por ejemplo `KK-ID001`), con su cooperativa y el hash de su consentimiento EUDR.
- **Lotes** y su recorrido por las etapas: quién hizo cada cambio, cuándo, y el hash del registro completo de esa etapa.

**En la cadena no va ningún dato personal.** Nombres, teléfonos, GPS, fotos y documentos viven off-chain, en el backend. Cada registro off-chain se resume en un SHA-256 (`data_hash`, `consent_hash`): si alguien recalcula el hash y coincide, el registro no se alteró.

## Estructura

```
contracts/
├── Cargo.toml                 # workspace (soroban-sdk 27)
├── traceability/src/
│   ├── lib.rs                 # funciones públicas del contrato
│   ├── types.rs               # Role, Stage, Member, Farmer, Batch y los errores
│   ├── storage.rs             # lectura y escritura del estado
│   ├── events.rs              # eventos que emite cada función
│   └── test.rs                # tests
├── scripts/deploy.sh          # build + deploy, y escribe deployments/<red>.json
└── deployments/testnet.json   # dirección del contrato que lee el backend
```

## v0 (desplegada)

En testnet: [`CAFZUGHOGCYW2ULV4ZN62T5EC7IPYZXTBKVCA3QUKO3QWJHQ5X6KB32Z`](https://stellar.expert/explorer/testnet/contract/CAFZUGHOGCYW2ULV4ZN62T5EC7IPYZXTBKVCA3QUKO3QWJHQ5X6KB32Z). El admin es la identidad `cofi-admin`, que es la cuenta del backend.

### Funciones

| Función | Quién firma | Qué hace |
|---|---|---|
| `grant_role(account, role, org)` | admin | Asigna un rol de personal. |
| `revoke_role(account)` | admin | Quita el rol. Si era caficultor, libera su `farmer_ref`. |
| `register_farmer(account, farmer_ref, coop)` | admin | Vincula una wallet de caficultor con su ID de cooperativa. |
| `record_consent(farmer, consent_hash)` | caficultor | Registra el consentimiento EUDR. |
| `create_batch(actor, id, farmer_ref, collection_center, weight_grams, data_hash)` | Collector | Crea el lote en la etapa `Received`. |
| `advance_stage(actor, id, stage, data_hash)` | el rol de la etapa | Lleva el lote a la etapa siguiente. |
| `get_member`, `get_farmer`, `get_farmer_by_ref`, `get_batch`, `get_admin` | — | Lecturas. |
| `set_admin`, `upgrade` | admin | Administración. |

### Etapas y roles

| Etapa | Quién la marca |
|---|---|
| `Received` (con `create_batch`) | `Collector` |
| `Washing`, `Fermentation`, `Drying` | `IndustryManager` |
| `Storage` | `IndustryManager` o `StoreKeeper` |
| `InTransportToUnion` | `StoreKeeper` |
| `PreparedWithExportableBag`, `Sold` | `ExportManager` |

- Las etapas avanzan de a una. La única que se puede saltear es `Fermentation` (Washing → Drying), hasta que Etiopía confirme si es una etapa propia.
- El personal de una cooperativa solo mueve lotes de su cooperativa. El Export Manager trabaja a nivel de la unión y mueve lotes de cualquiera.
- `CommitteeMember` no mueve lotes: carga precios diarios, que van off-chain.
- Cada cuenta tiene un solo rol.

### Eventos

`role_granted`, `role_revoked`, `farmer_registered`, `consent_recorded`, `batch_created` y `stage_advanced`. El backend los usa para reconstruir el historial y enlazar cada cambio con su transacción.

### Errores

| Código | Error | Cuándo |
|---|---|---|
| 1 | `NotInitialized` | El contrato no tiene admin. |
| 2 | `NotAMember` | La cuenta no tiene rol. |
| 3 | `Unauthorized` | El rol no permite la operación. |
| 4 | `WrongOrganization` | El lote es de otra cooperativa. |
| 5 | `UseRegisterFarmer` | Se intentó dar el rol de caficultor con `grant_role`. |
| 6 | `FarmerNotFound` | No existe el caficultor. |
| 7 | `FarmerRefTaken` | Ese `farmer_ref` ya está vinculado a otra wallet. |
| 8 | `BatchAlreadyExists` | Ya existe un lote con ese ID. |
| 9 | `BatchNotFound` | No existe el lote. |
| 10 | `InvalidTransition` | La etapa no puede seguir a la actual. |
| 11 | `InvalidWeight` | El peso no es válido. |
| 12 | `InvalidId` | ID vacío o demasiado largo. |

## v1 (en construcción)

Cambios frente a la v0, para cumplir el alcance del Instaward:

- **Los caficultores no tienen wallet.** Sus acciones las firma una única **wallet de caficultores** del backend, que el admin configura con `set_farmer_agent`. On-chain, el caficultor es solo su `farmer_ref`.
- **El lote lo crea el caficultor** (su entrega), no el Collector. El lote nace en una etapa nueva, `Delivered`, y ese registro es inmutable.
- **El Collector registra el peso y el recibo una sola vez** (`record_reception`). El lote pasa a `Received`.
- **El perfil de la finca es editable** (`set_profile`). Cada versión deja su hash en un evento.
- **Documentos adjuntos** al lote (`attach_document`).

| Función nueva o cambiada | Quién firma |
|---|---|
| `set_farmer_agent(address)` | admin |
| `register_farmer(farmer_ref, coop)`, `record_consent(farmer_ref, hash)`, `set_profile(farmer_ref, hash)` | wallet de caficultores |
| `create_batch(batch_id, farmer_ref, center, data_hash)` | wallet de caficultores |
| `record_reception(collector, batch_id, weight_grams, receipt_hash, data_hash)` | Collector de la cooperativa del lote |
| `attach_document(actor, batch_id, doc_hash)` | un rol de la cooperativa del lote, o el Export Manager |

Los tests de permisos de la v1 son parte de la evidencia del Instaward. Cada uno de estos casos tiene que ser rechazado:

- una cuenta cualquiera crea un lote o registra el peso;
- un Collector de otra cooperativa registra el peso;
- se registra el peso dos veces;
- se crea un lote con un ID que ya existe;
- se retrocede o se salta una etapa;
- un rol mueve una etapa que no le toca;
- la wallet de caficultores hace algo del personal;
- alguien que no es el admin asigna roles.

El diseño completo está en [`docs/plan-implementacion.md` §2.2](../docs/plan-implementacion.md#22-contrato-traceability-v1).

## Desarrollo

**Requisitos:**

```bash
rustup target add wasm32v1-none
cargo install --locked stellar-cli
```

**Tests** (20 en la v0):

```bash
cargo test --workspace
```

**Build.** Deja el WASM en `target/wasm32v1-none/release/traceability.wasm`:

```bash
stellar contract build
```

**Despliegue.** Primero hace falta una identidad admin fondeada:

```bash
../scripts/setup-testnet.sh
```

Después se despliega:

```bash
./scripts/deploy.sh testnet
```

El script compila, sube y despliega el contrato con la identidad `STELLAR_ADMIN_IDENTITY` (por defecto `cofi-admin`) como admin, y escribe `deployments/<red>.json`.

- La clave secreta de esa identidad va en `STELLAR_ADMIN_SECRET` del backend. Se obtiene con `stellar keys show cofi-admin`.
- Los IDs numéricos de las organizaciones (cooperativas 1 a 3, unión 100, centros 11 a 34) los fija el seed del backend y no se pueden cambiar una vez que hay lotes.
