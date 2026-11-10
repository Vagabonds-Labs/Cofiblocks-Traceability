# Webapp — CofiBlocks Traceability

Web en Next.js para el **personal de las cooperativas y de la unión**: collectors, encargados de procesamiento y almacén, el Export Manager y los administradores. Los caficultores no usan la web: hablan con el bot de Telegram de VoiceLedger (ver el [README general](../README.md)).

> 🚧 **Estado:** login, perfil, inicio según el rol y administración de usuarios y caficultores funcionan. Las pantallas de lotes (peso, etapas, documentos, historial y CSV) llegan en la semana 3 del sprint.

## Stack

- **Next.js 16** (App Router) y React 18.
- **next-intl** para los idiomas, con el idioma en la ruta (`/es/...`; inglés sin prefijo).
- **Tailwind CSS**.
- **[Cavos](https://cavos.xyz) (`@cavos/kit`)** para el login con email o Telegram y la wallet de Stellar invisible.
- **Stellar Wallets Kit** para quien entra con su propia wallet (Freighter, xBull, Albedo, Lobstr, Rabet).

## Páginas

| Ruta | Quién | Qué muestra |
|---|---|---|
| `/` | todos | Sin sesión: presentación del piloto. Con sesión: rol, organización, tareas del rol y cuenta de Stellar. |
| `/login` | sin sesión | Login con email o Telegram (Cavos), o con una wallet de Stellar. |
| `/profile` | sesión | Datos personales, dirección de Stellar y cómo se accede a la cuenta. |
| `/admin/users` | admin | Usuarios y asignación de roles. Cada cambio se escribe en el contrato. |
| `/admin/farmers` | admin | Importación de la lista de caficultores de cada cooperativa y su estado. |

**Próximas** (semana 3): entregas pendientes y registro de peso y recibo para el Collector; avance de etapas por rol; listado de lotes con filtros; página del lote con su historial verificable en Stellar; subida de documentos; exportación a CSV.

## Cómo firma el usuario

La web nunca arma transacciones. El backend arma y simula cada transacción, la web solo la firma, y el backend la envía con fee-bump (el backend paga la comisión).

- **Usuarios de Cavos:** firman con su wallet invisible (`signXdr`). La sesión de Cavos la mantiene `CavosBridge`, y la firma la hace `services/wallet/cavosSigner.ts`.
- **Usuarios con wallet propia:** firman con Stellar Wallets Kit (`services/wallet/walletService.ts`). Si la wallet conectada no es la de la sesión, se corta antes de firmar.

El login también es por firma: el backend manda un nonce, la wallet lo firma y el backend lo verifica (`hooks/auth/useCavosLogin.ts` y `useWalletLogin.ts`).

## Estructura

```
webapp/
├── app/[locale]/        # páginas (una carpeta por ruta) y layout con header, footer e idioma
├── components/          # auth, header, menu, profile, notifications, trace (enlaces a Stellar Expert), ui
├── hooks/               # lógica de cada pantalla (login, perfil, menú, notificaciones)
├── services/            # api/ (llamadas al backend), auth/, wallet/ (Cavos y Stellar Wallets Kit)
├── lib/                 # providers (usuario), config de Cavos, cliente HTTP (lib/api)
├── locales/             # textos: en.json, es.json, om.json, am.json
├── i18n.ts              # idiomas disponibles
└── middleware.ts        # idioma en la ruta y protección de /profile y /admin
```

## Puesta en marcha

```bash
npm install
cp .env.example .env.local
npm run dev                  # http://localhost:3000
```

Necesita el backend corriendo (ver [backend/README.md](../backend/README.md)). En desarrollo, `/api/*` se redirige al backend (`NEXT_PUBLIC_API_URL`).

| Variable | Para qué |
|---|---|
| `NEXT_PUBLIC_API_URL` | URL del backend. |
| `NEXT_PUBLIC_STELLAR_NETWORK` | `testnet` o `mainnet`: la red en la que firman las wallets. |
| `NEXT_PUBLIC_ENV` | `development` o `production`. En producción no se usa el proxy de `/api`. |
| `JWT_SECRET` | Igual a `JWT_ACCESS_SECRET` del backend. El middleware la usa para leer el rol del token y proteger `/profile` y `/admin`. |
| `NEXT_PUBLIC_CAVOS_APP_ID` | App de Cavos. Si está vacío, solo aparece el login con wallet. |
| `NEXT_PUBLIC_CAVOS_ENVIRONMENT` | Entorno de la consola de Cavos: `production` (por defecto) o `development`. |

### Cavos

En el dashboard de Cavos hay que:

- registrar los orígenes de la web (`http://localhost:3000`, staging…), porque el vault de Cavos solo carga en orígenes registrados;
- agregar las URLs de callback del login (`/login` y sus variantes por idioma, como `/es/login`);
- activar email y Telegram como métodos de login.

La configuración está en `lib/auth/cavos.ts`. **El `appSalt` no se puede cambiar** una vez que hay usuarios: nombra el lugar donde cada dispositivo guarda su clave, y si cambia, todos los usuarios quedan esperando aprobar su dispositivo.

## Idiomas

Inglés (por defecto), español, afaan oromo (`om`) y amárico (`am`).

- El idioma se elige en el header y se guarda en una cookie.
- El amárico usa la fuente Noto Sans Ethiopic, porque Manrope no tiene su escritura.
- Los textos en oromo y amárico son un primer borrador y los tiene que revisar una persona nativa.
- Para agregar un texto: la misma clave en los cuatro archivos de `locales/`.
