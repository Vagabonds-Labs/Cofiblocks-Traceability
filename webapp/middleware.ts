import { NextRequest, NextResponse } from 'next/server'
import createIntlMiddleware from 'next-intl/middleware'
import { locales, defaultLocale } from './i18n'
import { jwtVerify } from 'jose'

const intlMiddleware = createIntlMiddleware({
  locales,
  defaultLocale,
  localePrefix: 'as-needed',
  localeDetection: false
})

const authenticatedRoutes = ['/profile']
const notAuthenticatedRoutes = ['/login']

const enum RouteType {
  ADMIN = 'admin',
  AUTHENTICATED = 'authenticated',
  NOT_AUTHENTICATED = 'not_authenticated',
  PUBLIC = 'public',
}

const localePrefixPattern = new RegExp(`^/(${locales.join('|')})(?=/|$)`)

/**
 * Prefijo de idioma de la ruta (`/es`) o vacío para el idioma por defecto.
 *
 * Hay que sacarlo antes de clasificar la ruta: con `localePrefix: 'as-needed'`
 * la misma página vive en `/profile` y en `/es/profile`, y comparar la ruta
 * cruda dejaba todas las rutas con prefijo como públicas.
 */
const localePrefixOf = (pathname: string) => pathname.match(localePrefixPattern)?.[0] ?? ''

const routeType = (pathname: string) => {
  const path = pathname.slice(localePrefixOf(pathname).length) || '/'
  if (path.startsWith('/admin')) {
    return RouteType.ADMIN
  } else if (authenticatedRoutes.includes(path)) {
    return RouteType.AUTHENTICATED
  } else if (notAuthenticatedRoutes.includes(path)) {
    return RouteType.NOT_AUTHENTICATED
  } else {
    return RouteType.PUBLIC
  }
}

/** Redirige conservando el idioma en el que venía el usuario. */
const redirectTo = (req: NextRequest, path: string) =>
  NextResponse.redirect(new URL(`${localePrefixOf(req.nextUrl.pathname)}${path}`, req.url))

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl
  const route_type = routeType(pathname)
  if (route_type === RouteType.PUBLIC) {
    return intlMiddleware(req)
  }

  // 2️⃣ Auth
  const token = req.cookies.get('accessToken')?.value
  if (!token) {
    if (route_type === RouteType.NOT_AUTHENTICATED) {
      return intlMiddleware(req)
    }
    return redirectTo(req, '/login')
  }

  const jwtSecret = process.env.JWT_SECRET
  if (!jwtSecret) {
    // Sin clave ningún token verifica y toda ruta protegida termina en /login.
    // Tiene que ser la misma que JWT_ACCESS_SECRET del backend.
    console.error('JWT_SECRET is not set: protected routes will always redirect to /login')
  }

  try {
    const secret = new TextEncoder().encode(jwtSecret ?? '')
    const { payload } = await jwtVerify(token, secret)

    if (route_type === RouteType.NOT_AUTHENTICATED) {
      // user is authenticated and trying to access a route that is explicitly designed for not authenticated users
      return redirectTo(req, '/')
    }
  
    if (route_type === RouteType.AUTHENTICATED) {
      return intlMiddleware(req)
    }

    if (route_type === RouteType.ADMIN && !payload.is_admin) {
      return redirectTo(req, '/')
    }

    // 3️⃣ Si todo está bien → intl
    return intlMiddleware(req)
  } catch {
    // Token vencido o firmado con otra clave. En /login hay que dejar pasar:
    // redirigir a /login desde /login era un bucle infinito
    // (ERR_TOO_MANY_REDIRECTS) que sólo se cortaba borrando las cookies.
    if (route_type === RouteType.NOT_AUTHENTICATED) {
      return intlMiddleware(req)
    }
    return redirectTo(req, '/login')
  }
}


export const config = {
  matcher: [
    '/((?!api|_next|_vercel|.*\\..*).*)',
  ],
}
