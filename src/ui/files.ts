/** Reading files the user picks and handing files back as downloads. */

import { FILE_EXTENSION, fileBaseName, parseProject, serialize } from '../model/serialize';
import type { Doc } from '../model/types';

export function download(data: BlobPart, fileName: string, type: string): void {
  const url = URL.createObjectURL(new Blob([data], { type }));
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  link.style.display = 'none';
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

/** Opens the system's file dialog. Resolves with null when it is cancelled. */
export function pickFile(accept: string): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = accept;
    input.style.display = 'none';
    input.addEventListener('change', () => {
      resolve(input.files?.[0] ?? null);
      input.remove();
    });
    input.addEventListener('cancel', () => {
      resolve(null);
      input.remove();
    });
    document.body.appendChild(input);
    input.click();
  });
}

export const PROJECT_ACCEPT = `${FILE_EXTENSION},.json,.html,.htm,application/json,text/html`;

export async function readProject(file: File): Promise<Doc> {
  return parseProject(await file.text());
}

export function saveProject(doc: Doc): string {
  const name = fileBaseName(doc) + FILE_EXTENSION;
  download(serialize(doc), name, 'application/json');
  return name;
}
