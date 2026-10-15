import { COMPANY_BOARDS, type AtsProviderName } from "@/config/companies";
import { db } from "@/lib/db";
import { log } from "@/lib/logger";

export interface BoardRef {
  provider: AtsProviderName;
  slug: string;
  name: string;
}

/** Configured boards (config/companies.ts) plus any boards users added (CompanyBoard table). */
export async function listBoards(provider: AtsProviderName): Promise<BoardRef[]> {
  const boards = new Map<string, BoardRef>();
  for (const b of COMPANY_BOARDS) if (b.provider === provider) boards.set(b.slug, b);
  try {
    const rows = await db.companyBoard.findMany({
      where: { provider: provider.toUpperCase() as "GREENHOUSE" | "LEVER" | "ASHBY", enabled: true },
    });
    for (const r of rows) boards.set(r.slug, { provider, slug: r.slug, name: r.companyName });
  } catch (err) {
    log.warn("boards_db_unavailable", { provider, message: (err as Error).message });
  }
  return Array.from(boards.values());
}
