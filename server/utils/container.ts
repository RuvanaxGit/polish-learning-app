import { createContainer } from '../core/container';
import type { Container } from '../core/container';
import { parseConfig } from '../core/config';

let container: Container | undefined;

/** Process-wide composition root, built lazily on first use. */
export function useContainer(): Container {
  container ??= createContainer(parseConfig(process.env));
  return container;
}

export async function disposeContainer(): Promise<void> {
  const current = container;
  container = undefined;
  await current?.dispose();
}
