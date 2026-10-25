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

If `duplicateCount > 0` **or** `missingOrNull > 0`, reconcile those documents in Atlas **before** creating the unique index. Do not delete paid bookings, payments, or payouts without an operator review.

The duplicate check ignores grouped `null` keys. MongoDB unique indexes treat missing, `null`, and (for string fields) empty values as the same key, so two documents without `idempotencyKey` will make `createIndex` fail even when `duplicateCount` is 0. `ensure-indexes` now counts those rows and skips `--apply` until they have distinct values.

Suggested reconciliation (manual, after a backup):

1. Snapshot the collection.
2. For `users.email`: keep the oldest verified / Google-linked account; merge or disable extras.
3. For `bookings.code`: assign a new unused `PK-…` code to the newer row.
4. For `payments.bookingId`: keep the `PAID` / `REFUNDED` row; archive extras.
5. For `hostpayouts.idempotencyKey`: keep the row that already has `bookingIds` claimed. Two known ghost `PAID` test rows (`6aca47868ea9ca4c01017b91`, `6aca47868ea9ca4c01017b92`) have no key and no bookings — stamp them first (see below). Do not delete them or mark them unpaid.
6. For `favorites`: delete the newer duplicate pair.

## Stamp legacy ghost payout keys (before hostpayouts unique index)

Backup first (`E:\Place2Park-Backup\Place2Park` already exists). Dry-run only until the printed rows match the two expected IDs:

```bash
npx tsx src/scripts/stamp-legacy-payout-keys.ts
```

Writes require both flags and still refuse if an ID is missing, not `PAID`, already has a different key, has `bookingIds`, is referenced by a booking, or the proposed key collides:

```bash
npx tsx src/scripts/stamp-legacy-payout-keys.ts --apply --confirm
```

Proposed keys are `legacy:untracked:<_id>`. Status, amount, `paidAt`, events, and `bookingIds` are never changed.

## Apply (only after a clean dry-run)

```bash
npx tsx src/scripts/ensure-indexes.ts --apply
```

Creates **missing** unique indexes with `background: true`. Skips any spec that still has duplicates, missing/null/empty unique-field values, or an existing **non-unique** index on the same key. Never drops or replaces an index. If `nonUnique=true`, create a uniquely named unique index in Atlas after reconciling data, then remove the non-unique index manually.

Do not wire this into Render start. Do not run `--apply` from CI against production.

## Atlas dashboard check

In Atlas → Database → Browse Collections → Indexes, confirm a **unique** index exists for each row in the table above. Point-in-time restore should stay enabled so a bad apply can be rolled back.
