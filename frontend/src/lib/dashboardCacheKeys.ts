export function membersCacheKey(input: { q?: string; status?: string; access?: string; source?: string; docs?: string; order?: string; limit?: number; offset?: number }) {
  const params = new URLSearchParams();
  for (const name of ["q", "status", "access", "source", "docs", "order"] as const) if (input[name]) params.set(name, input[name]!);
  if (input.limit != null) params.set("limit", String(input.limit));
  if (input.offset != null) params.set("offset", String(input.offset));
  return `org-admin:members:${params.toString()}`;
}

export function quotesCacheKey(input: { year: number; memberId?: number; status?: string; q?: string; limit?: number; offset?: number }) {
  const params = new URLSearchParams({ year: String(input.year) });
  if (input.memberId != null) params.set("member_id", String(input.memberId));
  if (input.status) params.set("status", input.status);
  if (input.q) params.set("q", input.q);
  if (input.limit != null) params.set("limit", String(input.limit));
  if (input.offset != null) params.set("offset", String(input.offset));
  return `org-admin:quotes:${params.toString()}`;
}
