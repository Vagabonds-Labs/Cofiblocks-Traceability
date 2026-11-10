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

## Páginas

| Ruta | Quién | Qué muestra |
|---|---|---|
| `/` | todos | Sin sesión: presentación del piloto. Con sesión: rol, organización, tareas y cuenta Stellar. |
| `/login` | sin sesión | Login (Privy o wallet de Stellar, hasta integrar Cavos). |
| `/profile` | sesión | Datos personales y acceso a la cuenta. |
| `/admin/users` | admin | Usuarios y asignación de roles (on-chain). |
| `/admin/farmers` | admin | Importación de la lista de caficultores y su estado en el bot. |

Idiomas: inglés y español (`locales/`). Afaan oromoo y amárico se suman cuando
el equipo local entregue las traducciones.
