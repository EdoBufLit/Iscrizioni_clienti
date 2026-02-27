import { useCallback, useEffect } from "react";
import { useSearchParams } from "react-router-dom";

const DEFAULT_PAGE = 1;
const DEFAULT_PAGE_SIZE = 50;
const MIN_PAGE_SIZE = 10;
const MAX_PAGE_SIZE = 200;

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

const parsePage = (value: string | null) => {
  if (value == null || value.trim() === "") {
    return DEFAULT_PAGE;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 1 ? Math.floor(parsed) : DEFAULT_PAGE;
};

const parsePageSize = (value: string | null) => {
  if (value == null || value.trim() === "") {
    return DEFAULT_PAGE_SIZE;
  }
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return DEFAULT_PAGE_SIZE;
  }
  return clamp(Math.floor(parsed), MIN_PAGE_SIZE, MAX_PAGE_SIZE);
};

const normalizeQuery = (value: string | null) => value?.trim() ?? "";

type QueryStateUpdate = {
  q?: string;
  page?: number;
  pageSize?: number;
};

export function useSuperAdminOrganizationsQueryState() {
  const [searchParams, setSearchParams] = useSearchParams();

  const q = normalizeQuery(searchParams.get("q"));
  const page = parsePage(searchParams.get("page"));
  const pageSize = parsePageSize(searchParams.get("pageSize"));

  useEffect(() => {
    const hasPage = searchParams.has("page");
    const hasPageSize = searchParams.has("pageSize");
    if (hasPage && hasPageSize) {
      return;
    }

    const next = new URLSearchParams(searchParams);
    if (!hasPage) {
      next.set("page", String(page));
    }
    if (!hasPageSize) {
      next.set("pageSize", String(pageSize));
    }
    setSearchParams(next, { replace: true });
  }, [page, pageSize, searchParams, setSearchParams]);

  const updateQueryState = useCallback(
    (updates: QueryStateUpdate) => {
      const next = new URLSearchParams(searchParams);
      const nextQuery = normalizeQuery(updates.q ?? q);
      const nextPage = Math.max(DEFAULT_PAGE, Math.floor(updates.page ?? page));
      const nextPageSize = clamp(
        Math.floor(updates.pageSize ?? pageSize),
        MIN_PAGE_SIZE,
        MAX_PAGE_SIZE,
      );

      if (nextQuery) {
        next.set("q", nextQuery);
      } else {
        next.delete("q");
      }
      next.set("page", String(nextPage));
      next.set("pageSize", String(nextPageSize));

      setSearchParams(next, { replace: true });
    },
    [page, pageSize, q, searchParams, setSearchParams],
  );

  const setSearchQuery = useCallback(
    (nextQuery: string) => {
      updateQueryState({ q: nextQuery, page: DEFAULT_PAGE });
    },
    [updateQueryState],
  );

  const setPage = useCallback(
    (nextPage: number) => {
      updateQueryState({ page: nextPage });
    },
    [updateQueryState],
  );

  const setPageSize = useCallback(
    (nextPageSize: number) => {
      updateQueryState({ pageSize: nextPageSize, page: DEFAULT_PAGE });
    },
    [updateQueryState],
  );

  return {
    q,
    page,
    pageSize,
    setSearchQuery,
    setPage,
    setPageSize,
    updateQueryState,
  };
}
