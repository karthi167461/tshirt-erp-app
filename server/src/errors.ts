import type { ErrorCode } from "@erp/shared";

/** An error whose `code` is an i18n key the client will translate. */
export class ApiException extends Error {
  code: ErrorCode | string;
  statusCode: number;
  params?: Record<string, string | number>;

  constructor(
    code: ErrorCode | string,
    statusCode = 400,
    params?: Record<string, string | number>
  ) {
    super(code);
    this.code = code;
    this.statusCode = statusCode;
    this.params = params;
  }
}
