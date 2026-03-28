/**
 * localD1.ts
 *
 * bun:sqlite-backed adapter that satisfies the D1Database interface.
 * Used by local bun scripts (backfill, highlights) so ingest code is
 * identical whether running locally or in a CF Worker.
 */

import { Database } from 'bun:sqlite';

export function createLocalD1(path: string): D1Database {
  const sqlite = new Database(path, { create: true });

  function makeStmt(sql: string, params: unknown[]): D1PreparedStatement {
    const stmt = {
      bind(...values: unknown[]) { return makeStmt(sql, values); },
      async first<T>() { return (sqlite.prepare(sql).get(...params) as T) ?? null; },
      async all<T>() { return { results: sqlite.prepare(sql).all(...params) as T[], success: true, meta: {} as any }; },
      async run() { sqlite.prepare(sql).run(...params); return { success: true, meta: {} as any, results: undefined }; },
      _run() { sqlite.prepare(sql).run(...params); },
    };
    return stmt as unknown as D1PreparedStatement;
  }

  return {
    prepare(sql: string) { return makeStmt(sql, []); },
    async batch(statements: D1PreparedStatement[]) {
      const tx = sqlite.transaction(() => { for (const s of statements) (s as any)._run(); });
      tx();
      return statements.map(() => ({ results: [], success: true, meta: {} as any }));
    },
    async exec(query: string) { sqlite.exec(query); return { count: 0, duration: 0 }; },
    async dump() { return new ArrayBuffer(0); },
  } as unknown as D1Database;
}
