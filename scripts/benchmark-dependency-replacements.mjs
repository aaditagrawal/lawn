import { mkdtemp, mkdir, rm } from "node:fs/promises";
import { tmpdir, cpus, platform, arch } from "node:os";
import { join, resolve } from "node:path";
import { chromium } from "@playwright/test";
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
${sourceRoot === root ? `import { classNames as flatten } from ${JSON.stringify(join(sourceRoot, "src/lib/classNames.ts"))};` : 'import { clsx as flatten } from "clsx";'}
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
${
  browser
    ? `
const root = createRoot(document.getElementById("root"));
window.bench = {
  async prepare(kind, count) {
    flushSync(() => root.render(view(kind, count, 0)));
    await new Promise(resolve => setTimeout(resolve, 80));
    await Promise.all(Array.from(document.images, img => img.decode().catch(() => {})));
    await document.fonts.ready;
  },
  run(kind, count, iterations) {
    const start = performance.now();
    for (let i = 0; i < iterations; i++) {
      flushSync(() => root.render(view(kind, count, i)));
      document.getElementById("root").getBoundingClientRect();
    }
    return performance.now() - start;
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
      const iterations = count === 1 ? 200 : count === 20 ? 20 : 5;
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
        [beforeBrowser, afterBrowser].map(async (code) => {
          const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
          await page.route("http://lawn-benchmark.test/**", async (route) => {
            const path = new URL(route.request().url()).pathname;
            if (path !== "/") {
              const asset = Bun.file(join(root, "dist/client", path));
              return (await asset.exists())
                ? route.fulfill({ body: await asset.arrayBuffer(), contentType: asset.type })
                : route.abort();
            }
            return route.fulfill({
              contentType: "text/html",
              body: `<!doctype html><style>${css}</style><style>body{margin:0}#root{width:800px}</style><div id="root"></div>`,
            });
          });
          await page.goto("http://lawn-benchmark.test/");
          await page.mouse.move(1200, 850);
          await page.evaluate(() => document.fonts.ready);
          await page.addScriptTag({ content: code, type: "module" });
          await page.waitForFunction(() => Boolean(window.bench));
          return page;
        }),
      );
      const sessions = await Promise.all(pages.map((page) => page.context().newCDPSession(page)));
      for (const session of sessions)
        await session.send("Performance.enable", { timeDomain: "threadTicks" });
      const browserTimed = async (side, operation) => {
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
            await page.evaluate(({ kind, count }) => window.bench.prepare(kind, count), {
              kind,
              count,
            });
          const run = (side) =>
            browserTimed(side, () =>
              pages[side].evaluate(({ kind, count }) => window.bench.run(kind, count, 10), {
                kind,
                count,
              }),
            );
          await paired(
            `dom/${kind}/${count}x10`,
            () => run(0),
            () => run(1),
          );
        }
      }
      for (const count of [2, 20, 100]) {
        for (const page of pages)
          await page.evaluate((count) => window.bench.prepare("avatar", count), count);
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
      "Production bundles, warmup 6 pairs, alternating baseline/candidate order. CPU measured via process.cpuUsage and Chromium CDP threadTicks TaskDuration; separate wall distributions expose scheduling noise. Timings exclude install/build/startup. Browser CPU includes evaluate/protocol task overhead; DOM includes flushSync commit and forced layout with decoded avatars, plus cached-image remount/load settlement. Background machine contention remains possible. No network/install speed claim.",
    results,
  };
  const output = process.env.BENCH_OUTPUT ?? join(tmpdir(), "lawn-dependency-performance.json");
  await Bun.write(output, JSON.stringify(report, null, 2) + "\n");
  console.log(`Report: ${output}`);
} finally {
  await rm(scratch, { recursive: true, force: true });
}
