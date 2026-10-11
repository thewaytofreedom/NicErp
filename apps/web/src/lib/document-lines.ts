import type { DocLine } from './client';

export function numberQuoteLines(lines: DocLine[]) {
  let next = Math.max(-1, ...lines.map((line) => line.position ?? -1)) + 1;
  return lines
    .map((line) => ({ ...line, position: line.position ?? next++ }))
    .sort((a, b) => a.position - b.position);
}

export function printableLines(lines: DocLine[]) {
  const stack: { level: number; hidden: boolean }[] = [];
  return lines.filter((line) => {
    const level = line.level ?? 1;
    if (line.kind === 'TITLE') {
      while (stack.length && stack.at(-1)!.level >= level) stack.pop();
      const visible = !stack.some((s) => s.hidden);
      stack.push({ level, hidden: !!line.hidden });
      return visible;
    }
    if (line.kind === 'SUBTOTAL') {
      const index = stack.findLastIndex((s) => s.level === level);
      if (index >= 0) stack.splice(index);
    }
    return !line.hidden && !stack.some((s) => s.hidden);
  });
}
