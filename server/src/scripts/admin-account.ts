import { connectDb } from "../config/db.js";
import { AdminAccount } from "../models/AdminAccount.js";
import { lockAdminByEmail, provisionSuperAdmin, recoverAdminAccount } from "../services/admin-auth.js";
import { SECURITY_QUESTIONS, type SecurityQuestionId } from "../utils/admin-access.js";
import { randomBase32, totpUri } from "../utils/totp.js";

function ask(label: string) {
  return new Promise<string>((resolve) => {
    process.stdout.write(label);
    process.stdin.resume();
    process.stdin.setEncoding("utf8");
    process.stdin.once("data", (chunk) => {
      process.stdin.pause();
      resolve(String(chunk).trim());
    });
  });
}

function askHidden(label: string) {
  return new Promise<string>((resolve) => {
    process.stdout.write(label);
    const stdin = process.stdin;
    stdin.setRawMode?.(true);
    stdin.resume();
    stdin.setEncoding("utf8");
    let value = "";
    const onData = (chunk: string) => {
      if (chunk === "\r" || chunk === "\n") {
        stdin.setRawMode?.(false);
        stdin.pause();
        stdin.off("data", onData);
        process.stdout.write("\n");
        resolve(value);
        return;
      }
      if (chunk === "\u0003") process.exit(1);
      if (chunk === "\u007f") {
        value = value.slice(0, -1);
        return;
      }
      value += chunk;
    };
    stdin.on("data", onData);
  });
}

async function main() {
  const command = process.argv[2];
  if (command !== "provision" && command !== "recover" && command !== "lock") {
    console.error("Use provision, recover, or lock.");
    process.exit(1);
  }
  await connectDb();
  if (command === "provision" && (await AdminAccount.exists({ role: "SUPER_ADMIN" }))) {
    console.error("A Super Admin already exists.");
    process.exit(1);
  }
  const email = (await ask("Email: ")).toLowerCase();
  if (command === "lock") {
    await lockAdminByEmail(email);
    console.info("Administrator locked and sessions revoked.");
    process.exit(0);
  }
  const name = command === "provision" ? await ask("Name: ") : "Owner";
  const password = await askHidden("Password: ");
  const confirm = await askHidden("Confirm password: ");
  if (password !== confirm) {
    console.error("Passwords did not match.");
    process.exit(1);
  }
  SECURITY_QUESTIONS.forEach((item, index) => {
    process.stdout.write(`${index + 1}. ${item.text}\n`);
  });
  const picked = Number(await ask("Question number: "));
  const question = SECURITY_QUESTIONS[picked - 1];
  if (!question) {
    console.error("Choose a question from the list.");
    process.exit(1);
  }
  const answer = await askHidden("Security answer: ");
  const secret = randomBase32();
  process.stdout.write(`Authenticator setup (shown once):\n${totpUri(email, secret)}\n`);
  const code = await ask("Authenticator code: ");
  if (command === "provision") {
    await provisionSuperAdmin({
      email,
      name,
      password,
      questionId: question.id as SecurityQuestionId,
      answer,
      totpCode: code,
      totpSecret: secret,
    });
    console.info("Super Admin enabled.");
  } else {
    await recoverAdminAccount({
      email,
      password,
      questionId: question.id as SecurityQuestionId,
      answer,
      totpCode: code,
      totpSecret: secret,
    });
    console.info("Administrator recovered and previous sessions revoked.");
  }
  process.exit(0);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : "Provisioning failed.");
  process.exit(1);
});
