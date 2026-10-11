export function parseCSV(source: string): Record<string, string>[] {
  const input = source.replace(/^\uFEFF/, ''),
    rows: string[][] = [];
  let row: string[] = [],
    cell = '',
    quoted = false;
  for (let i = 0; i < input.length; i++) {
    const c = input[i];
    if (c === '"') {
      if (quoted && input[i + 1] === '"') {
        cell += '"';
        i++;
      } else quoted = !quoted;
    } else if (c === ',' && !quoted) {
      row.push(cell);
      cell = '';
    } else if ((c === '\n' || c === '\r') && !quoted) {
      if (c === '\r' && input[i + 1] === '\n') i++;
      row.push(cell);
      if (row.some((x) => x.trim())) rows.push(row);
      row = [];
      cell = '';
    } else cell += c;
  }
  if (quoted) throw Error('CSV 引号未闭合');
  row.push(cell);
  if (row.some((x) => x.trim())) rows.push(row);
  const headers = rows.shift()?.map((x) => x.trim());
  if (!headers?.length || new Set(headers).size !== headers.length)
    throw Error('CSV 表头为空或重复');
  return rows.map((r, i) => {
    if (r.length !== headers.length) throw Error(`第 ${i + 2} 行列数不一致`);
    return Object.fromEntries(headers.map((h, j) => [h, r[j].trim()]));
  });
}
export function downloadCSV(name: string, headers: string[], rows: unknown[][]) {
  const esc = (v: unknown) => {
    let s = String(v ?? '');
    if (/^[\s]*[=+\-@]/.test(s)) s = "'" + s;
    return '"' + s.replaceAll('"', '""') + '"';
  };
  const blob = new Blob(
    ['\uFEFF' + [headers, ...rows].map((r) => r.map(esc).join(',')).join('\r\n')],
    { type: 'text/csv;charset=utf-8' },
  );
  const href = URL.createObjectURL(blob),
    a = document.createElement('a');
  a.href = href;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(href), 1000);
}
