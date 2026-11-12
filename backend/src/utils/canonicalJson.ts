import { createHash } from 'crypto';

/**
 * JSON with sorted object keys and no whitespace, so the same content always
 * serializes to the same bytes. Hashes written on chain are computed over
 * this form, so anyone holding the off-chain record can recompute them.
 */
export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    const entries = Object.keys(record)
      .filter((key) => record[key] !== undefined)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`);
    return `{${entries.join(',')}}`;
  }
  return JSON.stringify(value);
}

/** Lower-case hex SHA-256 of a value's canonical JSON. */
export function sha256Canonical(value: unknown): string {
  return createHash('sha256').update(canonicalJson(value)).digest('hex');
}
