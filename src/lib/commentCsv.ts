import { formatTimestamp } from "@/lib/utils";
import { describeGrade, type ColorAdjustments, type ColorMatch } from "@/lib/color/grade";

interface CsvComment {
  text: string;
  timestampSeconds: number;
  colorNote?: {
    adjustments: ColorAdjustments;
    match?: ColorMatch;
    sampledColor?: string;
    invert: boolean;
    shape: { kind: string };
  };
}

function commentText(comment: CsvComment) {
  if (!comment.colorNote) return comment.text;
  const note = comment.colorNote;
  const grade = describeGrade(note.adjustments, note.match);
  const details = [
    `${note.shape.kind}${note.invert ? " (outside)" : ""}`,
    note.sampledColor ? `sampled ${note.sampledColor.toUpperCase()}` : null,
    ...grade,
  ].filter(Boolean);
  const summary = `[Color note: ${details.join(", ")}]`;
  return comment.text ? `${comment.text} ${summary}` : summary;
}

interface CsvCommentThread extends CsvComment {
  replies: CsvComment[];
}

function escapeCsvCell(value: string) {
  const spreadsheetSafeValue = /^\s*[=+\-@]/.test(value) ? `'${value}` : value;
  return `"${spreadsheetSafeValue.replaceAll('"', '""')}"`;
}

export function buildCommentsCsv(comments: CsvCommentThread[]) {
  const rows = comments.flatMap((comment) => [
    comment,
    ...comment.replies.map((reply) => ({
      ...reply,
      text: `Reply: ${reply.text}`,
    })),
  ]);

  return [
    "Timestamp,Comment",
    ...rows.map((comment) =>
      [
        escapeCsvCell(formatTimestamp(comment.timestampSeconds)),
        escapeCsvCell(commentText(comment)),
      ].join(","),
    ),
  ].join("\r\n");
}

export function buildCommentsCsvFilename(videoTitle: string) {
  const slug = videoTitle
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80)
    .replace(/-+$/g, "");

  return `${slug || "video"}-comments.csv`;
}
