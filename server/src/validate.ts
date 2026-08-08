import type { ZodTypeAny, output } from "zod";
import { ErrorCode } from "@erp/shared";
import { ApiException } from "./errors.js";

/**
 * Parse `data` with a Zod schema, throwing a translatable ApiException on failure.
 * Returns the schema's OUTPUT type (defaults applied), so callers get concrete
 * types for fields like `active` that carry `.default(...)`.
 */
export function parse<S extends ZodTypeAny>(schema: S, data: unknown): output<S> {
  const result = schema.safeParse(data);
  if (!result.success) {
    const first = result.error.issues[0];
    throw new ApiException(ErrorCode.VALIDATION, 400, {
      field: first?.path.join(".") ?? "",
      detail: first?.message ?? "",
    });
  }
  return result.data;
}
