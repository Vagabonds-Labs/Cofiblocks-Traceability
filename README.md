# CofiBlocks Traceability

> 🚧 **En construcción.** El proyecto está en pleno desarrollo: hay partes funcionando en Stellar Testnet y otras que todavía son plan. Nada de esto está listo para producción ni para datos reales.

Trazabilidad del café desde la finca hasta la exportación, verificable en [Stellar](https://stellar.org). El primer piloto se hace con cooperativas cafetaleras de la zona de Jimma (woreda de Gomma), en Etiopía.

---

## Por qué lo construimos

El café de pequeños productores pasa por muchas manos antes de exportarse: el caficultor lo entrega en un centro de acopio, la cooperativa lo lava, fermenta, seca y almacena, y la unión lo prepara y lo vende. Hoy ese recorrido se registra sobre todo en papel, y es difícil demostrar de dónde viene cada lote.

Esa demostración ya no es opcional. El **reglamento europeo contra la deforestación (EUDR)** exige que el café que entra a Europa pueda rastrearse hasta la parcela donde se cultivó, con la prueba de que no hubo deforestación después del 31 de diciembre de 2020. Si las cooperativas no pueden mostrarlo, pierden acceso a uno de sus mercados principales.

Con CofiBlocks Traceability queremos:

- **Que cada lote tenga un historial verificable:** quién lo entregó, cuánto pesó, por qué etapas pasó y quién hizo cada cambio, con la prueba en una blockchain pública que nadie puede reescribir.
- **Proteger a los caficultores:** sus nombres, teléfonos y ubicaciones nunca van a la cadena. On-chain solo hay identificadores seudónimos y huellas (hashes) de los registros.
- **Que funcione para quien lo usa:** los caficultores usan Telegram, con voz y en su idioma, sin wallets ni contraseñas. El personal de las cooperativas usa una web sencilla y entra con su email.
- **Darles a las cooperativas una herramienta propia** para generar los reportes que pide el EUDR, en vez de depender de intermediarios.

CofiBlocks empezó como un marketplace de café en Costa Rica. Este repositorio es el módulo de trazabilidad, que se prueba primero en Etiopía y después se adapta a Costa Rica.

## Cómo funciona

```
Caficultor ── Telegram + voz ──► Bot de VoiceLedger ── JSON ──► Backend ──► wallet de caficultores ──┐
                                                                  ▲                                   │
Personal de la cooperativa y de la unión ── Webapp ── firma ──────┘                                   ▼
                                                                          Contrato traceability (Stellar)
                                                                  │
                                                                  └──► Postgres + Supabase Storage (datos privados)
```

**Quién participa:**

| Actor | Canal | Qué hace |
|---|---|---|
| Caficultor | Bot de Telegram con voz, hecho por [VoiceLedger](#socios) | Se registra con el ID que le dio su cooperativa, firma el consentimiento EUDR, carga su finca y registra cada entrega. |
| Coffee Collector (centro de acopio) | Webapp | Registra el peso y el recibo de cada entrega. |
| Industry Manager y Store Keeper | Webapp | Avanzan el lote por lavado, fermentación, secado, almacenamiento y transporte a la unión. |
| Export Manager (unión) | Webapp | Registra la calidad, la preparación para exportar y la venta. Genera reportes. |
| Admin | Webapp | Asigna roles y carga la lista de caficultores de cada cooperativa. |

**Etapas del lote:** Entregado → Recibido (peso y recibo) → Lavado → Fermentación → Secado → Almacenamiento → En tránsito a la unión → Preparado con saco de exportación → Vendido.

**Qué queda en la cadena y qué no:**

- **On-chain:** el ID seudónimo del caficultor (por ejemplo `KK-ID001`), el número de lote, la etapa, quién hizo cada cambio y cuándo, el peso, y el hash de cada registro y documento.
- **Off-chain:** nombres, teléfonos, ubicaciones GPS, fotos y documentos. Viven en Postgres y Supabase Storage.

El backend recalcula el hash de cada registro y lo compara con el de Stellar. Así cualquiera puede comprobar que el dato no se alteró.

**Wallets sin fricción:**

- El personal entra con su email a través de [Cavos](https://cavos.xyz), que le crea una wallet de Stellar invisible: sin frases semilla ni extensiones. Quien ya tiene una wallet de Stellar (Freighter, xBull, Lobstr…) también puede usarla.
- Los caficultores no tienen wallet: en Telegram no se puede embeber una. Sus acciones las firma una wallet del backend dedicada solo a eso, y on-chain se identifican por su ID seudónimo.
- Nadie necesita XLM: el backend paga las comisiones de red (fee-bump).

## Plan y estado

El trabajo actual es un sprint de 4 semanas financiado por un **Instaward de Stellar** (del 16 de noviembre al 15 de diciembre de 2026). Comprende tres entregables:

1. **Login sin fricción y wallets invisibles:** email vía Cavos y wallets fondeadas automáticamente con XLM de testnet.
2. **Contratos inteligentes con permisos por rol:** la entrega del caficultor y el peso del collector son inmutables; después solo se avanza de etapa o se adjuntan documentos. Cualquier acción no autorizada la rechaza el contrato.
3. **Interfaz web:** cada rol ejecuta sus acciones, consulta el historial del lote, sube documentos y exporta CSV.

| Semana | Foco | Estado |
|---|---|---|
| 0 (9–13 nov) | Base del repo, contrato v0 en testnet, login con Cavos, roles y carga de caficultores, idiomas | ✅ Casi completa |
| 1 (16–20 nov) | Wallets invisibles con faucet, wallet de caficultores, integración con VoiceLedger, staging | ⏳ |
| 2 (23–27 nov) | Contrato v1 con todos los permisos y sus tests, entregas y perfil del caficultor | ⏳ |
| 3 (30 nov – 4 dic) | Web del flujo completo: peso, etapas, documentos, historial y CSV | ⏳ |
| 4 (7–11 dic) | Pruebas de punta a punta, tests en CI, demo y documentación | ⏳ |

El detalle (diseño, decisiones, preguntas abiertas y riesgos) está en [`docs/plan-implementacion.md`](docs/plan-implementacion.md).

**Después del sprint:** el piloto con unos 200 caficultores de 3 cooperativas, reportes EUDR en GeoJSON, polígonos de fincas grandes, precios diarios por cooperativa, un dashboard con indicadores y una página pública del lote con QR.

**Idiomas:** inglés, español, afaan oromo y amárico. Las traducciones al oromo y al amárico son un primer borrador y las tiene que revisar una persona nativa.

## Estructura del repositorio

| Carpeta | Qué hay | Detalle |
|---|---|---|
| [`contracts/`](contracts/) | Contrato `traceability` en Rust para Soroban (Stellar) | [README](contracts/README.md) |
| [`backend/`](backend/) | API en Express + Prisma/Postgres. Login, roles, caficultores, transacciones de Stellar e integración con VoiceLedger | [README](backend/README.md) |
| [`webapp/`](webapp/) | Web en Next.js para el personal de las cooperativas y la unión | [README](webapp/README.md) |
| [`scripts/`](scripts/) | Preparación del entorno de Stellar Testnet | `setup-testnet.sh` |
| [`docs/`](docs/) | Plan de implementación y notas de diseño | [Plan](docs/plan-implementacion.md) |

## Cómo correrlo en local

Requisitos: Node.js 20+, Postgres (local o Supabase), Rust con el target `wasm32v1-none` y el [CLI de Stellar](https://developers.stellar.org/docs/tools/cli).

1. **Identidad admin en testnet**, fondeada con Friendbot:

   ```bash
   ./scripts/setup-testnet.sh
   ```

2. **Contrato.** Ya hay uno desplegado en testnet. Para desplegar uno propio, mira [contracts/README.md](contracts/README.md).
3. **Backend** en `http://localhost:4000`. Ver [backend/README.md](backend/README.md).
4. **Webapp** en `http://localhost:3000`. Ver [webapp/README.md](webapp/README.md).

Contrato desplegado en testnet: [`CAFZUGHO…KB32Z`](https://stellar.expert/explorer/testnet/contract/CAFZUGHOGCYW2ULV4ZN62T5EC7IPYZXTBKVCA3QUKO3QWJHQ5X6KB32Z). Es la versión v0 y se va a reemplazar por la v1 en la semana 2.

## Socios

- **[Stellar Community Fund — Instawards](https://communityfund.stellar.org):** financia el sprint actual.
- **Welthungerhilfe (WHH):** acompaña el piloto en Etiopía.
- **VoiceLedger:** construye el bot de Telegram con voz para los caficultores y nos envía sus datos estructurados.
- **Cavos:** wallets invisibles y login con email y Telegram.

## Licencia

Todavía no hay una licencia definida. Se agrega antes de cerrar el sprint, junto con la documentación open source.
