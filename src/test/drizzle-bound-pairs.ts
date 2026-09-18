/**
 * The `[column, value]` pairs a drizzle condition binds, in source order.
 *
 * A bag of bound values throws column identity away, so it cannot tell
 * `eq(sessions.parked, true)` from `eq(sessions.isTraining, true)` — both are
 * just `true` in the list, and a predicate swapped for the wrong column would
 * still satisfy every assertion. That gap was CodeRabbit's finding on PR #57,
 * and it matters most where a predicate *is* the rule: the park and restore
 * rules moved out of a pure function into SQL, so the SQL is the only thing
 * left to specify.
 *
 * Walks drizzle's own `queryChunks` structure in order and pairs each column
 * with the parameter that follows it, which is the shape drizzle renders a
 * binary comparison in.
 */
export function boundPairs(condition: unknown): Array<[string, unknown]> {
  type Node = { value?: unknown; name?: unknown; queryChunks?: unknown[] };
  const flat: Node[] = [];
  const walk = (node: unknown) => {
    if (!node || typeof node !== 'object') return;
    const n = node as Node;
    if (n.queryChunks) {
      for (const chunk of n.queryChunks) walk(chunk);
      return;
    }
    flat.push(n);
  };
  walk(condition);

  const pairs: Array<[string, unknown]> = [];
  let column: string | null = null;
  for (const node of flat) {
    if (typeof node.name === 'string') {
      column = node.name;
    } else if ('value' in node && !Array.isArray(node.value) && column !== null) {
      // drizzle's StringChunk carries `.value` too, as an array of SQL
      // fragments — the ` = ` between a column and its parameter. Only a bound
      // Param holds a scalar, and those are the ones being paired.
      pairs.push([column, node.value]);
      column = null;
    }
  }
  return pairs;
}
