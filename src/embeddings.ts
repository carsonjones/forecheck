export const EMBEDDING_MODEL = '@cf/baai/bge-base-en-v1.5' as const;
export const EMBEDDING_BATCH_SIZE = 50;

export type TranscriptEmbeddingRow = {
  game_id: number;
  event_id: number;
  transcript: string;
  season: number;
  scorer_id: number | null;
  team_id: number | null;
};

export async function embedTexts(ai: Ai, texts: string[]): Promise<number[][]> {
  if (texts.length === 0) return [];

  const result = await ai.run(EMBEDDING_MODEL, { text: texts });
  if (!('data' in result) || !result.data || result.data.length !== texts.length) {
    throw new Error(`embedding model returned ${'data' in result ? result.data?.length ?? 0 : 0} vectors for ${texts.length} texts`);
  }
  return result.data;
}

export function transcriptVector(row: TranscriptEmbeddingRow, values: number[]): VectorizeVector {
  return {
    id: `${row.game_id}:${row.event_id}`,
    values,
    metadata: {
      game_id: row.game_id,
      event_id: row.event_id,
      season: row.season,
      ...(row.scorer_id === null ? {} : { scorer_id: row.scorer_id }),
      ...(row.team_id === null ? {} : { team_id: row.team_id }),
    },
  };
}

export async function upsertTranscriptEmbeddings(
  ai: Ai,
  index: Vectorize,
  rows: TranscriptEmbeddingRow[],
  batchSize = EMBEDDING_BATCH_SIZE,
): Promise<number> {
  let upserted = 0;
  for (let offset = 0; offset < rows.length; offset += batchSize) {
    const batch = rows.slice(offset, offset + batchSize);
    const embeddings = await embedTexts(ai, batch.map((row) => row.transcript));
    await index.upsert(batch.map((row, i) => transcriptVector(row, embeddings[i]!)));
    upserted += batch.length;
  }
  return upserted;
}
