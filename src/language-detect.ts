import fs from 'fs';
import path from 'path';
import { toolchains, type LanguageToolchain } from './permissions.js';

/**
 * Detect which language toolchains are present in the target directory
 * by checking for known marker files at the project root.
 */
export function detectLanguages(targetDir: string): LanguageToolchain[] {
  const detected: LanguageToolchain[] = [];

  for (const [name, tc] of Object.entries(toolchains) as [LanguageToolchain, typeof toolchains[LanguageToolchain]][]) {
    try {
      const found = tc.markers.some(marker => fs.existsSync(path.join(targetDir, marker)));
      if (found) detected.push(name);
    } catch {
      // Ignore filesystem permission errors — skip this toolchain
    }
  }

  return detected;
}
