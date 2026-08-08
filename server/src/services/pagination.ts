import type { Paginated } from "@erp/shared";

/** Parse `?page=&pageSize=&search=` query params with safe bounds. */
export function parsePageParams(q: any): {
  page: number;
  pageSize: number;
  search?: string;
} {
  const page = Math.max(1, Number(q?.page) || 1);
  const pageSize = Math.min(100, Math.max(1, Number(q?.pageSize) || 20));
  const search = q?.search ? String(q.search).trim() : "";
  return { page, pageSize, search: search || undefined };
}

/** Run a count + a page query in parallel and wrap them as a Paginated result. */
export async function paginate<T>(
  page: number,
  pageSize: number,
  count: () => Promise<number>,
  find: (skip: number, take: number) => Promise<T[]>
): Promise<Paginated<T>> {
  const [total, items] = await Promise.all([
    count(),
    find((page - 1) * pageSize, pageSize),
  ]);
  return { items, total, page, pageSize };
}
