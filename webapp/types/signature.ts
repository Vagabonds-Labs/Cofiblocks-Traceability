/**
 * SEP-53 format for signing messages.
 *
 * The wallet prepends this prefix and hashes with SHA-256 before signing, so a
 * signed message can never pass for a signed transaction. The backend checks
 * the same thing locally with the account's ed25519 public key.
 */
export const SEP53_PREFIX = 'Stellar Signed Message:\n'
