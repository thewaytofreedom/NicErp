import { BadRequestException } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service.js';
import { Prisma } from '../generated/prisma/client.js';

// MyProduct links products through shared replacement numbers, including transitive links.
// Resolve at read time so editing/removing a number never leaves stale merged custom codes.
export async function equivalentProductIds(db: PrismaService, companyId: string, number: string) {
  let frontier = await db.product.findMany({
    where: {
      companyId,
      OR: [
        { sku: { equals: number, mode: 'insensitive' } },
        { relatedNumbers: { has: number.toUpperCase() } },
      ],
    },
    select: { id: true, relatedNumbers: true },
  });
  const ids = new Set<string>();
  const visitedNumbers = new Set<string>();
  while (frontier.length) {
    const numbers = new Set<string>();
    for (const p of frontier) {
      ids.add(p.id);
      for (const n of p.relatedNumbers) if (!visitedNumbers.has(n)) numbers.add(n);
    }
    if (!numbers.size) break;
    for (const n of numbers) visitedNumbers.add(n);
    frontier = await db.product.findMany({
      where: { companyId, relatedNumbers: { hasSome: [...numbers] }, id: { notIn: [...ids] } },
      select: { id: true, relatedNumbers: true },
    });
  }
  return [...ids];
}

const genuineChina = new Set([
  'DCEC2026',
  'CCEC2026',
  'CCEC2026J',
  'XCEC2026',
  'BFCEC2026',
  'EASIA2026',
  'GCIC2026',
  'WC2025',
  'CMI2026',
  'ACPL2026',
  'FG_CN2025',
  'FILTER_CN2025',
  'SET',
  'CEFS2026',
]);
const importedChina = new Set(['IM_CPG2026', 'IM2026', 'CAT2025', 'CAT2026']);
const overseas = new Set(['SN_CPG2026', 'SN2026', 'BAUDOUIN2025', 'FILTER_SN2025', 'MIT_SN2025']);
type Candidate = { id: string; sku: string; sourceTag: string; salePrice: Prisma.Decimal };
export function chooseImportProduct<T extends Candidate>(
  products: T[],
  preference: string,
): T | undefined {
  if (!['1', '2', '3', '4', '5', '6', '7'].includes(preference))
    throw new BadRequestException('无效货源偏好');
  const hasGenuineChina = products.some((p) => genuineChina.has(p.sourceTag.toUpperCase()));
  const eligible = products.filter((p) => {
    const tag = p.sourceTag.toUpperCase();
    const china = genuineChina.has(tag) || importedChina.has(tag);
    switch (preference) {
      case '1':
        return china || overseas.has(tag);
      case '2':
        return hasGenuineChina ? genuineChina.has(tag) : china || overseas.has(tag) || tag === 'WD';
      case '3':
        return china;
      case '4':
        return hasGenuineChina ? genuineChina.has(tag) : china || tag === 'WD';
      case '5':
        return overseas.has(tag);
      case '6':
        return tag === 'WD';
      case '7':
        return true;
      default:
        return false;
    }
  });
  return eligible.sort(
    (a, b) => a.salePrice.comparedTo(b.salePrice) || a.sku.localeCompare(b.sku),
  )[0];
}
