/** Annotate ordered ledger entries with the running balance after each one. */
export function withRunningBalance<T extends { amount_cents: number }>(
  entriesOldestFirst: T[]
): Array<T & { balanceAfter: number }> {
  let running = 0;
  return entriesOldestFirst.map((e) => {
    running += e.amount_cents;
    return { ...e, balanceAfter: running };
  });
}
