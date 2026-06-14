import type { DeepforgeContext } from "./client.js";

export interface ManagerInfo {
  id: string;
  owner: string;
}

/** Read a PredictManager shared object and return its id + owner. */
export async function getManager(
  ctx: DeepforgeContext,
  managerId: string,
): Promise<ManagerInfo> {
  const resp = await ctx.client.getObject({
    id: managerId,
    options: { showContent: true },
  });
  if (resp.error || !resp.data || resp.data.content?.dataType !== "moveObject") {
    throw new Error(`manager ${managerId} not found`);
  }
  const fields = resp.data.content.fields as Record<string, unknown>;
  if (!resp.data.content.type.endsWith("::predict_manager::PredictManager")) {
    throw new Error(`object ${managerId} is not a PredictManager`);
  }
  return { id: managerId, owner: String(fields.owner ?? "") };
}

/** Verify an existing manager belongs to `owner`. */
export async function isManagerOwnedBy(
  ctx: DeepforgeContext,
  managerId: string,
  owner: string,
): Promise<boolean> {
  try {
    const m = await getManager(ctx, managerId);
    return m.owner.toLowerCase() === owner.toLowerCase();
  } catch {
    return false;
  }
}
