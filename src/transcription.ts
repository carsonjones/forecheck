export type TranscriptionResult = {
  transcript: string;
  model: string;
};

export function parseTranscriptionResult(
  data: unknown,
  legacyModel?: string,
): TranscriptionResult {
  if (!data || typeof data !== 'object') {
    throw new Error('transcribe returned an invalid response (transcript and model are required)');
  }

  const { transcript, model } = data as Record<string, unknown>;
  if (typeof transcript !== 'string' || transcript.length === 0) {
    throw new Error('transcribe returned an invalid response (transcript and model are required)');
  }

  if (typeof model === 'string' && model.length > 0) {
    return { transcript, model };
  }

  if (legacyModel) {
    return { transcript, model: legacyModel };
  }

  throw new Error('transcribe returned an invalid response (transcript and model are required)');
}
