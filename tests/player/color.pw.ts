import { expect, test, type Page } from "@playwright/test";
import { gradeRgb, NEUTRAL_ADJUSTMENTS } from "../../src/lib/color/grade";

async function ready(page: Page, time = 5) {
  await page.goto("/color.html");
  await expect
    .poll(() => page.locator("video").evaluate((video: HTMLVideoElement) => video.readyState))
    .toBeGreaterThanOrEqual(2);
  await seek(page, time);
}

async function seek(page: Page, time: number) {
  await page.locator("video").evaluate(async (video: HTMLVideoElement, seconds) => {
    video.currentTime = seconds;
    await new Promise((resolve) => video.addEventListener("seeked", resolve, { once: true }));
  }, time);
}

/** Viewport position of a normalized point on the displayed picture. */
async function framePoint(page: Page, x: number, y: number) {
  return page.locator("video").evaluate(
    (video: HTMLVideoElement, [nx, ny]) => {
      const rect = video.getBoundingClientRect();
      const scale = Math.min(rect.width / video.videoWidth, rect.height / video.videoHeight);
      const width = video.videoWidth * scale;
      const height = video.videoHeight * scale;
      return {
        x: rect.left + (rect.width - width) / 2 + nx * width,
        y: rect.top + (rect.height - height) / 2 + ny * height,
      };
    },
    [x, y] as const,
  );
}

/** Ground truth: the source pixel from a full-resolution 2D canvas read. */
async function sourcePixel(page: Page, x: number, y: number) {
  return page.locator("video").evaluate(
    (video: HTMLVideoElement, [nx, ny]) => {
      const canvas = document.createElement("canvas");
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext("2d")!;
      ctx.drawImage(video, 0, 0);
      const [r, g, b] = ctx.getImageData(
        Math.floor(nx * video.videoWidth),
        Math.floor(ny * video.videoHeight),
        1,
        1,
      ).data;
      return { r, g, b };
    },
    [x, y] as const,
  );
}

/** What the GPU overlay shows at a normalized frame point, or null if hidden. */
async function renderedPixel(page: Page, x: number, y: number) {
  return page.evaluate(
    ([nx, ny]) => {
      const canvas = document.querySelector<HTMLCanvasElement>("canvas[data-color-render]");
      if (!canvas || canvas.classList.contains("invisible")) return null;
      const copy = document.createElement("canvas");
      copy.width = canvas.width;
      copy.height = canvas.height;
      const ctx = copy.getContext("2d")!;
      ctx.drawImage(canvas, 0, 0);
      const [r, g, b] = ctx.getImageData(
        Math.floor(nx * canvas.width),
        Math.floor(ny * canvas.height),
        1,
        1,
      ).data;
      return { r, g, b };
    },
    [x, y] as const,
  );
}

async function drawRect(page: Page, from: [number, number], to: [number, number]) {
  const start = await framePoint(page, ...from);
  const end = await framePoint(page, ...to);
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(end.x, end.y, { steps: 8 });
  await page.mouse.up();
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => window.localStorage.setItem("lawn.colorUiMode", "beginner"));
});

test("probe reads the exact pixel under the cursor and pins it", async ({ page }) => {
  await ready(page);
  await page.getByRole("button", { name: "Probe pixels" }).click();
  const point = await framePoint(page, 0.3, 0.4);
  await page.mouse.move(point.x, point.y);
  const { r, g, b } = await sourcePixel(page, 0.3, 0.4);
  const expected = "#" + [r, g, b].map((value) => value.toString(16).padStart(2, "0")).join("");
  await expect(page.getByText(expected.toUpperCase()).first()).toBeVisible();
  await page.mouse.click(point.x, point.y);
  await expect(page.getByText("Pinned (1)")).toBeVisible();
});

test("beginner grade: GPU preview matches the JS grade math inside the region only", async ({
  page,
}) => {
  await ready(page);
  await page.getByRole("button", { name: "Color grade" }).click();
  await drawRect(page, [0.2, 0.25], [0.6, 0.75]);
  await expect(page.getByText("Color note · 0:05")).toBeVisible();

  await page.getByRole("slider", { name: "Brightness" }).fill("0.5");
  await page.getByRole("slider", { name: "Warmth" }).fill("40");
  await page.getByRole("button", { name: "Less color" }).click();

  const inside: [number, number] = [0.4, 0.5];
  const source = await sourcePixel(page, ...inside);
  const expected = gradeRgb(source, {
    ...NEUTRAL_ADJUSTMENTS,
    exposure: 0.5,
    temperature: 40,
    saturation: -15,
  });
  await expect.poll(() => renderedPixel(page, ...inside)).not.toBeNull();
  const rendered = (await renderedPixel(page, ...inside))!;
  for (const channel of ["r", "g", "b"] as const) {
    expect(Math.abs(rendered[channel] - expected[channel])).toBeLessThanOrEqual(3);
  }
  const outsideSource = await sourcePixel(page, 0.9, 0.9);
  const outside = (await renderedPixel(page, 0.9, 0.9))!;
  expect(Math.abs(outside.r - outsideSource.r)).toBeLessThanOrEqual(3);

  await page.getByRole("button", { name: "Split", exact: true }).first().click();
  await expect(page.getByRole("slider", { name: "Before and after split position" })).toBeVisible();
  await page.screenshot({ path: "test-results/color-beginner.png" });

  await page.getByLabel("Note text").fill("Warm and quieter");
  await page.getByRole("button", { name: "Post color note" }).click();
  const posted = page.getByTestId("posted-note");
  await expect(posted.getByText("Warmer 40")).toBeVisible();
  await expect(page.getByRole("button", { name: "Jump to color note at 0:05" })).toBeVisible();
});

test("advanced: qualifier limits the grade to a picked color and shows its matte", async ({
  page,
}) => {
  await ready(page);
  await page.getByRole("radio", { name: "advanced" }).click();
  await page.getByRole("button", { name: "Color grade" }).click();
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Frame", exact: true }).click();
  await page.getByRole("slider", { name: "Saturation", exact: true }).fill("-100");

  await page.getByRole("button", { name: /Qualifier/ }).click();
  await page.getByRole("button", { name: "Pick color" }).click();
  // The test pattern's second bar from the left is pure green.
  const green = await framePoint(page, 0.25, 0.8);
  await page.mouse.click(green.x, green.y);
  await expect(page.getByText(/° ± /)).toBeVisible();

  await page.getByRole("button", { name: "Off", exact: true }).click();
  await expect.poll(() => renderedPixel(page, 0.25, 0.8)).not.toBeNull();
  const greenAfter = (await renderedPixel(page, 0.25, 0.8))!;
  expect(Math.abs(greenAfter.r - greenAfter.g)).toBeLessThanOrEqual(4); // desaturated
  const redSource = await sourcePixel(page, 0.05, 0.8);
  const redAfter = (await renderedPixel(page, 0.05, 0.8))!;
  expect(Math.abs(redAfter.r - redSource.r)).toBeLessThanOrEqual(4); // untouched

  await page.getByRole("button", { name: "Matte", exact: true }).click();
  await expect.poll(async () => (await renderedPixel(page, 0.05, 0.8))?.r).toBeLessThan(10);
  expect((await renderedPixel(page, 0.25, 0.8))!.g).toBeGreaterThan(245);
  await page.screenshot({ path: "test-results/color-qualifier.png" });

  await page.getByRole("button", { name: /Color wheels/ }).click();
  await expect(page.getByRole("slider", { name: "Lift color balance" })).toBeVisible();
  await page.getByRole("slider", { name: "Gain color balance" }).focus();
  await page.keyboard.press("Shift+ArrowRight");
  await page.screenshot({ path: "test-results/color-advanced.png", fullPage: true });
});

test("area notes: draw, post, and reopen by clicking the outline on the frame", async ({
  page,
}) => {
  await ready(page);
  await page.getByRole("button", { name: "Area note" }).click();
  await drawRect(page, [0.55, 0.2], [0.8, 0.5]);
  await expect(page.getByText("Area note · 0:05")).toBeVisible();
  await expect(page.getByRole("button", { name: "Post area note" })).toBeDisabled();
  await page.getByLabel("Note text").fill("Logo is too hot here");
  await page.getByRole("button", { name: "Post area note" }).click();

  const posted = page.getByTestId("posted-note");
  await expect(posted.getByText("Area note")).toBeVisible();
  const outline = page.getByRole("button", { name: "Open area note 1" });
  await expect(outline).toBeVisible();
  await page.screenshot({ path: "test-results/color-area-outline.png" });
  await outline.click();
  await expect(page.getByText("Area · 0:05")).toBeVisible();
});

test("still compare: wipe and difference against a grabbed frame", async ({ page }) => {
  await ready(page, 3);
  await page.getByRole("button", { name: "Grab still" }).click();
  await expect(page.getByRole("button", { name: /Compare with still v1 · 0:03/ })).toBeVisible();
  await seek(page, 12);
  await expect(page.getByRole("slider", { name: "Still comparison wipe position" })).toBeVisible();
  await page.screenshot({ path: "test-results/color-still-wipe.png" });

  await page.getByRole("button", { name: "Difference" }).click();
  // The burnt-in timecode differs between 0:03 and 0:12.
  await expect
    .poll(() =>
      page.evaluate(() => {
        const canvas = document.querySelector<HTMLCanvasElement>("canvas[data-color-render]")!;
        const copy = document.createElement("canvas");
        copy.width = canvas.width;
        copy.height = canvas.height;
        const ctx = copy.getContext("2d")!;
        ctx.drawImage(canvas, 0, 0);
        const data = ctx.getImageData(0, 0, copy.width, copy.height).data;
        let bright = 0;
        for (let i = 0; i < data.length; i += 4) {
          if (data[i] + data[i + 1] + data[i + 2] > 150) bright += 1;
        }
        return bright;
      }),
    )
    .toBeGreaterThan(100);

  await page.getByRole("button", { name: "Side by side" }).click();
  await expect(page.getByText("Still · v1 · 0:03").first()).toBeVisible();
  await page.screenshot({ path: "test-results/color-still-side.png" });
});

test("false color monitor renders on the GPU", async ({ page }) => {
  await ready(page);
  await page.getByRole("button", { name: "False color" }).click();
  await expect(page.getByText("Clipped")).toBeVisible();
  // The blue bar (luma ~7%) lands in the near-black band.
  await expect.poll(() => renderedPixel(page, 0.6, 0.2)).toEqual({ r: 30, g: 80, b: 220 });
});
