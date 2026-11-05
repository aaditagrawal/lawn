import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { Separator } from "./separator";
import { Avatar, AvatarFallback, AvatarImage } from "./avatar";

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
