import { AxiosError } from "axios";

export interface ErrorCopy {
  code: string;
  label: string;
  description: string;
}

const KNOWN: Record<number, Omit<ErrorCopy, "code">> = {
  400: {
    label: "BAD REQUEST",
    description: "The request wasn't valid. Check the address and try again.",
  },
  401: {
    label: "UNAUTHORIZED",
    description: "You need to sign in before opening this page.",
  },
  403: {
    label: "ACCESS FORBIDDEN",
    description: "You don't have permission to view this page.",
  },
  404: {
    label: "PAGE NOT FOUND",
    description: "This page doesn't exist or may have been moved.",
  },
  408: {
    label: "REQUEST TIMEOUT",
    description: "The request took too long. Please try again.",
  },
  429: {
    label: "TOO MANY REQUESTS",
    description: "Too many requests were sent. Wait a moment and try again.",
  },
  500: {
    label: "INTERNAL SERVER ERROR",
    description: "Something went wrong on our side. Please try again later.",
  },
  502: {
    label: "BAD GATEWAY",
    description: "The server got an invalid response. Please try again shortly.",
  },
  503: {
    label: "SERVICE UNAVAILABLE",
    description: "Place2Park is temporarily unavailable. Please try again shortly.",
  },
};

/** User-facing copy for an HTTP status. Never includes a server body or stack. */
export function errorCopy(status: number): ErrorCopy {
  const known = KNOWN[status];
  if (known) return { code: String(status), ...known };
  return {
    code: String(status),
    label: status >= 500 ? "SERVICE ERROR" : "REQUEST FAILED",
    description: "This request couldn't be completed. Please try again later.",
  };
}

/**
 * Status for a failed page load.
 * A missing HTTP response means the API could not be reached (503).
 * A client timeout is 408. The response status is kept when the server sent one.
 */
export function pageErrorStatus(err: unknown): number {
  if (err instanceof AxiosError) {
    const status = err.response?.status;
    if (typeof status === "number" && status >= 400) return status;
    if (err.code === "ECONNABORTED" || /timeout/i.test(err.message)) return 408;
    return 503;
  }
  return 500;
}
