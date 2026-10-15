import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { log } from "@/lib/logger";

export class AppError extends Error {
  constructor(
    message: string,
    public status = 400,
    public code = "bad_request",
  ) {
    super(message);
    this.name = "AppError";
  }
}

export const unauthorized = () => new AppError("Please sign in to continue.", 401, "unauthorized");
export const notFound = (what = "Resource") => new AppError(`${what} not found.`, 404, "not_found");

/** Convert any thrown value to a JSON response with a user-friendly message. */
export function errorResponse(err: unknown, context: string): NextResponse {
  if (err instanceof AppError) {
    return NextResponse.json({ error: err.message, code: err.code }, { status: err.status });
  }
  if (err instanceof ZodError) {
    const first = err.issues[0];
    const where = first?.path.length ? ` (${first.path.join(".")})` : "";
    return NextResponse.json(
      { error: `Invalid input${where}: ${first?.message ?? "please check your entries."}`, code: "validation" },
      { status: 400 },
    );
  }
  log.error("api_error", err, { context });
  return NextResponse.json(
    { error: "Something went wrong on our side. Please try again in a moment.", code: "internal" },
    { status: 500 },
  );
}

/** Wrap a route handler so thrown AppErrors / ZodErrors become friendly JSON responses. */
export function handler<A extends unknown[]>(context: string, fn: (...args: A) => Promise<Response>) {
  return async (...args: A): Promise<Response> => {
    try {
      return await fn(...args);
    } catch (err) {
      return errorResponse(err, context);
    }
  };
}
