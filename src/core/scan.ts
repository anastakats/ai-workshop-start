import { findSkills, type SkillFile } from './find.ts';
import { sortSkills, type Repository, type Skill } from './model.ts';
import { parseSkill } from './parse.ts';

/** A repository to scan: its files, and how to read them. */
export type Source = {
  repository: Repository;
  /** Every file path, relative to the repository root. */
  paths: string[];
  /** What listing the files had to leave out. */
  warnings: string[];
  /** The file's bytes, or why a listed file cannot be read. */
  read(path: string): Promise<Uint8Array | Missing>;
  /** When the directory last changed, any ISO 8601 date, or why that is unknown. */
  updated(directory: string): Promise<string | Missing>;
};

/** A listed file that is not there after all: `reason` tells the user what went wrong, and why. */
export type Missing = { reason: string };

export type ScanResult = { repository: Repository; skills: Skill[]; warnings: string[] };

/** fetch → find → parse. Nothing is stored: the result is all there is. */
export async function scan(source: Source): Promise<ScanResult> {
  const files = findSkills(source.paths);
  // The files are read at the same time: on GitHub, each one is a request.
  const results = await Promise.all(files.map((file) => readSkill(source, file)));
  return {
    repository: source.repository,
    skills: sortSkills(results.flatMap((result) => (result.skill ? [result.skill] : []))),
    warnings: [
      ...source.warnings,
      ...results.flatMap((result) => (result.warning ? [result.warning] : [])),
      ...unknownUpdates(results.flatMap((result) => (result.unknown ? [result.unknown] : []))),
    ],
  };
}

/** One warning for each reason, not one for each skill: the rate limit would repeat itself for every one. */
function unknownUpdates(reasons: string[]): string[] {
  return [...new Set(reasons)].map((reason) => {
    const count = reasons.filter((other) => other === reason).length;
    return `the last update of ${count} ${count === 1 ? 'skill' : 'skills'} is unknown: ${reason}`;
  });
}

async function readSkill(source: Source, file: SkillFile): Promise<{ skill?: Skill; warning?: string; unknown?: string }> {
  // Its directory, the skill itself: a change to any of its files is an update.
  const directory = file.path.slice(0, file.path.lastIndexOf('/'));
  const [bytes, updated] = await Promise.all([source.read(file.path), source.updated(directory).then(utc)]);
  if (!(bytes instanceof Uint8Array)) return { warning: `${file.path}: ${bytes.reason}; skipped` };
  const content = new TextDecoder().decode(bytes);
  const parsed = parseSkill(content);
  const skill: Skill = {
    id: `${source.repository.id}:${file.path}`,
    repository: source.repository.id,
    path: file.path,
    name: parsed.name ?? file.name,
    description: parsed.description,
    commit: source.repository.commit,
    copies: file.copies,
    content,
    updated: typeof updated === 'string' ? updated : '',
  };
  return { skill, warning: parsed.warning && `${file.path}: ${parsed.warning}`, unknown: typeof updated === 'string' ? undefined : updated.reason };
}

/** The same date in UTC, so that dates compare as text; or why it is not one. */
function utc(date: string | Missing): string | Missing {
  if (typeof date !== 'string') return date;
  const time = new Date(date);
  return Number.isNaN(time.getTime()) ? { reason: `not a date: ${date}` } : time.toISOString();
}
