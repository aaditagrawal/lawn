import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { Button, buttonVariants } from "./button";
import { Badge, badgeVariants } from "./badge";
import { Progress } from "./progress";
import { Separator } from "./separator";
import { Avatar, AvatarFallback, AvatarImage } from "./avatar";

test("button and badge variants retain defaults, null opt-outs, and caller overrides", () => {
  assert.equal(buttonVariants(), buttonVariants({ variant: undefined, size: undefined }));
  assert.ok(buttonVariants().includes("h-10 px-5 py-2"));
  assert.ok(!buttonVariants({ size: null }).includes("h-10"));
  assert.ok(!buttonVariants({ variant: null }).includes("shadow-[4px"));
  assert.ok(buttonVariants({ variant: "primary", size: "sm" }).includes("h-8 px-4 text-xs"));
  assert.ok(buttonVariants({ class: "a", className: "b" }).endsWith("a b"));
  assert.equal(badgeVariants(), badgeVariants({ variant: undefined }));
  assert.ok(!badgeVariants({ variant: null }).includes("bg-[#1a1a1a]"));
  const button = renderToStaticMarkup(<Button className="h-6 px-1">Save</Button>);
  assert.ok(button.includes("h-6 px-1"));
  assert.ok(!button.includes("h-10"));
  assert.ok(renderToStaticMarkup(<Badge variant="success">Ready</Badge>).includes("bg-[#2d5a2d]"));
});

test("progress exposes determinate values and scales the indicator by max", () => {
  const html = renderToStaticMarkup(<Progress value={25} max={50} aria-label="Upload" />);
  assert.ok(html.includes('role="progressbar"'));
  assert.ok(html.includes('aria-valuenow="25"'));
  assert.ok(html.includes('aria-valuemax="50"'));
  assert.ok(html.includes('aria-valuetext="50%"'));
  assert.ok(html.includes("translateX(-50%)"));
  assert.ok(renderToStaticMarkup(<Progress value={100} />).includes('data-state="complete"'));
  assert.ok(renderToStaticMarkup(<Progress value={0} />).includes('aria-valuenow="0"'));
  assert.ok(
    renderToStaticMarkup(
      <Progress value={3} max={10} getValueLabel={(v, m) => `${v} of ${m}`} />,
    ).includes('aria-valuetext="3 of 10"'),
  );
});

test("invalid and absent progress values remain indeterminate", () => {
  for (const value of [undefined, null, NaN, Infinity, -1, 101]) {
    const html = renderToStaticMarkup(<Progress value={value} />);
    assert.ok(html.includes('data-state="indeterminate"'));
    assert.ok(!html.includes("aria-valuenow"));
    assert.ok(!html.includes("aria-valuetext"));
  }
  assert.ok(renderToStaticMarkup(<Progress value={50} max={0} />).includes('aria-valuemax="100"'));
});

test("separator preserves decorative and oriented accessibility semantics", () => {
  assert.ok(renderToStaticMarkup(<Separator />).includes('role="none"'));
  const vertical = renderToStaticMarkup(<Separator decorative={false} orientation="vertical" />);
  assert.ok(vertical.includes('role="separator"'));
  assert.ok(vertical.includes('aria-orientation="vertical"'));
  assert.ok(vertical.includes('data-orientation="vertical"'));
  assert.ok(!renderToStaticMarkup(<Separator decorative={false} />).includes("aria-orientation"));
});

test("avatar SSR shows the fallback without displaying an unloaded or absent source", () => {
  const html = renderToStaticMarkup(
    <Avatar>
      <AvatarImage src="/avatar.png" alt="Ada" />
      <AvatarFallback>AA</AvatarFallback>
    </Avatar>,
  );
  assert.ok(html.includes("AA"));
  assert.ok(html.includes('alt="Ada"'));
  assert.ok(html.includes("display:none"));
  assert.ok(html.includes('data-avatar-loaded="false"'));
  assert.ok(!renderToStaticMarkup(<AvatarImage />).includes("<img"));
});
