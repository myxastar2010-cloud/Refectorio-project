// Prints the eval fixture (the week, the profile, what search and the term resolver return) for writing eval cases.
//   node scripts/lib/run-ts.mjs packages/kiki-core/build/fixture-dump.ts [query…]
import { buildDigest } from '@refectorio/kiki-core/client';
import { fixtureEnv } from '@refectorio/kiki-core/client/fixture';

const { env, plan } = fixtureEnv();
const queries = process.argv.slice(2);
if (queries.length === 0) {
  console.log(buildDigest(env));
  console.log('\nhorizon', plan.days[0]?.date, '…', plan.horizonEnd);
}
for (const q of queries.length > 0 ? queries : ['блины', 'кофе', 'рыба', 'сырники']) {
  const hits = env.search(q).slice(0, 6);
  console.log(
    q,
    '→',
    hits
      .map(
        (h) =>
          `${env.items.get(h.itemId)?.nameRu} ${h.score.toFixed(2)} [${h.spans.map((s) => s.field).join(',')}]`,
      )
      .join(' | '),
  );
}
