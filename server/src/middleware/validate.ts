import type { Request, Response, NextFunction } from "express";
import type { ZodSchema } from "zod";

/** Validates req.body against a Zod schema; replaces body with parsed data. */
export function validate(schema: ZodSchema) {
  return (req: Request, res: Response, next: NextFunction) => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      const first = result.error.issues[0];
      res.status(422).json({
        success: false,
        message: first ? `${first.message}` : "Invalid input.",
        errors: result.error.flatten().fieldErrors,
      });
      return;
    }
    req.body = result.data;
    next();
  };
}
