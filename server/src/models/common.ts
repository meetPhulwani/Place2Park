/** Shared toJSON options: expose `id`, hide `_id`/`__v`. */
export const baseToJSON = {
  virtuals: true,
  versionKey: false,
  transform(_doc: unknown, ret: Record<string, unknown>) {
    ret.id = String(ret._id);
    delete ret._id;
    return ret;
  },
} as const;
