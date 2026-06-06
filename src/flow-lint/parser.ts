/**
 * Front-matter parsing for `flow-lint`.
 *
 * Pure text → structure. No filesystem I/O here (the linter owns that) so the
 * parser stays trivially unit-testable. Both `.flow.md` and `.design.md` open
 * with a YAML front-matter block fenced by `---` lines, per the
 * `smithy.helper-flow-definition` and `smithy.helper-screen-design` skills.
 */

import { parse as parseYaml } from 'yaml';

import type { FlowDoc, ScreenDoc } from './types.js';

/** Outcome of pulling the YAML front-matter block out of a Markdown file. */
export interface FrontMatter {
  /** Parsed mapping, or `null` when there is no front-matter / it is not a map. */
  data: Record<string, unknown> | null;
  /** Set when a fenced block exists but failed to parse as YAML. */
  error?: string;
}

const FENCE = /^---[ \t]*\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/;

/**
 * Extract and parse the leading `---`-fenced YAML front-matter from `text`.
 * Returns `{ data: null }` when no fenced block is present at the top of the
 * file; returns `{ data: null, error }` when a block is present but invalid.
 */
export function parseFrontMatter(text: string): FrontMatter {
  // Tolerate a UTF-8 BOM and leading blank lines before the opening fence.
  const stripped = text.replace(/^﻿/, '').replace(/^\s*\n/, '');
  const match = FENCE.exec(stripped);
  if (!match) return { data: null };

  let parsed: unknown;
  try {
    parsed = parseYaml(match[1] ?? '');
  } catch (err) {
    return { data: null, error: err instanceof Error ? err.message : String(err) };
  }

  if (parsed === null || parsed === undefined) return { data: null };
  if (typeof parsed !== 'object' || Array.isArray(parsed)) {
    return { data: null, error: 'front-matter is not a key/value mapping' };
  }
  return { data: parsed as Record<string, unknown> };
}

/** Coerce a YAML scalar into a trimmed string, or `undefined` when absent/empty. */
function asString(value: unknown): string | undefined {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  }
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return undefined;
}

/**
 * Coerce a YAML value into a list of strings. Accepts a real YAML sequence
 * (`[A, B]` or block list) or a single scalar (treated as a one-element list).
 * Returns `undefined` when the key is absent, the empty array when present but
 * empty.
 */
function asStringList(value: unknown): string[] | undefined {
  if (value === undefined || value === null) return undefined;
  if (Array.isArray(value)) {
    return value.map(asString).filter((v): v is string => v !== undefined);
  }
  const single = asString(value);
  return single === undefined ? [] : [single];
}

/**
 * Parse a `<FlowId>.flow.md` file into a {@link FlowDoc}. `path` is the
 * repo-relative POSIX path used for findings; `stem` is its filename stem
 * (the expected FlowId).
 */
export function parseFlowDoc(path: string, stem: string, text: string): FlowDoc {
  const { data, error } = parseFrontMatter(text);
  if (error) return { path, stem, parseError: error };
  if (data === null) return { path, stem, parseError: 'no YAML front-matter block found' };

  // Assign optional keys only when present — `exactOptionalPropertyTypes`
  // forbids setting them to an explicit `undefined`.
  const doc: FlowDoc = { path, stem };
  const id = asString(data.id);
  if (id !== undefined) doc.id = id;
  const screens = asStringList(data.screens);
  if (screens !== undefined) doc.screens = screens;
  const maestro = asString(data.maestro);
  if (maestro !== undefined) doc.maestro = maestro;
  return doc;
}

/**
 * Parse a `<ScreenId>.design.md` file into a {@link ScreenDoc}. Only the keys
 * `flow-lint` resolves (`id`, `composable`) are extracted; the richer screen
 * schema is the screen-design skill's concern.
 */
export function parseScreenDoc(path: string, stem: string, text: string): ScreenDoc {
  const { data, error } = parseFrontMatter(text);
  if (error) return { path, stem, parseError: error };
  if (data === null) return { path, stem, parseError: 'no YAML front-matter block found' };

  const doc: ScreenDoc = { path, stem };
  const id = asString(data.id);
  if (id !== undefined) doc.id = id;
  const composable = asString(data.composable);
  if (composable !== undefined) doc.composable = composable;
  return doc;
}
