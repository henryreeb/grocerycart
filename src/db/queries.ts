export interface Household {
  id: 1;
  passwordHash: string | null;
  preferredStoreId: string | null;
  timezone: string;
}

export interface Draft {
  id: number;
  draftWeek: string;
  status: "preparing" | "draft" | "submitting" | "partial" | "submitted";
}

export interface DraftItem {
  id: number;
  draftId: number;
  productId: string;
  quantity: number;
  source: "staple" | "search" | "import";
}

export async function getHousehold(db: D1Database): Promise<Household | null> {
  const row = await db.prepare("SELECT id, password_hash, preferred_store_id, timezone FROM households WHERE id = 1").first<{
    id: 1;
    password_hash: string | null;
    preferred_store_id: string | null;
    timezone: string;
  }>();
  return row ? { id: row.id, passwordHash: row.password_hash, preferredStoreId: row.preferred_store_id, timezone: row.timezone } : null;
}

export async function getDraftByWeek(db: D1Database, draftWeek: string): Promise<Draft | null> {
  const row = await db.prepare("SELECT id, draft_week, status FROM weekly_drafts WHERE draft_week = ?").bind(draftWeek).first<{
    id: number;
    draft_week: string;
    status: Draft["status"];
  }>();
  return row ? { id: row.id, draftWeek: row.draft_week, status: row.status } : null;
}

export async function createDraft(db: D1Database, draftWeek: string): Promise<Draft> {
  const result = await db.prepare("INSERT INTO weekly_drafts (draft_week, status) VALUES (?, 'draft') RETURNING id").bind(draftWeek).first<{ id: number }>();
  if (!result) throw new Error("Draft was not created");
  return { id: result.id, draftWeek, status: "draft" };
}
