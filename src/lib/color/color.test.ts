import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { chroma, hexToRgb, lumaPercent, normalizeHex, rgbToHex, rgbToHsl } from "./colorMath";
import {
  NEUTRAL_ADJUSTMENTS,
  compactAdjustments,
  describeGrade,
  gradeRgb,
  isNeutralGrade,
  matchGains,
  puckFromWheel,
  wheelFromPuck,
} from "./grade";
import { draftToColorNote, isAreaNote, qualifierFromColor } from "./useColorReview";
import { MAX_LASSO_POINTS, isUsableShape, shapeBounds, simplifyLasso } from "./shape";

function assertClose(actual: number, expected: number, tolerance = 0.01) {
  assert.ok(
    Math.abs(actual - expected) <= tolerance,
    `${actual} is not within ${tolerance} of ${expected}`,
  );
}

describe("colorMath", () => {
  test("hex round-trips and normalizes", () => {
    assert.deepEqual(hexToRgb("#C28D6B"), { r: 194, g: 141, b: 107 });
    assert.equal(rgbToHex({ r: 194, g: 141, b: 107 }), "#c28d6b");
    assert.equal(normalizeHex("c28d6b"), "#c28d6b");
    assert.equal(normalizeHex("#abc"), null);
  });

  test("luma uses Rec.709 weights", () => {
    assertClose(lumaPercent({ r: 255, g: 255, b: 255 }), 100);
    assertClose(lumaPercent({ r: 0, g: 255, b: 0 }), 71.52);
  });

  test("hsl and chroma place primaries correctly", () => {
    assertClose(rgbToHsl({ r: 0, g: 0, b: 255 }).h, 240);
    const grey = chroma({ r: 128, g: 128, b: 128 });
    assertClose(grey.cb, 0);
    assertClose(grey.cr, 0);
    assertClose(chroma({ r: 255, g: 0, b: 0 }).cr, 0.5);
  });
});

describe("grade", () => {
  const skin = { r: 194, g: 141, b: 107 };

  test("neutral grade is identity", () => {
    assert.equal(isNeutralGrade(NEUTRAL_ADJUSTMENTS), true);
    for (const value of [0, 1, 17, 128, 254, 255]) {
      assert.deepEqual(gradeRgb({ r: value, g: value, b: value }, NEUTRAL_ADJUSTMENTS), {
        r: value,
        g: value,
        b: value,
      });
    }
    assert.deepEqual(gradeRgb(skin, NEUTRAL_ADJUSTMENTS), skin);
  });

  test("one stop of exposure doubles linear light", () => {
    const brighter = gradeRgb({ r: 100, g: 100, b: 100 }, { ...NEUTRAL_ADJUSTMENTS, exposure: 1 });
    assert.ok(brighter.r > 130);
    assert.equal(brighter.r, brighter.g);
  });

  test("match maps the source swatch onto the target", () => {
    const match = { from: "#c28d6b", to: "#d49a74" };
    assert.equal(rgbToHex(gradeRgb(skin, NEUTRAL_ADJUSTMENTS, match)), "#d49a74");
    assert.deepEqual(matchGains({ from: "#000000", to: "#ffffff" }), [1, 1, 1]);
  });

  test("saturation -100 is monochrome, temperature warms", () => {
    const mono = gradeRgb(skin, { ...NEUTRAL_ADJUSTMENTS, saturation: -100 });
    assert.ok(Math.abs(mono.r - mono.g) <= 1);
    assert.ok(Math.abs(mono.g - mono.b) <= 1);
    const warm = gradeRgb({ r: 128, g: 128, b: 128 }, { ...NEUTRAL_ADJUSTMENTS, temperature: 50 });
    assert.ok(warm.r > 128);
    assert.ok(warm.b < 128);
  });

  test("hue rotation keeps greys grey", () => {
    assert.deepEqual(gradeRgb({ r: 90, g: 90, b: 90 }, { ...NEUTRAL_ADJUSTMENTS, hue: 120 }), {
      r: 90,
      g: 90,
      b: 90,
    });
  });

  test("tone controls move only their range", () => {
    const lifted = gradeRgb({ r: 30, g: 30, b: 30 }, { ...NEUTRAL_ADJUSTMENTS, shadows: 60 });
    const brightKept = gradeRgb(
      { r: 240, g: 240, b: 240 },
      { ...NEUTRAL_ADJUSTMENTS, shadows: 60 },
    );
    assert.ok(lifted.r > 45);
    assert.ok(Math.abs(brightKept.r - 240) <= 1);
    const tamed = gradeRgb({ r: 235, g: 235, b: 235 }, { ...NEUTRAL_ADJUSTMENTS, highlights: -60 });
    assert.ok(tamed.r < 215);
  });

  test("wheels: lift toward blue cools shadows, gamma brightens mids", () => {
    const lift = wheelFromPuck(1, 0, 0); // +Cb = toward blue
    const cooled = gradeRgb({ r: 40, g: 40, b: 40 }, { ...NEUTRAL_ADJUSTMENTS, lift });
    assert.ok(cooled.b > cooled.r);
    const gamma = wheelFromPuck(0, 0, 0.5);
    const brighter = gradeRgb({ r: 110, g: 110, b: 110 }, { ...NEUTRAL_ADJUSTMENTS, gamma });
    assert.ok(brighter.r > 125);
    assert.equal(brighter.r, brighter.b);
  });

  test("wheel puck and value round-trip", () => {
    const wheel = wheelFromPuck(0.3, -0.4, 0.1);
    const puck = puckFromWheel(wheel);
    assertClose(puck.x, 0.3, 0.01);
    assertClose(puck.y, -0.4, 0.01);
    assertClose(puck.master, 0.1, 0.005);
  });

  test("vibrance boosts muted colors more than vivid ones", () => {
    const muted = { r: 140, g: 120, b: 110 };
    const vivid = { r: 230, g: 40, b: 30 };
    const boostedMuted = gradeRgb(muted, { ...NEUTRAL_ADJUSTMENTS, vibrance: 60 });
    const boostedVivid = gradeRgb(vivid, { ...NEUTRAL_ADJUSTMENTS, vibrance: 60 });
    assert.ok(boostedMuted.r - boostedMuted.b > muted.r - muted.b);
    assert.ok(Math.abs(boostedVivid.r - vivid.r) <= 12);
  });

  test("compact storage drops neutral advanced controls", () => {
    assert.deepEqual(compactAdjustments({ ...NEUTRAL_ADJUSTMENTS, shadows: 10 }), {
      exposure: 0,
      contrast: 0,
      saturation: 0,
      hue: 0,
      temperature: 0,
      tint: 0,
      shadows: 10,
    });
  });

  test("describeGrade lists only changed controls", () => {
    assert.deepEqual(describeGrade(NEUTRAL_ADJUSTMENTS), []);
    assert.deepEqual(
      describeGrade(
        { ...NEUTRAL_ADJUSTMENTS, exposure: -0.5, temperature: -20, tint: 10 },
        { from: "#aaaaaa", to: "#bbbbbb" },
      ),
      ["Match #AAAAAA → #BBBBBB", "−0.50 EV", "Cooler 20", "Magenta 10"],
    );
    assert.deepEqual(
      describeGrade({ ...NEUTRAL_ADJUSTMENTS, lift: wheelFromPuck(1, 0, 0) }, null, {
        hueCenter: 120,
        hueWidth: 60,
        satLow: 0.2,
        satHigh: 1,
        lumaLow: 0,
        lumaHigh: 1,
        softness: 0.1,
      }),
      ["Only hue 120°±30, sat 20–100%", "Lift toward blue"],
    );
  });
});

describe("shape", () => {
  test("rejects stray clicks and accepts real regions", () => {
    assert.equal(
      isUsableShape({
        kind: "rect",
        points: [
          { x: 0.5, y: 0.5 },
          { x: 0.501, y: 0.6 },
        ],
      }),
      false,
    );
    assert.equal(
      isUsableShape({
        kind: "ellipse",
        points: [
          { x: 0.1, y: 0.1 },
          { x: 0.4, y: 0.3 },
        ],
      }),
      true,
    );
  });

  test("simplifyLasso stays within the point budget and bounds", () => {
    const points = Array.from({ length: 2000 }, (_, index) => {
      const angle = (index / 2000) * Math.PI * 2;
      return {
        x: 0.5 + Math.cos(angle) * 0.3,
        y: 0.5 + Math.sin(angle) * 0.3 + (index % 2) * 0.0001,
      };
    });
    const simplified = simplifyLasso(points);
    assert.ok(simplified.length <= MAX_LASSO_POINTS);
    assert.ok(simplified.length >= 3);
    assertClose(shapeBounds({ kind: "lasso", points: simplified }).width, 0.6, 0.05);
  });
});

describe("notes", () => {
  test("area notes store a neutral grade and are recognized", () => {
    const note = draftToColorNote({
      kind: "area",
      shape: {
        kind: "rect",
        points: [
          { x: 0.1, y: 0.1 },
          { x: 0.3, y: 0.3 },
        ],
      },
      timestampSeconds: 1,
      feather: 0.03,
      invert: false,
      adjustments: { ...NEUTRAL_ADJUSTMENTS, exposure: 1 },
      match: { from: "#000000", to: "#ffffff" },
      qualifier: null,
      sampledColor: null,
    });
    assert.ok(note);
    assert.equal(note.match, undefined);
    assert.equal(isAreaNote(note), true);
    assert.equal(isNeutralGrade(note.adjustments), true);
  });

  test("qualifierFromColor centres on the picked hue", () => {
    const qualifier = qualifierFromColor({ r: 40, g: 180, b: 60 });
    assert.ok(Math.abs(qualifier.hueCenter - 129) <= 2);
    assert.equal(qualifier.hueWidth, 40);
    assert.equal(qualifierFromColor({ r: 128, g: 128, b: 128 }).hueWidth, 360);
  });
});
