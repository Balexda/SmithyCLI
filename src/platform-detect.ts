import { platforms, type PlatformPackageManager } from './permissions.js';

/**
 * Detect which platform-scoped package managers are available on the current
 * OS by matching `process.platform` against each entry's `osPlatforms` list.
 *
 * Reads `process.platform` dynamically on every call so tests can override it
 * via `Object.defineProperty(process, 'platform', { value: 'darwin' })`.
 */
export function detectPlatforms(): PlatformPackageManager[] {
  const current = process.platform;
  const detected: PlatformPackageManager[] = [];

  for (const [name, spec] of Object.entries(platforms) as [PlatformPackageManager, typeof platforms[PlatformPackageManager]][]) {
    if (spec.osPlatforms.includes(current)) detected.push(name);
  }

  return detected;
}
