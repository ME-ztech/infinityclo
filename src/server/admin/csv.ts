/**
 * CSV export.
 *
 * Exported files are opened in spreadsheets, where a cell beginning with
 * `=`, `+`, `-`, `@` (or a tab / carriage return) is evaluated as a formula.
 * Customer-supplied text — a name, a note, an email — must never be able to do
 * that, so every such cell is prefixed with a single quote, which spreadsheets
 * treat as "this is text".
 */
const FORMULA_LEAD = /^[=+\-@\t\r]/;

export function csvCell(value: unknown): string {
  let text = value === null || value === undefined ? '' : String(value);
  if (FORMULA_LEAD.test(text)) text = `'${text}`;
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function toCsv(headers: readonly string[], rows: ReadonlyArray<readonly unknown[]>): string {
  const lines = [headers.map(csvCell).join(','), ...rows.map((row) => row.map(csvCell).join(','))];
  // BOM so Excel reads UTF-8; CRLF per RFC 4180.
  return `﻿${lines.join('\r\n')}\r\n`;
}

export function csvResponse(filename: string, body: string): Response {
  return new Response(body, {
    headers: {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': `attachment; filename="${filename.replace(/[^\w.-]/g, '_')}"`,
      'cache-control': 'no-store',
    },
  });
}
