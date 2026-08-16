import { describe, expect, it } from 'bun:test';
import { parseTranscriptionResult } from '../src/transcription.js';
import worker from '../worker/index.js';

const MODEL = '@cf/openai/whisper-large-v3-turbo';

function testEnv(run: (model: string, input: Record<string, unknown>) => Promise<{ text: string }>) {
  return {
    ADMIN_SECRET: 'test-secret',
    AI: { run },
  } as any;
}

describe('/admin/transcribe', () => {
  it('uses the turbo model request shape and returns its identifier', async () => {
    let call: { model: string; input: Record<string, unknown> } | undefined;
    const env = testEnv(async (model, input) => {
      call = { model, input };
      return { text: '  Great save by Shesterkin.  ' };
    });
    const request = new Request('https://example.com/admin/transcribe', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer test-secret',
        'Content-Type': 'audio/mpeg',
        'X-Prompt': encodeURIComponent('NHL hockey game. Players: Igor Shesterkin.'),
      },
      body: new Uint8Array([0, 1, 2, 255]),
    });

    const response = await worker.fetch(request, env);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      transcript: 'Great save by Shesterkin.',
      model: MODEL,
    });
    expect(call).toEqual({
      model: MODEL,
      input: {
        audio: 'AAEC/w==',
        task: 'transcribe',
        language: 'en',
        vad_filter: true,
        condition_on_previous_text: false,
        initial_prompt: 'NHL hockey game. Players: Igor Shesterkin.',
      },
    });
  });

  it('rejects an empty audio body before invoking Workers AI', async () => {
    let called = false;
    const env = testEnv(async () => {
      called = true;
      return { text: 'unexpected' };
    });
    const request = new Request('https://example.com/admin/transcribe', {
      method: 'POST',
      headers: { Authorization: 'Bearer test-secret' },
    });

    const response = await worker.fetch(request, env);

    expect(response.status).toBe(400);
    expect(called).toBe(false);
  });
});

describe('parseTranscriptionResult', () => {
  it('requires model metadata without an explicit legacy fallback', () => {
    expect(() => parseTranscriptionResult({ transcript: 'Goal!' })).toThrow(
      'transcript and model are required',
    );
  });

  it('accurately labels a known legacy endpoint during a rolling upgrade', () => {
    expect(
      parseTranscriptionResult({ transcript: 'Goal!' }, '@cf/openai/whisper'),
    ).toEqual({ transcript: 'Goal!', model: '@cf/openai/whisper' });
  });
});
