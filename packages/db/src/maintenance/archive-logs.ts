import { join, win32 } from "node:path";

export interface ArchiveSummaryInput {
  archiveBefore: Date;
  archivedCount: number;
  outputPath: string;
}

export interface ArchiveSummary {
  archiveBefore: string;
  archivedCount: number;
  outputPath: string;
}

const ARCHIVE_CUTOFF_DAYS = 180;

export function calculateArchiveCutoff(now = new Date()): Date {
  return subtractUtcDays(now, ARCHIVE_CUTOFF_DAYS);
}

export function createArchiveFileName(now = new Date()) {
  const timestamp = now
    .toISOString()
    .replace(/\.\d{3}Z$/, "Z")
    .replace(/:/g, "-");

  return `logs_${timestamp}.json.gz`;
}

export function resolveArchiveDir(
  input: {
    env?: Partial<Record<"ARCHIVE_DIR" | "INIT_CWD", string>>;
    cwd?: string;
  } = {}
) {
  const env = input.env ?? process.env;

  if (env.ARCHIVE_DIR) {
    return env.ARCHIVE_DIR;
  }

  const baseDirectory = env.INIT_CWD ?? input.cwd ?? process.cwd();
  const joinPath = isWindowsPath(baseDirectory) ? win32.join : join;

  return joinPath(baseDirectory, "backups", "archive");
}

// Lets integration tests pin the run timestamp so the computed archive
// filename is deterministic instead of racing a wall-clock second boundary.
export function resolveNow(
  input: { env?: Partial<Record<"ARCHIVE_NOW", string>> } = {}
): Date {
  const env = input.env ?? process.env;
  return env.ARCHIVE_NOW ? new Date(env.ARCHIVE_NOW) : new Date();
}

export function toArchiveSummary(input: ArchiveSummaryInput): ArchiveSummary {
  return {
    archiveBefore: input.archiveBefore.toISOString(),
    archivedCount: input.archivedCount,
    outputPath: input.outputPath
  };
}

function subtractUtcDays(date: Date, days: number) {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() - days);
  return next;
}

function isWindowsPath(path: string) {
  return /^[a-zA-Z]:[\\/]/.test(path) || path.includes("\\");
}
