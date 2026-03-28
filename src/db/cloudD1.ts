/**
 * cloudD1.ts
 *
 * D1Database-compatible adapter that hits the Cloudflare D1 REST API.
 * Used by local bun CLI scripts to write directly to the remote D1 database.
 *
 * Required env vars:
 *   CF_ACCOUNT_ID     — Cloudflare account ID
 *   CF_API_TOKEN      — API token with D1 Edit permission
 *   D1_DATABASE_ID    — D1 database ID from wrangler.jsonc
 */

type D1ApiResult = { results: unknown[]; success: boolean; meta: unknown };

export function createCloudD1(accountId: string, databaseId: string, apiToken: string): D1Database {
  const base = `https://api.cloudflare.com/client/v4/accounts/${accountId}/d1/database/${databaseId}`;
  const headers = {
    'Authorization': `Bearer ${apiToken}`,
    'Content-Type': 'application/json',
  };

  async function queryOne(sql: string, params: unknown[]): Promise<D1ApiResult> {
    const res = await fetch(`${base}/query`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ sql, params }),
    });
    if (!res.ok) throw new Error(`D1 API ${res.status}: ${await res.text()}`);
    const data = await res.json() as { result: D1ApiResult[] };
    return data.result[0]!;
  }


  function makeStmt(sql: string, params: unknown[]): D1PreparedStatement {
    return {
      bind(...values: unknown[]) { return makeStmt(sql, values); },
      async first<T>() {
        const r = await queryOne(sql, params);
        return ((r.results as T[])[0]) ?? null;
      },
      async all<T>() {
        const r = await queryOne(sql, params);
        return { results: r.results as T[], success: r.success, meta: r.meta as any };
      },
      async run() {
        const r = await queryOne(sql, params);
        return { success: r.success, meta: r.meta as any, results: undefined };
      },
      _sql: sql,
      _params: params,
    } as unknown as D1PreparedStatement;
  }

  return {
    prepare(sql: string) { return makeStmt(sql, []); },

    async batch(statements: D1PreparedStatement[]) {
      const results: D1ApiResult[] = [];
      for (const s of statements) {
        results.push(await queryOne((s as any)._sql, (s as any)._params));
      }
      return results as any;
    },

    async exec(sql: string) {
      await queryOne(sql, []);
      return { count: 0, duration: 0 };
    },

    async dump() { return new ArrayBuffer(0); },
  } as unknown as D1Database;
}

export function cloudD1FromEnv(): D1Database | undefined {
  const accountId = process.env.CF_ACCOUNT_ID;
  const apiToken = process.env.CF_API_TOKEN;
  const databaseId = process.env.D1_DATABASE_ID;
  if (!accountId || !apiToken || !databaseId) return undefined;
  return createCloudD1(accountId, databaseId, apiToken);
}
