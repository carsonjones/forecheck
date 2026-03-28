/**
 * localR2.ts
 *
 * R2Bucket-compatible adapter for local bun scripts, backed by the
 * Cloudflare R2 S3-compatible API. Set these env vars before running:
 *
 *   CF_ACCOUNT_ID       — Cloudflare account ID
 *   R2_ACCESS_KEY_ID    — R2 API token access key
 *   R2_SECRET_ACCESS_KEY — R2 API token secret
 *
 * Create API token at: dash.cloudflare.com → R2 → Manage R2 API Tokens
 * Needs "Object Read & Write" on bucket "forecheck".
 */

import { GetObjectCommand, HeadObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';

export function createLocalR2(opts: {
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucketName: string;
}): R2Bucket {
  const s3 = new S3Client({
    region: 'auto',
    endpoint: `https://${opts.accountId}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: opts.accessKeyId,
      secretAccessKey: opts.secretAccessKey,
    },
  });

  return {
    async head(key: string) {
      try {
        await s3.send(new HeadObjectCommand({ Bucket: opts.bucketName, Key: key }));
        return { key } as R2Object;
      } catch {
        return null;
      }
    },

    async put(key: string, value: ReadableStream | ArrayBuffer | ArrayBufferView | string | null | Blob, options?: R2PutOptions) {
      // buffer streams — 15MB clips are fine in memory
      let body: ArrayBuffer | string;
      if (value instanceof ReadableStream) {
        const chunks: Uint8Array[] = [];
        const reader = value.getReader();
        while (true) {
          const { done, value: chunk } = await reader.read();
          if (done) break;
          chunks.push(chunk);
        }
        const total = chunks.reduce((n, c) => n + c.byteLength, 0);
        const buf = new Uint8Array(total);
        let offset = 0;
        for (const chunk of chunks) { buf.set(chunk, offset); offset += chunk.byteLength; }
        body = buf.buffer;
      } else {
        body = value as ArrayBuffer | string;
      }

      await s3.send(new PutObjectCommand({
        Bucket: opts.bucketName,
        Key: key,
        Body: body as any,
        ContentType: options?.httpMetadata?.contentType,
      }));
      return { key } as R2Object;
    },

    async get(key: string) {
      try {
        const res = await s3.send(new GetObjectCommand({ Bucket: opts.bucketName, Key: key }));
        return {
          key,
          body: res.Body as ReadableStream,
        } as R2ObjectBody;
      } catch {
        return null;
      }
    },
    delete: async () => {},
    list: async () => ({ objects: [], truncated: false, cursor: '', delimitedPrefixes: [] } as any),
    createMultipartUpload: async () => ({}) as any,
    resumeMultipartUpload: () => ({}) as any,
  } as unknown as R2Bucket;
}

export function localR2FromEnv(bucketName: string): R2Bucket | undefined {
  const accountId = process.env.CF_ACCOUNT_ID;
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
  if (!accountId || !accessKeyId || !secretAccessKey) return undefined;
  return createLocalR2({ accountId, accessKeyId, secretAccessKey, bucketName });
}
