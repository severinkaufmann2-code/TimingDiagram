/** A short random id. The prefix tells what it names, e.g. "c" for a channel. */
export function newId(prefix: string, taken: Iterable<string> = []): string {
  const used = new Set(taken);
  for (;;) {
    const id = prefix + Math.random().toString(36).slice(2, 8).padEnd(6, '0');
    if (!used.has(id)) return id;
  }
}
