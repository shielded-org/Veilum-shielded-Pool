const LEDGER_RANGE_RE = /startledger must be within the ledger range/i;

/** Internal RPC retention noise — never show in the dashboard banner. */
export function isLedgerRangeUserWarning(message: string): boolean {
  return LEDGER_RANGE_RE.test(message);
}

export function filterUserSyncWarnings(warnings: string[]): string[] {
  return warnings.filter((w) => !isLedgerRangeUserWarning(w));
}
