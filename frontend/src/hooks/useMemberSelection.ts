import { useEffect, useMemo, useState } from "react";

export type MemberSelectionFilters = {
  q?: string; status?: string; access?: string; source?: string; docs?: string; order?: string;
};

export type MemberSelection =
  | { mode: "ids"; member_ids: number[] }
  | { mode: "filtered"; filters: MemberSelectionFilters; excluded_ids: number[] };

type SelectionState = { key: string; mode: "ids" | "filtered"; ids: Set<number> };

/** A filtered selection stores exclusions; changing its filters clears it immediately. */
export default function useMemberSelection(filters: MemberSelectionFilters, visibleIds: number[], total: number) {
  const key = JSON.stringify([filters.q || "", filters.status || "", filters.access || "", filters.source || "", filters.docs || ""]);
  const [stored, setStored] = useState<SelectionState>({ key, mode: "ids", ids: new Set() });
  useEffect(() => {
    setStored((previous) => previous.key === key ? previous : { key, mode: "ids", ids: new Set() });
  }, [key]);
  const active = useMemo<SelectionState>(
    () => stored.key === key ? stored : { key, mode: "ids", ids: new Set() },
    [key, stored],
  );
  const checkedIds = useMemo(() => new Set(visibleIds.filter((id) => active.mode === "filtered" ? !active.ids.has(id) : active.ids.has(id))), [active, visibleIds]);
  const count = active.mode === "filtered" ? Math.max(0, total - active.ids.size) : active.ids.size;
  const allVisibleChecked = visibleIds.length > 0 && checkedIds.size === visibleIds.length;
  const selection: MemberSelection = active.mode === "filtered"
    ? { mode: "filtered", filters: { ...filters }, excluded_ids: [...active.ids] }
    : { mode: "ids", member_ids: [...active.ids] };

  const update = (ids: number[], remove: boolean) => {
    setStored((previous) => {
      const current = previous.key === key ? previous : { key, mode: "ids" as const, ids: new Set<number>() };
      const next = new Set(current.ids);
      for (const id of ids) {
        // In filtered mode a removed checkbox adds an exclusion.
        if ((current.mode === "filtered") === remove) next.add(id);
        else next.delete(id);
      }
      return { ...current, ids: next };
    });
  };

  return {
    selection, count, checkedIds, allVisibleChecked, mode: active.mode,
    toggle: (id: number) => update([id], checkedIds.has(id)),
    togglePage: () => update(visibleIds, allVisibleChecked),
    selectAllFiltered: () => setStored({ key, mode: "filtered", ids: new Set() }),
    clear: () => setStored({ key, mode: "ids", ids: new Set() }),
  };
}
