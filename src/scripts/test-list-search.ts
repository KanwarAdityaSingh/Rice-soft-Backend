#!/usr/bin/env ts-node
/**
 * Unit + light DAO smoke tests for shared list search helpers.
 *
 * Usage:
 *   npx ts-node src/scripts/test-list-search.ts
 */
import 'dotenv/config';
import {
  normalizeSearchTerm,
  tokenizeSearchQuery,
  escapeLikePattern,
  buildNormalizedSearchClause,
  parseSearchQuery,
} from '../utils/search';
import { invoiceDispatchDAO } from '../dao/invoice-dispatch.dao';
import { db } from '../database/connection';

type Result = { name: string; pass: boolean; error?: string };
const results: Result[] = [];

function assert(cond: boolean, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}

function deepEqual(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

async function run(name: string, fn: () => Promise<void> | void) {
  try {
    await fn();
    results.push({ name, pass: true });
    console.log(`  ✓ ${name}`);
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    results.push({ name, pass: false, error });
    console.log(`  ✗ ${name}`);
    console.log(`      ${error}`);
  }
}

async function main() {
  console.log('\nList search helpers\n');

  await run('normalizeSearchTerm strips punctuation and case', () => {
    assert(normalizeSearchTerm('M.R.T') === 'mrt', 'M.R.T');
    assert(normalizeSearchTerm('m r t') === 'mrt', 'm r t');
    assert(normalizeSearchTerm('Singh-Traders') === 'singhtraders', 'Singh-Traders');
    assert(normalizeSearchTerm('') === '', 'empty');
  });

  await run('tokenizeSearchQuery AND-splits on whitespace after normalize', () => {
    assert(deepEqual(tokenizeSearchQuery('M.R.T'), ['mrt']), 'single punctuated');
    assert(deepEqual(tokenizeSearchQuery('m.r.t traders'), ['mrt', 'traders']), 'two tokens');
    assert(deepEqual(tokenizeSearchQuery('  singh   traders  '), ['singh', 'traders']), 'extra spaces');
    assert(deepEqual(tokenizeSearchQuery('...'), []), 'punctuation only');
    assert(deepEqual(tokenizeSearchQuery(''), []), 'empty');
  });

  await run('escapeLikePattern escapes LIKE metacharacters', () => {
    assert(escapeLikePattern('100%_off\\x') === '100\\%\\_off\\\\x', 'escape');
  });

  await run('parseSearchQuery prefers search then q', () => {
    assert(parseSearchQuery({ search: '  mrt  ' }) === 'mrt', 'search');
    assert(parseSearchQuery({ q: 'abc' }) === 'abc', 'q');
    assert(parseSearchQuery({ search: 'a', q: 'b' }) === 'a', 'prefer search');
    assert(parseSearchQuery({}) === undefined, 'missing');
    assert(parseSearchQuery({ search: '   ' }) === undefined, 'blank');
  });

  await run('buildNormalizedSearchClause builds token AND / column OR', () => {
    const clause = buildNormalizedSearchClause(
      ['party_name', 'lr_number'],
      'M.R.T traders',
      3
    );
    assert(clause.params.length === 2, `expected 2 params, got ${clause.params.length}`);
    assert(clause.params[0] === 'mrt', `token0=${clause.params[0]}`);
    assert(clause.params[1] === 'traders', `token1=${clause.params[1]}`);
    assert(clause.nextParamIndex === 5, `nextParamIndex=${clause.nextParamIndex}`);
    assert(clause.sql.includes('$3'), 'uses $3');
    assert(clause.sql.includes('$4'), 'uses $4');
    assert(clause.sql.includes('party_name'), 'col party_name');
    assert(clause.sql.includes('lr_number'), 'col lr_number');
    assert(clause.sql.includes(' AND '), 'tokens AND-combined');
    assert(clause.sql.includes(' OR '), 'columns OR-combined');
    assert(clause.sql.startsWith(' AND '), 'prefixed with AND');
  });

  await run('buildNormalizedSearchClause empty search is no-op', () => {
    const clause = buildNormalizedSearchClause(['name'], '   ', 1);
    assert(clause.sql === '', 'empty sql');
    assert(clause.params.length === 0, 'no params');
    assert(clause.nextParamIndex === 1, 'unchanged index');
  });

  console.log('\nDAO smoke (invoice-dispatch search + pagination)\n');

  await run('invoice-dispatch search + status keeps total consistent across pages', async () => {
    const pageSize = 2;
    const search = 'a'; // broad enough to often hit; empty-safe if no rows
    const status = undefined;

    const page1 = await invoiceDispatchDAO.findAll(
      undefined,
      status,
      undefined,
      undefined,
      { limit: pageSize, offset: 0 },
      search
    );
    const page2 = await invoiceDispatchDAO.findAll(
      undefined,
      status,
      undefined,
      undefined,
      { limit: pageSize, offset: pageSize },
      search
    );

    assert(page1.total === page2.total, `total mismatch p1=${page1.total} p2=${page2.total}`);
    assert(page1.rows.length <= pageSize, `page1 length ${page1.rows.length}`);
    assert(page2.rows.length <= pageSize, `page2 length ${page2.rows.length}`);

    if (page1.total > pageSize) {
      assert(page1.rows.length === pageSize, 'full first page when total > limit');
      const ids1 = new Set(page1.rows.map((r) => r.id));
      for (const row of page2.rows) {
        assert(!ids1.has(row.id), `duplicate id across pages: ${row.id}`);
      }
    }

    // Punctuation-insensitive: same normalized query should yield same total
    const dotted = await invoiceDispatchDAO.findAll(
      undefined,
      undefined,
      undefined,
      undefined,
      { limit: 5, offset: 0 },
      'm.r.t'
    );
    const compact = await invoiceDispatchDAO.findAll(
      undefined,
      undefined,
      undefined,
      undefined,
      { limit: 5, offset: 0 },
      'mrt'
    );
    assert(
      dotted.total === compact.total,
      `m.r.t total (${dotted.total}) != mrt total (${compact.total})`
    );
  });

  const passed = results.filter((r) => r.pass).length;
  const failed = results.filter((r) => !r.pass).length;
  console.log(`\n${passed} passed, ${failed} failed\n`);

  await db.close();
  process.exit(failed > 0 ? 1 : 0);
}

main().catch(async (err) => {
  console.error(err);
  try {
    await db.close();
  } catch {
    /* ignore */
  }
  process.exit(1);
});
