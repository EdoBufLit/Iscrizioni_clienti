import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import useMemberSelection from "./useMemberSelection";

describe("member selection across pages and filters", () => {
  it("retains explicit choices across pages and toggles only the visible page", () => {
    const { result, rerender } = renderHook(({ ids }) => useMemberSelection({ status: "all" }, ids, 4), { initialProps: { ids: [1, 2] } });
    act(() => result.current.toggle(1));
    rerender({ ids: [3, 4] });
    act(() => result.current.togglePage());
    expect(result.current.selection).toEqual({ mode: "ids", member_ids: [1, 3, 4] });
    expect(result.current.count).toBe(3);
    act(() => result.current.togglePage());
    expect(result.current.selection).toEqual({ mode: "ids", member_ids: [1] });
  });

  it("selects the full filtered result without downloading IDs and tracks exclusions", () => {
    const { result, rerender } = renderHook(({ ids }) => useMemberSelection({ q: "Rossi", status: "active" }, ids, 140), { initialProps: { ids: [1, 2] } });
    act(() => result.current.selectAllFiltered());
    act(() => result.current.toggle(2));
    rerender({ ids: [26, 27] });
    expect(result.current.checkedIds).toEqual(new Set([26, 27]));
    expect(result.current.count).toBe(139);
    expect(result.current.selection).toEqual({ mode: "filtered", filters: { q: "Rossi", status: "active" }, excluded_ids: [2] });
    act(() => result.current.togglePage());
    expect(result.current.count).toBe(137);
    rerender({ ids: [1, 2] });
    act(() => result.current.toggle(2));
    expect(result.current.count).toBe(138);
  });

  it("clears selection as soon as the result filters change, while sorting preserves it", () => {
    const { result, rerender } = renderHook(({ status, order }) => useMemberSelection({ status, order }, [1, 2], 2), { initialProps: { status: "active", order: "joined_at_desc" } });
    act(() => result.current.selectAllFiltered());
    rerender({ status: "active", order: "last_name_asc" });
    expect(result.current.count).toBe(2);
    rerender({ status: "expired", order: "last_name_asc" });
    expect(result.current.count).toBe(0);
    expect(result.current.selection).toEqual({ mode: "ids", member_ids: [] });
    rerender({ status: "active", order: "last_name_asc" });
    expect(result.current.count).toBe(0);
    expect(result.current.selection).toEqual({ mode: "ids", member_ids: [] });
  });
});
