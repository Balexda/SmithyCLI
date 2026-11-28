import fs from 'fs';

import { isValidProjectSlug, projectRoot } from './engraved/roots.js';
import { splitFrontmatter } from './frontmatter.js';

type ArtifactRefusal = { kind: 'invalid-artifact'; artifact: string; reason: string };

type ArtifactProject =
  | { kind: 'declaration'; value: string; source: 'artifact'; artifact: string }
  | { kind: 'absent' }
  | ArtifactRefusal;

type DeclarationSource = 'option' | 'artifact' | 'agreement';
type InvalidReason = 'invalid-slug' | 'reserved-name';

export type ProjectOutcome =
  | { kind: 'none' }
  | { kind: 'selected' | 'project-missing'; slug: string; source: DeclarationSource; artifact?: string }
  | { kind: 'invalid-project'; value: string; source: 'option' | 'artifact'; reason: InvalidReason; artifact?: string }
  | { kind: 'project-conflict'; optionValue: string; artifactValue: string; artifact: string }
  | ArtifactRefusal;

export function validateProjectSlug(value: string): InvalidReason | null {
  if (value === 'default') return 'reserved-name';
  return isValidProjectSlug(value) ? null : 'invalid-slug';
}

/** Read the document header before the first body section. */
export function readArtifactProject(artifact: string): ArtifactProject {
  const refuse = (reason: string): ArtifactRefusal => ({ kind: 'invalid-artifact', artifact, reason });
  let content: string;
  try {
    content = fs.readFileSync(artifact, 'utf8').replace(/^\uFEFF/, '');
  } catch {
    return refuse('Could not read the input artifact');
  }

  const emptyFrontmatter = /^---[ \t]*\r?\n---[ \t]*(?:\r?\n|$)/.exec(content);
  const body = emptyFrontmatter === null
    ? splitFrontmatter(content).body
    : content.slice(emptyFrontmatter[0].length);
  let value: string | undefined;
  let fence: string | undefined;
  let inComment = false;
  let seenTitle = false;

  for (const line of body.split(/\r?\n/)) {
    if (fence !== undefined) {
      const closing = /^ {0,3}(`{3,}|~{3,})[ \t]*$/.exec(line)?.[1];
      if (closing?.startsWith(fence)) fence = undefined;
      continue;
    }

    if (inComment || /^ {0,3}<!--/.test(line)) {
      inComment = !line.includes('-->');
      continue;
    }

    const opener = /^ {0,3}(`{3,})[^`]*$|^ {0,3}(~{3,})/.exec(line);
    if (opener !== null) {
      fence = opener[1] ?? opener[2];
      continue;
    }

    if (!seenTitle && /^ {0,3}#[ \t]/.test(line)) {
      seenTitle = true;
      continue;
    }

    if (!/^ {0,3}\*\*Project\*\*(?=[ \t:]|$)/.test(line)) {
      // The preamble can contain other metadata fields. Prose and block
      // content start the body, including lists containing fenced examples.
      if (line.trim() === '' || /^ {0,3}(?:\*\*[^*]+\*\*[ \t]*:|project:)/.test(line)) continue;
      break;
    }
    if (value !== undefined) return refuse('Duplicate Project headers');

    const rawValue = /^ {0,3}\*\*Project\*\*[ \t]*:(.*)$/.exec(line)?.[1]?.trim();
    if (rawValue === undefined) return refuse('Malformed Project header');

    if (rawValue.includes('`')) {
      const enclosed = /^`([^`]*)`$/.exec(rawValue)?.[1];
      if (enclosed === undefined) return refuse('Malformed Project header value');
      value = enclosed;
    } else {
      value = rawValue;
    }
  }

  return value === undefined
    ? { kind: 'absent' }
    : { kind: 'declaration', value, source: 'artifact', artifact };
}

export interface DeclaredProjectInput {
  optionProject?: string;
  inputArtifact?: string;
  mode: 'repo' | 'external';
  repositoryKey?: string;
}

export function resolveDeclaredProject(input: DeclaredProjectInput): ProjectOutcome {
  const { optionProject, inputArtifact } = input;
  const header: ArtifactProject = inputArtifact === undefined
    ? { kind: 'absent' }
    : readArtifactProject(inputArtifact);
  if (header.kind === 'invalid-artifact') return header;

  if (optionProject !== undefined) {
    const reason = validateProjectSlug(optionProject);
    if (reason !== null) return { kind: 'invalid-project', value: optionProject, source: 'option', reason };
  }

  if (header.kind === 'declaration') {
    const { value, artifact } = header;
    const reason = validateProjectSlug(value);
    if (reason !== null) return { kind: 'invalid-project', value, source: 'artifact', reason, artifact };
    if (optionProject !== undefined && optionProject !== value) {
      return { kind: 'project-conflict', optionValue: optionProject, artifactValue: value, artifact };
    }
    return resolveNamedStore(value, optionProject === undefined ? 'artifact' : 'agreement', artifact);
  }

  return optionProject === undefined ? { kind: 'none' } : resolveNamedStore(optionProject, 'option');
}

function resolveNamedStore(slug: string, source: DeclarationSource, artifact?: string): ProjectOutcome {
  let exists: boolean;
  try {
    exists = fs.statSync(projectRoot(slug)).isDirectory();
  } catch {
    exists = false;
  }
  return {
    kind: exists ? 'selected' : 'project-missing',
    slug,
    source,
    ...(artifact === undefined ? {} : { artifact }),
  };
}
