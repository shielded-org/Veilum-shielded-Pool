let chain: Promise<void> = Promise.resolve();

/** Serialize on-chain writes from the extension wallet (approve → shield, etc.). */
export function withWalletTxLock<T>(fn: () => Promise<T>): Promise<T> {
  const run = chain.then(fn, fn);
  chain = run.then(
    () => undefined,
    () => undefined
  );
  return run;
}
