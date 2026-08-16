// Ambient decl for the small slice of Bun's global API used by CLI/script
// entry points (run_backfill.ts, src/cli/*). Not @types/bun: that package
// redeclares web-standard globals (ReadableStream, Response, crypto, ...)
// which conflicts with @cloudflare/workers-types in this project's single
// tsconfig.
declare namespace Bun {
  function sleep(ms: number): Promise<void>;

  interface SpawnOptions {
    cwd?: string;
    env?: Record<string, string | undefined>;
    stdin?: 'inherit' | 'pipe' | 'ignore';
    stdout?: 'inherit' | 'pipe' | 'ignore';
    stderr?: 'inherit' | 'pipe' | 'ignore';
  }

  interface FileSink {
    write(data: string | ArrayBufferView): number;
    end(): void;
  }

  interface Subprocess {
    readonly stdin: FileSink;
    readonly stdout: ReadableStream;
    readonly stderr: ReadableStream;
    readonly exited: Promise<number>;
    readonly exitCode: number | null;
  }

  function spawn(cmd: string[], options?: SpawnOptions): Subprocess;
}
