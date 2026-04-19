import { readdirSync } from 'fs';
import { join } from 'path';

export function loadFilesRecursively(dir: string): string[] {
  const files: string[] = [];

  function scan(currentPath: string) {
    const entries = readdirSync(currentPath, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = join(currentPath, entry.name);

      if (entry.isDirectory()) {
        scan(fullPath);
      } else {
        files.push(fullPath);
      }
    }
  }

  scan(dir);
  return files;
}