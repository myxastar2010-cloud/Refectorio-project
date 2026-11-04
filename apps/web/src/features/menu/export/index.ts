import regularUrl from '../../../assets/fonts/pdf/open-runde-400.ttf?url';
import boldUrl from '../../../assets/fonts/pdf/open-runde-700.ttf?url';
import { exportModel, type ExportInput } from './model';
import { parseTrueType } from './ttf';
import { toCsv, toIcs, toTxt } from './text';
import { toXlsx } from './xlsx';

/**
 * The downloads of the ⋯ menu (ТЗ фаза 4 §10) — a lazy chunk, loaded on the first click. Each format renders its own
 * layout from one model of the week; the backup is the store's own file.
 */
export const EXPORT_FORMATS = ['png', 'jpeg', 'pdf', 'xlsx', 'csv', 'ics', 'txt', 'json'] as const;
export type ExportFormat = (typeof EXPORT_FORMATS)[number];

const TYPES: Readonly<Record<ExportFormat, string>> = {
  png: 'image/png',
  jpeg: 'image/jpeg',
  pdf: 'application/pdf',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  csv: 'text/csv;charset=utf-8',
  ics: 'text/calendar;charset=utf-8',
  txt: 'text/plain;charset=utf-8',
  json: 'application/json',
};
const EXTENSIONS: Readonly<Record<ExportFormat, string>> = {
  png: 'png',
  jpeg: 'jpg',
  pdf: 'pdf',
  xlsx: 'xlsx',
  csv: 'csv',
  ics: 'ics',
  txt: 'txt',
  json: 'json',
};

async function fontFile(url: string) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`font ${url}: ${String(response.status)}`);
  return parseTrueType(new Uint8Array(await response.arrayBuffer()));
}

export type ExportRequest = ExportInput & {
  readonly format: ExportFormat;
  /** The backup file's contents (JSON) — the store makes it. */
  readonly backup: () => unknown;
  readonly landscape: boolean;
};

/** Renders the file; returns it with its name. */
export async function renderExport(
  request: ExportRequest,
): Promise<{ readonly blob: Blob; readonly name: string }> {
  const model = exportModel(request);
  const { format } = request;
  const name = `${model.fileBase}.${EXTENSIONS[format]}`;
  const type = TYPES[format];
  const blob = async (): Promise<Blob> => {
    switch (format) {
      case 'png':
      case 'jpeg': {
        const { toImage } = await import('./image');
        return toImage(model, request.landscape ? 'landscape' : 'portrait', type as 'image/png');
      }
      case 'pdf': {
        const [{ toPdf }, regular, bold] = await Promise.all([
          import('./pdf'),
          fontFile(regularUrl),
          fontFile(boldUrl),
        ]);
        return new Blob([toPdf(model, { regular, bold })], { type });
      }
      case 'xlsx':
        return new Blob([toXlsx(model)], { type });
      case 'csv':
        return new Blob([toCsv(model)], { type });
      case 'ics':
        return new Blob([toIcs(model)], { type });
      case 'txt':
        return new Blob([toTxt(model)], { type });
      case 'json':
        return new Blob([JSON.stringify(request.backup(), null, 1)], { type });
    }
  };
  return { blob: await blob(), name };
}

/**
 * Saves a file: a link with `download`; on iPhone and iPad, where such a link opens the file instead, the share sheet
 * («Сохранить в Файлы»).
 */
export async function saveFile(blob: Blob, name: string): Promise<void> {
  const ios =
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const file = new File([blob], name, { type: blob.type });
  if (ios && typeof navigator.canShare === 'function' && navigator.canShare({ files: [file] })) {
    await navigator.share({ files: [file], title: name });
    return;
  }
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  link.rel = 'noopener';
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => {
    URL.revokeObjectURL(url);
  }, 30_000);
}
