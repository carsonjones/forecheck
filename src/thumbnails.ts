/**
 * thumbnails.ts
 *
 * Bun-only: extracts the first video frame of an MP4 as a JPEG via ffmpeg.
 * Not importable from the worker (no ffmpeg there); pass it into
 * ingestHighlights as `extractThumbnail` from CLI entrypoints.
 */

import { unlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export type ThumbnailExtractor = (mp4: Uint8Array) => Promise<Uint8Array>;

export const extractFirstFrame: ThumbnailExtractor = async (mp4) => {
  // ffmpeg exits after frame 0; piping the full clip to stdin would EPIPE, so use a temp file.
  const tmp = join(tmpdir(), `forecheck-${crypto.randomUUID()}.mp4`);
  await Bun.write(tmp, mp4);
  try {
    const proc = Bun.spawn(
      ['ffmpeg', '-v', 'error', '-i', tmp, '-frames:v', '1', '-q:v', '3', '-pix_fmt', 'yuvj420p', '-f', 'mjpeg', 'pipe:1'],
      { stdout: 'pipe', stderr: 'pipe' },
    );
    const [jpg, stderr] = await Promise.all([
      new Response(proc.stdout).arrayBuffer(),
      new Response(proc.stderr).text(),
      proc.exited,
    ]);
    if (proc.exitCode !== 0 || jpg.byteLength === 0) {
      throw new Error(`ffmpeg thumbnail failed (exit ${proc.exitCode}): ${stderr.slice(-200)}`);
    }
    return new Uint8Array(jpg);
  } finally {
    await unlink(tmp).catch(() => {});
  }
};
