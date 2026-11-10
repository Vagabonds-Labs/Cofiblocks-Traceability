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
 * The route's language prefix (`/es`), or empty for the default language.
 *
 * It has to be stripped before classifying the route: with
 * `localePrefix: 'as-needed'` the same page lives at `/profile` and at
 * `/es/profile`, and comparing the raw path left every prefixed route public.
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

/** Redirects while keeping the user's current language. */
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
    // Without the secret no token verifies and every protected route ends at
    // /login. It must match the backend's JWT_ACCESS_SECRET.
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

    // 3️⃣ If everything is fine → intl
    return intlMiddleware(req)
  } catch {
    // Expired token or one signed with another key. /login must be let
    // through: redirecting to /login from /login was an infinite loop
    // (ERR_TOO_MANY_REDIRECTS) that only clearing cookies would stop.
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
