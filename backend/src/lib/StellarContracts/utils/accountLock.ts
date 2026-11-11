/**
 * Serializes work per Stellar source account.
 *
 * Two transactions built from the same account at the same time load the same
 * sequence number, and one of them fails. Wrapping "build, sign and submit" in
 * this lock makes them take turns. It only covers this process: running
 * several backend instances needs a shared queue instead.
 */
const tails = new Map<string, Promise<unknown>>();

export async function withAccountLock<T>(account: string, task: () => Promise<T>): Promise<T> {
  const previous = tails.get(account) ?? Promise.resolve();
  const run = previous.catch(() => undefined).then(task);
  const tail = run.catch(() => undefined);
  tails.set(account, tail);
  try {
    return await run;
  } finally {
    if (tails.get(account) === tail) tails.delete(account);
  }
}
