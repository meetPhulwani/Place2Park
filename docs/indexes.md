# MongoDB unique indexes — Place2Park

Production disables Mongoose `autoIndex` (`server/src/config/db.ts`). The API only calls `ParkingSpace.syncIndexes()` on boot. Unique keys for users, bookings, payments, payouts, and favorites may therefore be missing on Atlas.

**This repo never drops indexes and never deletes duplicate production rows.**

## Required unique indexes

| Collection | Fields | Why |
|---|---|---|
| `users` | `email` | One account per email |
| `bookings` | `code` | Public booking codes |
| `payments` | `bookingId` | One payment document per booking |
| `hostpayouts` | `idempotencyKey` | Prevents duplicate payout requests |
| `favorites` | `userId` + `spaceId` | Favorite toggle |

Source of truth: `server/src/utils/indexes.ts` (`REQUIRED_UNIQUE_INDEXES`).

## Check (dry-run, no writes)

From `server/`:

```bash
npx tsx src/scripts/ensure-indexes.ts
```

Uses `MONGODB_URI` + `MONGODB_DB`. Prints each index, whether a unique index already exists, and any duplicate keys. It does **not** create or drop indexes.

If `duplicateCount > 0`, reconcile those documents in Atlas **before** creating the unique index. Do not delete paid bookings, payments, or payouts without an operator review.

Suggested reconciliation (manual, after a backup):

1. Snapshot the collection.
2. For `users.email`: keep the oldest verified / Google-linked account; merge or disable extras.
3. For `bookings.code`: assign a new unused `PK-…` code to the newer row.
4. For `payments.bookingId`: keep the `PAID` / `REFUNDED` row; archive extras.
5. For `hostpayouts.idempotencyKey`: keep the row that already has `bookingIds` claimed.
6. For `favorites`: delete the newer duplicate pair.

## Apply (only after a clean dry-run)

```bash
npx tsx src/scripts/ensure-indexes.ts --apply
```

Creates **missing** unique indexes with `background: true`. Skips any spec that still has duplicates. Never drops an index.

Do not wire this into Render start. Do not run `--apply` from CI against production.

## Atlas dashboard check

In Atlas → Database → Browse Collections → Indexes, confirm a **unique** index exists for each row in the table above. Point-in-time restore should stay enabled so a bad apply can be rolled back.
