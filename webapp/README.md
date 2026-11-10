# CofiBlocks Traceability — webapp

Next.js (App Router, next-intl, Tailwind) para el personal de las cooperativas y
de la unión. Los caficultores usan el bot de Telegram, no la web.

## Puesta en marcha

```bash
npm install
cp .env.example .env.local    # JWT_SECRET = JWT_ACCESS_SECRET del backend
npm run dev                   # http://localhost:3000
```

En desarrollo `/api/*` se redirige al backend (`NEXT_PUBLIC_API_URL`).

## Cavos

Con `NEXT_PUBLIC_CAVOS_APP_ID` aparece "Continuar con Telegram o email"; sin él,
sólo el login con wallet. En el dashboard de Cavos hay que:

- registrar los orígenes de la web (`http://localhost:3000`, staging), porque el
  vault de Cavos sólo carga en orígenes registrados;
- activar Telegram y email como métodos de login.

La configuración está en `lib/auth/cavos.ts`. **`appSalt` no se puede cambiar**
una vez que haya usuarios. El login lo cierra `hooks/auth/useCavosLogin.ts`
(firma el nonce del backend con la wallet de Cavos), y `CavosBridge` +
`services/wallet/cavosSigner.ts` dejan la wallet lista para firmar
transacciones (`signXdr`).

## Páginas

| Ruta | Quién | Qué muestra |
|---|---|---|
| `/` | todos | Sin sesión: presentación del piloto. Con sesión: rol, organización, tareas y cuenta Stellar. |
| `/login` | sin sesión | Login con Telegram o email (Cavos) o con una wallet de Stellar (Freighter, xBull, Albedo, Lobstr, Rabet). |
| `/profile` | sesión | Datos personales y acceso a la cuenta. |
| `/admin/users` | admin | Usuarios y asignación de roles (on-chain). |
| `/admin/farmers` | admin | Importación de la lista de caficultores y su estado en el bot. |

Idiomas: inglés y español (`locales/`). Afaan oromoo y amárico se suman cuando
el equipo local entregue las traducciones.
