import { Prisma } from '../generated/prisma/client.js';
type Line = {
  kind: string;
  level: number;
  net: Prisma.Decimal;
  tax: Prisma.Decimal;
  total: Prisma.Decimal;
};
// Display-only section totals must never enter the document total a second time.
export function sectionTotals<T extends Line>(lines: T[]) {
  let net = new Prisma.Decimal(0),
    tax = new Prisma.Decimal(0);
  let segmentNet = net,
    segmentTax = tax;
  const stack: { level: number; net: Prisma.Decimal; tax: Prisma.Decimal }[] = [];
  for (const line of lines) {
    if (line.kind === 'ITEM') {
      net = net.plus(line.net);
      tax = tax.plus(line.tax);
    } else if (line.kind === 'TITLE') {
      while (stack.length && stack.at(-1)!.level >= line.level) stack.pop();
      stack.push({ level: line.level, net, tax });
    } else if (line.kind === 'SUBTOTAL') {
      const index = stack.findLastIndex((s) => s.level === line.level);
      const start = index >= 0 ? stack[index] : { net: segmentNet, tax: segmentTax };
      line.net = net.minus(start.net);
      line.tax = tax.minus(start.tax);
      line.total = line.net.plus(line.tax);
      if (index >= 0) stack.splice(index);
      segmentNet = net;
      segmentTax = tax;
    }
  }
  return lines;
}
