/// <reference types="vite/client" />

import { convexTest } from "convex-test";
import { expect, test } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";
import type { ColorNote } from "./colorNotes";

const modules = import.meta.glob("./**/*.ts");

const validNote: ColorNote = {
  shape: {
    kind: "ellipse",
    points: [
      { x: 0.2, y: 0.25 },
      { x: 0.55, y: 0.7 },
    ],
  },
  feather: 0.04,
  invert: false,
  adjustments: {
    exposure: 0.5,
    contrast: 0,
    saturation: -20,
    hue: 0,
    temperature: 15,
    tint: 0,
  },
  match: { from: "#c28d6b", to: "#d49a74" },
  sampledColor: "#c28d6b",
};

async function seed() {
  const t = convexTest(schema, modules);
  const videoId = await t.run(async (ctx) => {
    const teamId = await ctx.db.insert("teams", {
      name: "Grade",
      slug: "grade",
      ownerClerkId: "owner",
      plan: "basic",
    });
    await ctx.db.insert("teamMembers", {
      teamId,
      userClerkId: "owner",
      userEmail: "owner@example.com",
      userName: "Owner",
      role: "owner",
    });
    const projectId = await ctx.db.insert("projects", { teamId, name: "Spot" });
    return await ctx.db.insert("videos", {
      projectId,
      uploadedByClerkId: "owner",
      uploaderName: "Owner",
      title: "Hero cut",
      visibility: "public",
      publicId: "hero-cut",
      status: "ready",
      workflowStatus: "review",
    });
  });
  return { t, videoId, authed: t.withIdentity({ subject: "owner", name: "Owner" }) };
}

test("color notes round-trip through team and public comment queries", async () => {
  const { videoId, authed, t } = await seed();

  await authed.mutation(api.comments.create, {
    videoId,
    text: "Warm up the skin a touch",
    timestampSeconds: 12.48,
    colorNote: validNote,
  });

  const [comment] = await authed.query(api.comments.list, { videoId });
  expect(comment.colorNote).toEqual(validNote);

  const [publicComment] = await t.query(api.comments.getThreadedForPublic, {
    publicId: "hero-cut",
  });
  expect(publicComment.colorNote).toEqual(validNote);
});

test("color notes are validated on write", async () => {
  const { videoId, authed } = await seed();
  const create = (colorNote: ColorNote) =>
    authed.mutation(api.comments.create, {
      videoId,
      text: "",
      timestampSeconds: 1,
      colorNote,
    });

  await expect(
    create({ ...validNote, shape: { kind: "rect", points: [{ x: 0.1, y: 0.1 }] } }),
  ).rejects.toThrow("Invalid color note region");
  await expect(
    create({
      ...validNote,
      shape: {
        kind: "rect",
        points: [
          { x: -0.2, y: 0.1 },
          { x: 0.5, y: 0.5 },
        ],
      },
    }),
  ).rejects.toThrow("Invalid color note region");
  await expect(
    create({
      ...validNote,
      shape: {
        kind: "lasso",
        points: Array.from({ length: 300 }, (_, index) => ({ x: index / 300, y: 0.5 })),
      },
    }),
  ).rejects.toThrow("Invalid color note region");
  await expect(create({ ...validNote, feather: 2 })).rejects.toThrow("Invalid color note feather");
  await expect(
    create({ ...validNote, adjustments: { ...validNote.adjustments, exposure: 12 } }),
  ).rejects.toThrow("Invalid color note exposure");
  await expect(
    create({ ...validNote, adjustments: { ...validNote.adjustments, hue: Number.NaN } }),
  ).rejects.toThrow("Invalid color note hue");
  await expect(create({ ...validNote, match: { from: "red", to: "#000000" } })).rejects.toThrow(
    "Invalid color note match",
  );
});

test("advanced grades and qualifiers are stored and validated", async () => {
  const { videoId, authed } = await seed();
  const advanced: ColorNote = {
    ...validNote,
    adjustments: {
      ...validNote.adjustments,
      vibrance: 20,
      shadows: 15,
      lift: { r: -0.1, g: 0, b: 0.12 },
      gain: { r: 0.05, g: 0.05, b: 0.05 },
    },
    qualifier: {
      hueCenter: 110,
      hueWidth: 60,
      satLow: 0.2,
      satHigh: 1,
      lumaLow: 0,
      lumaHigh: 1,
      softness: 0.1,
    },
  };
  await authed.mutation(api.comments.create, {
    videoId,
    text: "Only the foliage",
    timestampSeconds: 2,
    colorNote: advanced,
  });
  const [comment] = await authed.query(api.comments.list, { videoId });
  expect(comment.colorNote).toEqual(advanced);

  const create = (colorNote: ColorNote) =>
    authed.mutation(api.comments.create, { videoId, text: "", timestampSeconds: 1, colorNote });
  await expect(
    create({
      ...validNote,
      adjustments: { ...validNote.adjustments, lift: { r: 3, g: 0, b: 0 } },
    }),
  ).rejects.toThrow("Invalid color note lift");
  await expect(
    create({
      ...validNote,
      adjustments: { ...validNote.adjustments, shadows: 400 },
    }),
  ).rejects.toThrow("Invalid color note shadows");
  await expect(
    create({ ...validNote, qualifier: { ...advanced.qualifier!, satLow: 0.9, satHigh: 0.1 } }),
  ).rejects.toThrow("Invalid color note qualifier");
});

test("replies cannot carry color notes", async () => {
  const { videoId, authed } = await seed();
  const parentId = await authed.mutation(api.comments.create, {
    videoId,
    text: "Sky feels cyan",
    timestampSeconds: 3,
  });

  await expect(
    authed.mutation(api.comments.create, {
      videoId,
      text: "Agreed",
      timestampSeconds: 3,
      parentId,
      colorNote: validNote,
    }),
  ).rejects.toThrow("Replies cannot carry a color note");
});
