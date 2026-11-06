import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { Separator } from "./separator";
import { Avatar, AvatarFallback, AvatarImage } from "./avatar";
import { Button, buttonVariants } from "./button";
import { Badge, badgeVariants } from "./badge";

test("variants retain default styles, null opt-outs and nested caller classes", () => {
  assert.equal(buttonVariants(), buttonVariants({ variant: undefined, size: undefined }));
  assert.ok(!buttonVariants({ size: null }).includes("h-10"));
  assert.ok(!buttonVariants({ variant: null }).includes("shadow-[4px"));
  assert.ok(
    buttonVariants({ class: ["a", false, { b: true }], className: [null, ["c"]] }).endsWith(
      "a b c",
    ),
  );
  assert.equal(badgeVariants(), badgeVariants({ variant: undefined }));
  assert.ok(!badgeVariants({ variant: null }).includes("bg-[#1a1a1a]"));
});

test("buttons and badges keep caller overrides, disabled state and slotted link semantics", () => {
  const disabled = renderToStaticMarkup(
    <Button disabled className="h-6 px-1">
      Save
    </Button>,
  );
  assert.ok(disabled.includes('disabled=""'));
  assert.ok(disabled.includes("h-6 px-1"));
  assert.ok(!disabled.includes("h-10"));
  const link = renderToStaticMarkup(
    <Button asChild>
      <a href="/settings">Settings</a>
    </Button>,
  );
  assert.ok(link.startsWith("<a "));
  assert.ok(link.includes('href="/settings"'));
  assert.ok(!link.includes("<button"));
  const badge = renderToStaticMarkup(
    <Badge variant="success" className="bg-white">
      Ready
    </Badge>,
  );
  assert.ok(badge.includes("bg-white"));
  assert.ok(!badge.includes("bg-[#2d5a2d]"));
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
