import { expect, test } from "@playwright/test";
import { DEMO_PASSWORD, DRIVER_EMAIL, SPARE_DRIVER_EMAIL, login } from "./support";

test("deletion lives in Settings and the button stays disabled until CONFIRM is typed", async ({ page }) => {
  await login(page, DRIVER_EMAIL);
  await page.goto("/profile");
  await expect(page.getByRole("button", { name: "Delete account" })).toHaveCount(0);

  await page.goto("/settings");
  await page.getByRole("button", { name: "Delete account" }).click();
  await page.getByRole("button", { name: "Continue to Delete Account" }).click();
  const phrase = page.locator("#delete-phrase");
  const submit = page.getByRole("dialog").getByRole("button", { name: "Delete account" });
  await expect(phrase).toHaveValue("");
  await expect(submit).toBeDisabled();

  await phrase.focus();
  await page.keyboard.press("Control+v");
  await expect(phrase).toHaveValue("");

  await phrase.evaluate((element) => {
    const data = new DataTransfer();
    data.setData("text/plain", "CONFIRM");
    element.dispatchEvent(new ClipboardEvent("paste", { bubbles: true, cancelable: true, clipboardData: data }));
  });
  await expect(phrase).toHaveValue("");

  await phrase.fill("confirm");
  await expect(submit).toBeDisabled();
  await phrase.fill("CONFIRM");
  await expect(page.locator("#delete-password")).toHaveCount(0);
  await expect(submit).toBeEnabled();
  await page.getByRole("dialog").getByRole("button", { name: "Cancel" }).click();
});

test("the API rejects a wrong confirmation and a repeated request leaves the account in place", async ({ request }) => {
  const loginResponse = await request.post("/api/auth/login", {
    data: { email: SPARE_DRIVER_EMAIL, password: DEMO_PASSWORD },
  });
  expect(loginResponse.ok()).toBeTruthy();
  const token = (await loginResponse.json()).data.token as string;
  const headers = { Authorization: `Bearer ${token}` };

  const wrongCase = await request.post("/api/account/delete", {
    headers,
    data: { confirmation: "confirm", password: DEMO_PASSWORD },
  });
  expect(wrongCase.status()).toBe(400);

  const wrongWord = await request.post("/api/account/delete", {
    headers,
    data: { confirmation: "DELETE", password: DEMO_PASSWORD },
  });
  expect(wrongWord.status()).toBe(400);

  const missingToken = await request.post("/api/account/delete", {
    data: { confirmation: "CONFIRM" },
  });
  expect(missingToken.status()).toBe(401);

  const stillThere = await request.get("/api/users/me/profile", { headers });
  expect(stillThere.ok()).toBeTruthy();
  const profile = await stillThere.json();
  expect(profile.data.user.email).toBe(SPARE_DRIVER_EMAIL);
});
