import { Database } from 'bun:sqlite';
import { describe, expect, it } from 'bun:test';
import { readFileSync } from 'node:fs';
import worker from '../worker/index.js';

function streamEnv(options?: {
  size?: number;
  get?: (options?: R2GetOptions) => R2ObjectBody | null;
}) {
  const size = options?.size ?? 100;
  const get = options?.get ?? ((rangeOptions?: R2GetOptions) => {
    const range = rangeOptions?.range as { length?: number } | undefined;
    const length = range?.length ?? size;
    return {
      size,
      body: new Blob([new Uint8Array(length)]).stream(),
    } as R2ObjectBody;
  });

  return {
    DB: {
      prepare: () => ({
        bind: () => ({ first: async () => ({ r2_key: 'clips/goal.mp4' }) }),
      }),
    },
    HIGHLIGHTS: {
      head: async () => ({ size }),
      get: async (_key: string, rangeOptions?: R2GetOptions) => get(rangeOptions),
    },
  } as unknown as Parameters<typeof worker.fetch>[1];
}

describe('highlight byte ranges', () => {
  it('serves a bounded range with video response headers', async () => {
    let requestedRange: R2Range | Headers | undefined;
    const env = streamEnv({
      get: (options) => {
        requestedRange = options?.range;
        return {
          size: 100,
          body: new Blob([new Uint8Array(10)]).stream(),
        } as R2ObjectBody;
      },
    });

    const response = await worker.fetch(new Request(
      'https://example.com/api/highlights/stream/1/2',
      { headers: { Range: 'bytes=10-19' } },
    ), env);

    expect(response.status).toBe(206);
    expect(response.headers.get('Accept-Ranges')).toBe('bytes');
    expect(response.headers.get('Content-Range')).toBe('bytes 10-19/100');
    expect(response.headers.get('Content-Length')).toBe('10');
    expect(requestedRange).toEqual({ offset: 10, length: 10 });
  });

  it('supports suffix ranges', async () => {
    const response = await worker.fetch(new Request(
      'https://example.com/api/highlights/stream/1/2',
      { headers: { Range: 'bytes=-25' } },
    ), streamEnv());

    expect(response.status).toBe(206);
    expect(response.headers.get('Content-Range')).toBe('bytes 75-99/100');
  });

  it('rejects unsatisfiable and multiple ranges', async () => {
    for (const range of ['bytes=100-120', 'bytes=0-1,4-5']) {
      const response = await worker.fetch(new Request(
        'https://example.com/api/highlights/stream/1/2',
        { headers: { Range: range } },
      ), streamEnv());

      expect(response.status).toBe(416);
      expect(response.headers.get('Content-Range')).toBe('bytes */100');
    }
  });
});

describe('transcript FTS migration', () => {
  it('backfills rows and keeps the external-content index synchronized', () => {
    const db = new Database(':memory:');
    db.exec(readFileSync('src/db/schema.sql', 'utf8'));
    db.exec(`
      INSERT INTO highlights
        (game_id, event_id, season, brightcove_clip_id, period, time_in_period)
      VALUES (1, 2, 20242025, 3, 1, '01:00');
      INSERT INTO transcripts (game_id, event_id, transcript)
      VALUES (1, 2, 'top shelf goal');
    `);
    db.exec(readFileSync('src/db/migrations/004_transcripts_fts.sql', 'utf8'));

    expect(db.query(`
      SELECT transcript FROM transcripts_fts
      WHERE transcripts_fts MATCH '"top" "shelf"'
    `).get()).toEqual({ transcript: 'top shelf goal' });

    db.exec("UPDATE transcripts SET transcript = 'great save' WHERE id = 1");
    expect(db.query(`
      SELECT transcript FROM transcripts_fts
      WHERE transcripts_fts MATCH 'save'
    `).get()).toEqual({ transcript: 'great save' });

    db.exec('DELETE FROM transcripts WHERE id = 1');
    expect(db.query(`
      SELECT COUNT(*) AS count FROM transcripts_fts
      WHERE transcripts_fts MATCH 'save'
    `).get()).toEqual({ count: 0 });
  });
});

describe('keyword transcript search', () => {
  it('quotes FTS operators and preserves explicit phrases', async () => {
    let bindings: unknown[] = [];
    const env = {
      DB: {
        prepare: () => ({
          bind: (...values: unknown[]) => {
            bindings = values;
            return { all: async () => ({ results: [] }) };
          },
        }),
      },
    } as unknown as Parameters<typeof worker.fetch>[1];

    const response = await worker.fetch(new Request(
      'https://example.com/api/search/transcripts?q=said+%22top+shelf%22+-&mode=keyword',
    ), env);

    expect(response.status).toBe(200);
    expect(bindings).toEqual(['"said" "top shelf"', 50]);
    expect(await response.json()).toEqual({ mode: 'keyword', results: [] });
  });
});
