import assert from "node:assert/strict";
import test from "node:test";
import { classNames } from "./classNames";
import { cn } from "./utils";

test("joins nested conditional classes in order without discarding numeric names", () => {
  assert.equal(
    classNames("base", false, null, undefined, 0, 2, ["nested", ["deep", false]], {
      selected: true,
      disabled: false,
      pending: 1,
    }),
    "base 2 nested deep selected pending",
  );
  assert.equal(classNames(), "");
  assert.equal(classNames([[], "", NaN, true]), "");
});

test("cn keeps Tailwind conflict resolution and responsive/arbitrary overrides", () => {
  assert.equal(
    cn("h-10 px-5 hover:bg-red-500", ["h-8", { "px-3": true }]),
    "hover:bg-red-500 h-8 px-3",
  );
  assert.equal(cn("w-[40px] md:w-24", "w-[60px] md:w-32"), "w-[60px] md:w-32");
});
