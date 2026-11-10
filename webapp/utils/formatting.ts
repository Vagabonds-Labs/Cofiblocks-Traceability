export function formatDisplayName(walletAddress?: string | null, userName?: string | null): string {
  if (userName) {
    return userName.length > 14 ? `${userName.substring(0, 14)}…` : userName
  }
  if (walletAddress) {
    // Las direcciones StrKey son largas y sin prefijo: se muestra la punta.
    return `${walletAddress.substring(0, 4)}…${walletAddress.slice(-4)}`
  }
  return ''
}

export const formatDate = (dateString: string, locale = 'en') =>
  new Date(dateString).toLocaleDateString(locale, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
