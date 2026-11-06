import { mkdtemp, mkdir, rm } from "node:fs/promises";
import { tmpdir, cpus, platform, arch } from "node:os";
import { join, resolve } from "node:path";
import { chromium } from "@playwright/test";
import assert from "node:assert/strict";
// Run with Bun. Baseline packages live only in a disposable directory.
// BENCH_SAMPLES=9 is useful for review; the default is 21 paired samples.
const baselineRef = "5fea748d78b8fb55324119e281e6d63003f2e44c";
const samples = Number(process.env.BENCH_SAMPLES ?? 21);
const filter = new RegExp(process.env.BENCH_FILTER ?? ".*");
const root = resolve(import.meta.dir, "..");
const expectedRuntime = (await Bun.file(join(root, "package.json")).json()).packageManager;
if (`bun@${Bun.version}` !== expectedRuntime) {
  throw new Error(
    `Use the project runtime: bunx --package ${expectedRuntime} bun ${import.meta.path}`,
  );
}
const scratch = await mkdtemp(join(tmpdir(), "lawn-dependency-bench-"));
const baselineRoot = join(scratch, "baseline");
const components = ["button", "badge", "progress", "separator", "avatar"];
const results = [];
const visualChecks = [];
const environment = {
  runtime: `Bun ${Bun.version}`,
  platform: `${platform()} ${arch()}`,
  cpu: cpus()[0]?.model,
  logicalCpus: cpus().length,
  baselineRef,
  samples,
};
function command(args, cwd = root) {
  const result = Bun.spawnSync(args, { cwd, stdout: "pipe", stderr: "pipe" });
  if (result.exitCode !== 0) throw new Error(result.stderr.toString());
  return result.stdout.toString();
}
function fixture(sourceRoot, browser) {
  return `
import React from "react";
import { cn } from ${JSON.stringify(join(sourceRoot, "src/lib/utils.ts"))};
import { clsx as flatten } from "clsx";
import { Button, buttonVariants } from ${JSON.stringify(join(sourceRoot, "src/components/ui/button.tsx"))};
import { Badge, badgeVariants } from ${JSON.stringify(join(sourceRoot, "src/components/ui/badge.tsx"))};
import { Progress } from ${JSON.stringify(join(sourceRoot, "src/components/ui/progress.tsx"))};
import { Separator } from ${JSON.stringify(join(sourceRoot, "src/components/ui/separator.tsx"))};
import { Avatar, AvatarImage, AvatarFallback } from ${JSON.stringify(join(sourceRoot, "src/components/ui/avatar.tsx"))};
${browser ? 'import { createRoot } from "react-dom/client"; import { flushSync } from "react-dom";' : 'import { renderToString } from "react-dom/server";'}
const image = "data:image/svg+xml," + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40"><rect width="40" height="40" fill="green"/></svg>');
const largeClasses = Array.from({length: 32}, (_, n) => ["p-2", [n % 2 && "px-4", {"font-bold": n % 3, hidden: false}]]);
function view(kind, count, tick) {
  return <div>{Array.from({length: count}, (_, index) => {
    const value = (tick + index) % 101;
    switch(kind) {
      case "button": return <Button key={index} variant={tick % 2 ? "primary" : "outline"} size="sm" className="h-8 px-3">Review {value}</Button>;
      case "badge": return <Badge key={index} variant={tick % 2 ? "success" : "secondary"}>Ready {value}</Badge>;
      case "progress": return <Progress key={index} value={value} aria-label="Upload" />;
      case "separator": return <Separator key={index} decorative={index % 2 === 0} orientation={tick % 2 ? "vertical" : "horizontal"} />;
      case "avatar": return <Avatar key={index}><AvatarImage src={index % 2 ? image : undefined} alt="Member"/><AvatarFallback>AB</AvatarFallback></Avatar>;
    }
  })}</div>;
}
export function helper(kind, count) {
  let length = 0;
  for (let i = 0; i < count; i++) {
    if (kind === "flatten-small") length += flatten("flex", "items-center", i % 2 && "hidden").length;
    if (kind === "flatten-typical") length += flatten("flex p-2 text-sm", ["px-4", false, ["font-bold"]], {"bg-white": true, hidden: i % 2}, "p-3").length;
    if (kind === "flatten-large") length += flatten(largeClasses, "p-3").length;
    if (kind === "cn-small") length += cn("flex", "items-center", i % 2 && "hidden").length;
    if (kind === "cn-typical") length += cn("flex p-2 text-sm", ["px-4", false, ["font-bold"]], {"bg-white": true, hidden: i % 2}, "p-3").length;
    if (kind === "cn-large") length += cn(largeClasses, "p-3").length;
    if (kind === "variants") length += buttonVariants({variant: i % 2 ? "outline" : "primary", size: "sm", className: "px-3"}).length + badgeVariants({variant: "success", className: "px-3"}).length;
  }
  return length;
}
const buttonOptions = [undefined, null, "default", "primary", "destructive", "outline", "secondary", "ghost", "link"];
const badgeOptions = [undefined, null, "default", "secondary", "destructive", "outline", "success", "warning"];
const sizeOptions = [undefined, null, "default", "sm", "lg", "icon"];
export function variantCases() {
  const extraClasses = [undefined, "", "px-3 text-left", ["p-2", false, ["px-4"]], {"font-bold": true, hidden: false}, 7];
  const result = [buttonVariants(), badgeVariants()];
  for (const variant of buttonOptions) for (const size of sizeOptions) {
    for (const classes of extraClasses) for (const className of extraClasses) {
      result.push(buttonVariants({variant, size, class: classes, className}));
    }
  }
  for (const variant of badgeOptions) for (const classes of extraClasses) for (const className of extraClasses) {
    result.push(badgeVariants({variant, class: classes, className}));
  }
  return result;
}
function gallery() {
  return <main style={{display: "flex", flexWrap: "wrap", gap: 16, padding: 16}}>
    {buttonOptions.flatMap((variant, v) => sizeOptions.map((size, s) =>
      <Button key={v + "/" + s} variant={variant} size={size} aria-label={"Button " + v + "/" + s}>Save</Button>
    ))}
    <Button disabled>Disabled</Button>
    <Button asChild className="h-8 px-3"><a href="#saved">Save link</a></Button>
    {badgeOptions.map((variant, v) => <Badge key={v} variant={variant}>Ready</Badge>)}
  </main>;
}
${
  browser
    ? `
const root = createRoot(document.getElementById("root"));
window.bench = {
  gallery() { flushSync(() => root.render(gallery())); },
  async settle() {
    await Promise.all(document.getAnimations().map(animation => animation.finished.catch(() => {})));
  },
  async prepare(kind, count) {
    flushSync(() => root.render(view(kind, count, 0)));
    await new Promise(resolve => setTimeout(resolve, 80));
    await Promise.all(Array.from(document.images, img => img.decode().catch(() => {})));
    await document.fonts.ready;
  },
  async run(kind, count, iterations) {
    const start = performance.now();
    for (let i = 0; i < iterations; i++) {
      flushSync(() => root.render(view(kind, count, i)));
      document.getElementById("root").getBoundingClientRect();
    }
    const commitMs = performance.now() - start;
    // Include the final CSS transition's rendering work. Otherwise alternating
    // sample order also alternates which side pays for a previous animation.
    await window.bench.settle();
    return { commitMs, settledMs: performance.now() - start };
  },
  async mountAvatars(count, iterations) {
    let commitMs = 0;
    const start = performance.now();
    for (let i = 0; i < iterations; i++) {
      const commitStart = performance.now();
      flushSync(() => root.render(<div key={i}>{view("avatar", count, i)}</div>));
      document.getElementById("root").getBoundingClientRect();
      commitMs += performance.now() - commitStart;
      // Data-URL images are cached by prepare(). Include load effects and their
      // commits, waiting for the same visible loaded-image count on both sides.
      const expected = Math.floor(count / 2);
      const deadline = performance.now() + 10000;
      while (Array.from(document.images).filter(img => img.complete && img.naturalWidth > 0 && getComputedStyle(img).display !== "none").length !== expected) {
        if (performance.now() > deadline) throw new Error("Avatar mount did not settle within 10 seconds");
        await new Promise(resolve => setTimeout(resolve, 0));
      }
    }
    return { commitMs, settledMs: performance.now() - start };
  }
};`
    : `
export function render(kind, count, iterations) {
  let length = 0;
  for (let i = 0; i < iterations; i++) length += renderToString(view(kind, count, i)).length;
  return length;
}`
}
`;
}
async function bundle(sourceRoot, browser, name) {
  const entrypoint = join(sourceRoot, `benchmark-${browser ? "browser" : "ssr"}.tsx`);
  // Entrypoint must resolve React and the baseline packages from that side's install.
  await Bun.write(entrypoint, fixture(sourceRoot, browser));
  try {
    const build = await Bun.build({
      entrypoints: [entrypoint],
      target: browser ? "browser" : "bun",
      minify: true,
      define: { "process.env.NODE_ENV": '"production"' },
      plugins: [
        {
          name: "fixture-utils",
          setup(build) {
            build.onResolve({ filter: /^@\/lib\/utils$/ }, () => ({
              path: join(sourceRoot, "src/lib/utils.ts"),
            }));
          },
        },
      ],
    });
    if (!build.success) throw new Error(build.logs.join("\n"));
    const output = join(scratch, `${name}.${browser ? "browser" : "ssr"}.mjs`);
    await Bun.write(output, build.outputs[0]);
    return output;
  } finally {
    await rm(entrypoint, { force: true });
  }
}
function distribution(values) {
  const sorted = values.toSorted((a, b) => a - b);
  const percentile = (p) => sorted[Math.floor((sorted.length - 1) * p)];
  return { median: percentile(0.5), p10: percentile(0.1), p90: percentile(0.9) };
}
async function paired(workload, before, after) {
  if (!filter.test(workload)) return;
  for (let i = 0; i < 6; i++) {
    await before();
    await after();
  }
  const baseline = [];
  const candidate = [];
  for (let i = 0; i < samples; i++) {
    if (i % 2) {
      candidate.push(await after());
      baseline.push(await before());
    } else {
      baseline.push(await before());
      candidate.push(await after());
    }
  }
  const primary = (sample) => sample.cpuMs ?? sample.wallMs;
  const b = distribution(baseline.map(primary));
  const c = distribution(candidate.map(primary));
  const row = {
    workload,
    unit: baseline[0].cpuMs === undefined ? "wall ms/batch" : "CPU ms/batch",
    baseline: b,
    candidate: c,
    baselineSamples: baseline,
    candidateSamples: candidate,
    ratio: c.median / b.median,
    samples,
    wall: {
      baseline: distribution(baseline.map((sample) => sample.wallMs)),
      candidate: distribution(candidate.map((sample) => sample.wallMs)),
    },
    ...(baseline[0].commitWallMs === undefined
      ? {}
      : {
          commitWall: {
            baseline: distribution(baseline.map((sample) => sample.commitWallMs)),
            candidate: distribution(candidate.map((sample) => sample.commitWallMs)),
          },
        }),
  };
  results.push(row);
  console.log(JSON.stringify(row));
}
async function setupWithin(promise, phase) {
  let timer;
  try {
    return await Promise.race([
      promise,
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error(`Browser setup timed out: ${phase}`)), 30000);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}
try {
  await mkdir(baselineRoot, { recursive: true });
  const baselineFiles = [
    "package.json",
    "bun.lock",
    "src/lib/utils.ts",
    ...components.map((name) => `src/components/ui/${name}.tsx`),
  ];
  for (const file of baselineFiles) {
    await Bun.write(join(baselineRoot, file), command(["git", "show", `${baselineRef}:${file}`]));
  }
  command([process.execPath, "install", "--frozen-lockfile", "--ignore-scripts"], baselineRoot);
  const baselineServer = await bundle(baselineRoot, false, "baseline");
  const candidateServer = await bundle(root, false, "candidate");
  const baseline = await import(baselineServer);
  const candidate = await import(candidateServer);
  assert.deepEqual(
    candidate.variantCases(),
    baseline.variantCases(),
    "Variant class output changed",
  );
  console.log("Verified 2234 exact variant class combinations against the target snapshot.");
  const timed = (operation) => {
    const cpuStart = process.cpuUsage();
    const start = performance.now();
    operation();
    const wallMs = performance.now() - start;
    const cpu = process.cpuUsage(cpuStart);
    return { wallMs, cpuMs: (cpu.user + cpu.system) / 1000 };
  };
  console.log(JSON.stringify(environment));
  for (const [kind, iterations] of [
    ["cn-small", 20000],
    ["cn-typical", 10000],
    ["cn-large", 1000],
    ["variants", 10000],
    ["flatten-small", 50000],
    ["flatten-typical", 20000],
    ["flatten-large", 2000],
  ]) {
    if (baseline.helper(kind, 10) !== candidate.helper(kind, 10))
      throw new Error(`Helper mismatch: ${kind}`);
    await paired(
      `${kind}/${iterations}`,
      () => timed(() => baseline.helper(kind, iterations)),
      () => timed(() => candidate.helper(kind, iterations)),
    );
  }
  for (const kind of components) {
    for (const count of [1, 20, 100]) {
      // Keep SSR batches long enough that timer and background GC noise do not
      // dominate small components. Report each batch's CPU and wall separately.
      const iterations = count === 1 ? 10000 : count === 20 ? 1000 : 200;
      await paired(
        `ssr/${kind}/${count}x${iterations}`,
        () => timed(() => baseline.render(kind, count, iterations)),
        () => timed(() => candidate.render(kind, count, iterations)),
      );
    }
  }
  if (!process.env.BENCH_SKIP_BROWSER) {
    const cssFiles = [
      ...new Bun.Glob("dist/client/assets/*.css").scanSync({ cwd: root, absolute: true }),
    ];
    if (!cssFiles.length)
      throw new Error(
        "Run bun run build first; browser measurements require the production stylesheet.",
      );
    const css = (await Promise.all(cssFiles.map((file) => Bun.file(file).text()))).join("\n");
    const beforeBrowser = await Bun.file(await bundle(baselineRoot, true, "baseline")).text();
    const afterBrowser = await Bun.file(await bundle(root, true, "candidate")).text();
    const browser = await chromium.launch({ headless: true });
    try {
      const pages = await Promise.all(
        [beforeBrowser, afterBrowser].map(async (code, side) => {
          const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
          page.on("pageerror", (error) =>
            console.error(`Browser fixture ${side}: ${error.message}`),
          );
          await page.route("http://lawn-benchmark.test/**", async (route) => {
            const path = new URL(route.request().url()).pathname;
            if (path !== "/") {
              const asset = Bun.file(join(root, "dist/client", path));
              return (await asset.exists())
                ? route.fulfill({
                    body: Buffer.from(await asset.arrayBuffer()),
                    contentType: asset.type,
                  })
                : route.abort();
            }
            return route.fulfill({
              contentType: "text/html",
              body: `<!doctype html><style>${css}</style><style>body{margin:0}#root{width:800px}</style><div id="root"></div>`,
            });
          });
          await page.goto("http://lawn-benchmark.test/", { waitUntil: "domcontentloaded" });
          await page.mouse.move(1200, 850);
          await setupWithin(
            page.evaluate(async () => {
              await document.fonts.ready;
            }),
            `fonts ${side}`,
          );
          await setupWithin(page.addScriptTag({ content: code, type: "module" }), `script ${side}`);
          await page.waitForFunction(() => Boolean(window.bench));
          return page;
        }),
      );
      const sessions = await Promise.all(pages.map((page) => page.context().newCDPSession(page)));
      if (filter.test("variants") || filter.test("dom/button/") || filter.test("dom/badge/")) {
        for (const viewport of [
          { width: 390, height: 900 },
          { width: 1280, height: 900 },
        ]) {
          for (const colorScheme of ["light", "dark"]) {
            for (const page of pages) {
              await page.setViewportSize(viewport);
              await page.emulateMedia({ colorScheme });
              await page.evaluate(() => {
                document.getElementById("root").style.width = "100%";
                window.bench.gallery();
              });
              await page.evaluate(async () => {
                await document.fonts.ready;
              });
            }
            for (const state of ["rest", "hover", "focus"]) {
              for (const page of pages) {
                const target = page.getByRole("button", { name: "Button 3/3", exact: true });
                if (state === "hover") await target.hover();
                if (state === "focus") {
                  await page.mouse.move(viewport.width - 1, viewport.height - 1);
                  await target.focus();
                }
              }
              const screenshots = [];
              for (const page of pages)
                screenshots.push(await page.screenshot({ fullPage: true, animations: "disabled" }));
              assert.ok(
                screenshots[0].equals(screenshots[1]),
                `Variant pixels changed: ${viewport.width}px/${colorScheme}/${state}`,
              );
              visualChecks.push({
                width: viewport.width,
                colorScheme,
                state,
                identicalPixels: true,
              });
            }
          }
        }
        for (const page of pages) {
          await page.setViewportSize({ width: 1280, height: 900 });
          await page.emulateMedia({ colorScheme: "light" });
          await page.mouse.move(1200, 850);
          await page.evaluate(() => {
            document.getElementById("root").style.width = "800px";
          });
        }
        console.log(
          "Verified identical variant pixels at mobile/desktop widths in light/dark, rest/hover/focus states.",
        );
      }
      for (const session of sessions)
        await session.send("Performance.enable", { timeDomain: "threadTicks" });
      const browserTimed = async (side, operation) => {
        // Neither page should animate in the background while the other side
        // is measured. Settlement is setup, and is outside the sample clock.
        for (const page of pages) await page.evaluate(() => window.bench.settle());
        const taskTime = async () =>
          (await sessions[side].send("Performance.getMetrics")).metrics.find(
            (metric) => metric.name === "TaskDuration",
          ).value;
        const before = await taskTime();
        const measurement = await operation();
        const cpuMs = ((await taskTime()) - before) * 1000;
        return typeof measurement === "number"
          ? { wallMs: measurement, cpuMs }
          : { wallMs: measurement.settledMs, commitWallMs: measurement.commitMs, cpuMs };
      };
      for (const kind of components) {
        for (const count of [1, 20, 100]) {
          for (const page of pages)
            await setupWithin(
              page.evaluate(({ kind, count }) => window.bench.prepare(kind, count), {
                kind,
                count,
              }),
              `${kind}/${count}`,
            );
          const run = (side) =>
            browserTimed(side, () =>
              pages[side].evaluate(
                ({ kind, count, iterations }) => window.bench.run(kind, count, iterations),
                {
                  kind,
                  count,
                  iterations: count === 1 ? 1000 : count === 20 ? 100 : 20,
                },
              ),
            );
          await paired(
            `dom/${kind}/${count}x${count === 1 ? 1000 : count === 20 ? 100 : 20}`,
            () => run(0),
            () => run(1),
          );
        }
      }
      for (const count of [2, 20, 100]) {
        for (const page of pages)
          await setupWithin(
            page.evaluate((count) => window.bench.prepare("avatar", count), count),
            `avatar-mount/${count}`,
          );
        const run = (side) =>
          browserTimed(side, () =>
            pages[side].evaluate((count) => window.bench.mountAvatars(count, 5), count),
          );
        await paired(
          `dom/avatar-mount/${count}x5`,
          () => run(0),
          () => run(1),
        );
      }
      Object.assign(environment, { chromium: browser.version() });
    } finally {
      await browser.close();
    }
  }
  const report = {
    environment,
    methodology:
      "Production bundles, warmup 6 pairs, alternating baseline/candidate order. CPU measured via process.cpuUsage and Chromium CDP threadTicks TaskDuration; separate wall distributions expose scheduling noise. Timings exclude install/build/startup. Both pages settle prior animations outside each sample. Browser CPU includes evaluate/protocol task overhead; DOM includes flushSync commit, forced layout and final CSS transition settlement with separate commit/settled wall distributions, plus cached-image remount/load settlement. Background machine contention remains possible. No network/install speed claim.",
    results,
    verification: { variantClassCases: 2234, visualChecks },
  };
  const output = process.env.BENCH_OUTPUT ?? join(tmpdir(), "lawn-dependency-performance.json");
  await Bun.write(output, JSON.stringify(report, null, 2) + "\n");
  console.log(`Report: ${output}`);
} finally {
  await rm(scratch, { recursive: true, force: true });
}
