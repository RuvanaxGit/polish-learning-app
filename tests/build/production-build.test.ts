import { spawn } from 'node:child_process';
import type { ChildProcess } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

// Phase 2 requirement 2: the E2E auth bypass must not exist in production
// builds at all, not merely be switched off at runtime. Run after `nuxt build`
// (`pnpm test:build`); the e2e build lives separately in .output-e2e.

const outputDir = resolve(import.meta.dirname, '../../.output');
const serverEntry = join(outputDir, 'server/index.mjs');
const E2E_MARKERS = ['__e2e__', 'e2e-test-seed', 'e2e.invalid'];

function listFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? listFiles(path) : [path];
  });
}

const productionEnv = {
  DATABASE_URL: 'postgresql://unused:unused@127.0.0.1:1/unused',
  BETTER_AUTH_SECRET: randomBytes(32).toString('base64'),
  GOOGLE_CLIENT_ID: 'test-google-client-id',
  GOOGLE_CLIENT_SECRET: 'test-google-client-secret',
  ALLOWED_EMAILS: '',
};

let server: ChildProcess | undefined;

afterEach(() => {
  server?.kill();
  server = undefined;
});

function startServer(env: Record<string, string>): ChildProcess {
  const child = spawn(process.execPath, [serverEntry], {
    env: { PATH: process.env.PATH, SystemRoot: process.env.SystemRoot, ...env },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  server = child;
  return child;
}

async function waitForHealth(baseUrl: string): Promise<void> {
  for (let attempt = 0; attempt < 100; attempt++) {
    try {
      await fetch(`${baseUrl}/api/health`);
      return;
    }
    catch {
      await new Promise(done => setTimeout(done, 100));
    }
  }
  throw new Error('production server did not start');
}

describe('production build', () => {
  it('exists (run `nuxt build` first)', () => {
    expect(existsSync(serverEntry), `${serverEntry} is missing`).toBe(true);
  });

  it('contains no trace of the E2E session route or its code', () => {
    const offenders = listFiles(outputDir).filter((file) => {
      if (!/\.(m?js|json|html)$/.test(file)) return false;
      const content = readFileSync(file, 'utf8');
      return E2E_MARKERS.some(marker => content.includes(marker));
    });
    expect(offenders).toEqual([]);
  });

  it('answers 404 for the E2E route even with the bypass flags set', async () => {
    const port = 3200 + Math.floor(Math.random() * 500);
    const baseUrl = `http://127.0.0.1:${port}`;
    startServer({ ...productionEnv, NODE_ENV: 'test', E2E_AUTH_BYPASS: 'true', HOST: '127.0.0.1', PORT: String(port), BETTER_AUTH_URL: baseUrl });
    await waitForHealth(baseUrl);

    const response = await fetch(`${baseUrl}/api/__e2e__/session`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'origin': baseUrl },
      body: '{}',
      redirect: 'manual',
    });

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: { code: 'not_found', message: 'Not found' } });
    expect(response.headers.getSetCookie()).toEqual([]);
  });

  it('refuses to start with E2E_AUTH_BYPASS=true under NODE_ENV=production', async () => {
    const port = 3700 + Math.floor(Math.random() * 200);
    const child = startServer({ ...productionEnv, NODE_ENV: 'production', E2E_AUTH_BYPASS: 'true', HOST: '127.0.0.1', PORT: String(port), BETTER_AUTH_URL: `http://127.0.0.1:${port}` });
    let output = '';
    child.stdout?.on('data', (chunk: Buffer) => (output += chunk.toString()));
    child.stderr?.on('data', (chunk: Buffer) => (output += chunk.toString()));

    const exitCode = await new Promise<number | null>((done) => {
      child.on('exit', code => done(code));
      setTimeout(() => done(null), 15_000);
    });

    expect(exitCode, 'server kept running').not.toBeNull();
    expect(exitCode).not.toBe(0);
    expect(output).toContain('E2E_AUTH_BYPASS');
    expect(output).not.toContain(productionEnv.BETTER_AUTH_SECRET);
  });
});
