// Minimal CSV parser for our own well-formed data files. Handles quoted fields
// (with embedded commas, newlines, and "" escapes) and CRLF or LF line endings.
// Returns one record per row, keyed by the trimmed header columns. Blank lines
// are skipped. Not a general-purpose parser — just enough for our schema.

export function parseCsv(text: string): Record<string, string>[] {
  const rows = parseRows(text);
  if (rows.length === 0) return [];
  const headers = (rows[0] ?? []).map((h) => h.trim());
  const records: Record<string, string>[] = [];
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i] ?? [];
    if (row.length === 1 && row[0] === "") continue;
    const record: Record<string, string> = {};
    headers.forEach((header, j) => {
      record[header] = (row[j] ?? "").trim();
    });
    records.push(record);
  }
  return records;
}

function parseRows(text: string): string[][] {
  const rows: string[][] = [];
  let field = "";
  let row: string[] = [];
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      row.push(field);
      field = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      field = "";
      rows.push(row);
      row = [];
    } else {
      field += ch;
    }
  }
  // Flush the trailing field/row when the file has no final newline.
  if (field !== "" || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}
