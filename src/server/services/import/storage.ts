/**
 * Import file storage. Local disk in dev/phase-0; the interface is the seam
 * for the S3 implementation later. The raw upload is RETAINED as the lossless
 * fallback that makes every "acceptable loss" decision reversible.
 */
import { mkdir, readFile, writeFile } from "fs/promises";
import { join } from "path";

export interface ImportFileStorage {
  /** Returns the fileRef persisted on the ImportJob row. */
  save(userId: number, filename: string, data: Buffer): Promise<string>;
  load(fileRef: string): Promise<Buffer>;
}

export class LocalImportFileStorage implements ImportFileStorage {
  constructor(
    private readonly baseDir: string = process.env.IMPORT_STORAGE_DIR ?? "data/imports"
  ) {}

  async save(userId: number, filename: string, data: Buffer): Promise<string> {
    const safe = filename.replace(/[^a-zA-Z0-9._-]/g, "_").slice(-100);
    const ref = `${userId}/${Date.now()}-${safe}`;
    await mkdir(join(this.baseDir, String(userId)), { recursive: true });
    await writeFile(join(this.baseDir, ref), data);
    return ref;
  }

  async load(fileRef: string): Promise<Buffer> {
    if (fileRef.includes("..")) throw new Error("Invalid fileRef");
    return readFile(join(this.baseDir, fileRef));
  }
}

export const importFileStorage: ImportFileStorage = new LocalImportFileStorage();
