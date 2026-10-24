/**
 * Shared error taxonomy used by both server routes and client code so
 * error → user-facing message mapping stays consistent.
 */
export class InvalidUrlError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidUrlError";
  }
}

export class BlockedUrlError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BlockedUrlError";
  }
}

export class TimeoutError extends Error {
  constructor(message = "The request timed out.") {
    super(message);
    this.name = "TimeoutError";
  }
}

export class NetworkError extends Error {
  constructor(message = "A network error occurred while contacting the server.") {
    super(message);
    this.name = "NetworkError";
  }
}

export class UpstreamError extends Error {
  readonly httpStatus?: number;
  constructor(message: string, httpStatus?: number) {
    super(message);
    this.name = "UpstreamError";
    this.httpStatus = httpStatus;
  }
}

/** True when the error is a DOMException "AbortError" (fetch/abort cancellation). */
export function isAbortError(error: unknown): boolean {
  return (
    error instanceof DOMException &&
    (error.name === "AbortError" || error.name === "TimeoutError")
  );
}
