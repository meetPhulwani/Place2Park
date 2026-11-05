import { connectDb } from "../config/db.js";
import { AdminAccount } from "../models/AdminAccount.js";
import { openSecret, reencryptSecret } from "../utils/admin-secret.js";

async function main() {
  await connectDb();
  const accounts = await AdminAccount.find().select("+totpSecret");
  let rotated = 0;
  for (const account of accounts) {
    const current = account.totpSecret;
    const version = Number(process.env.ADMIN_TOTP_KEY_VERSION || 1);
    if (current.startsWith(`v${version}.`)) continue;
    const next = reencryptSecret(current);
    if (openSecret(next) !== openSecret(current)) throw new Error("Re-encryption did not match.");
    account.totpSecret = next;
    account.totpKeyVersion = Number(process.env.ADMIN_TOTP_KEY_VERSION || 1);
    await account.save();
    rotated += 1;
  }
  console.info(`TOTP secrets re-encrypted: ${rotated}. Previous sessions stay valid until the authenticator secret itself changes.`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : "Rotation failed.");
  process.exit(1);
});
