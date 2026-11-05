import { expect, test } from "@playwright/test";

const image =
  '<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32"><rect width="32" height="32" fill="green"/></svg>';

test("avatars preserve loading, errors, source changes, cached images, classes and refs", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  let releaseB: () => void;
  const blockedB = new Promise<void>((resolve) => {
    releaseB = resolve;
  });
  await page.route("**/avatar-a.svg", (route) =>
    route.fulfill({ contentType: "image/svg+xml", body: image }),
  );
  await page.route("**/avatar-b.svg", async (route) => {
    await blockedB;
    await route.fulfill({ contentType: "image/svg+xml", body: image });
  });
  await page.route("**/broken.svg", (route) => route.fulfill({ status: 404, body: "missing" }));
  await page.goto("/components.html");
  const fallback = page.getByTestId("fallback");
  const avatar = page.getByTestId("avatar");
  await expect(fallback).toBeVisible();
  await expect(avatar).toHaveCSS("width", "32px");
  await expect(avatar).toHaveAttribute("data-ref", "SPAN");
  await page.getByRole("button", { name: "Source A", exact: true }).click();
  await expect(page.getByRole("img", { name: "Ada" })).toBeVisible();
  await expect(fallback).toBeHidden();
  await expect(page.getByRole("img", { name: "Ada" })).toHaveAttribute("data-ref", "IMG");
  await page.getByRole("button", { name: "Source B", exact: true }).click();
  await expect(fallback).toBeVisible();
  await expect(page.locator('img[alt="Ada"]')).toBeHidden();
  // Replace the still-pending request. Its eventual completion must not hide fallback.
  await page.getByRole("button", { name: "Broken source" }).click();
  releaseB!();
  await expect(page.getByLabel("Errors", { exact: true })).toHaveText("1");
  await expect(fallback).toBeVisible();
  await page.getByRole("button", { name: "No source" }).click();
  await expect(avatar.locator("img")).toHaveCount(0);
  await page.getByRole("button", { name: "Source A", exact: true }).click();
  await expect(page.getByRole("img", { name: "Ada" })).toBeVisible();
  await expect(fallback).toBeHidden();
  await expect(page.getByLabel("Loads", { exact: true })).toHaveText("2");
  expect(errors).toEqual([]);
});

test("progress and separator expose semantics while buttons retain keyboard activation", async ({
  page,
}) => {
  await page.goto("/components.html");
  const progress = page.getByRole("progressbar", { name: "Upload progress" });
  await expect(progress).toHaveAttribute("aria-valuenow", "75");
  await expect(progress).toHaveAttribute("aria-valuemax", "100");
  await expect(progress).toHaveAttribute("aria-valuetext", "75%");
  await expect(progress).toHaveAttribute("data-ref", "DIV");
  await expect(page.getByRole("separator")).toHaveAttribute("aria-orientation", "vertical");
  await expect(page.getByTestId("separator")).toHaveAttribute("data-ref", "DIV");
  const save = page.getByRole("button", { name: "Save", exact: true });
  await expect(save).toHaveCSS("height", "32px");
  await save.focus();
  await page.keyboard.press("Space");
  await expect(page.getByLabel("Clicks", { exact: true })).toHaveText("1");
  await expect(save).toBeFocused();
});
