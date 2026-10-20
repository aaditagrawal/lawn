import { createRoot } from "react-dom/client";
import { useRef, useState } from "react";
import { VideoPlayer, type VideoPlayerHandle } from "../../src/components/video-player/VideoPlayer";
import { ColorOverlay, type FrameNote } from "../../src/components/color/ColorOverlay";
import { ColorPanel } from "../../src/components/color/ColorPanel";
import { ColorNoteSummary } from "../../src/components/color/ColorNoteSummary";
import { useColorReview, type ColorNoteData } from "../../src/lib/color/useColorReview";
import "../../app/app.css";

type LocalNote = { id: string; text: string; timestampSeconds: number; colorNote: ColorNoteData };

// Color tools harness: the production player, overlay and panel with notes
// kept in memory instead of Convex.
function Harness() {
  const review = useColorReview();
  const playerRef = useRef<VideoPlayerHandle>(null);
  const [time, setTime] = useState(0);
  const [notes, setNotes] = useState<LocalNote[]>([]);
  return (
    <div className="flex h-dvh">
      <div className="flex min-w-0 flex-1 flex-col bg-black">
        <VideoPlayer
          ref={playerRef}
          src="/sample.mp4"
          controlsBelow
          editorControls
          onTimeUpdate={setTime}
          comments={notes.map((note) => ({
            _id: note.id,
            timestampSeconds: note.timestampSeconds,
            resolved: false,
            colorNote: note.colorNote,
          }))}
          overlay={
            <ColorOverlay
              review={review}
              notes={notes.map((note): FrameNote => ({
                id: note.id,
                timestampSeconds: note.timestampSeconds,
                colorNote: note.colorNote,
              }))}
              onSelectNote={(note) =>
                review.toggleViewedNote(
                  {
                    _id: note.id,
                    timestampSeconds: note.timestampSeconds,
                    colorNote: note.colorNote,
                  },
                  playerRef.current,
                )
              }
            />
          }
          overlayActive={Boolean(review.tool || review.eyedropper)}
          onVideoElement={review.setVideo}
        />
      </div>
      <aside className="w-96 overflow-y-auto border-l-2 border-[#1a1a1a] bg-[#f0f0e8]">
        <ColorPanel
          review={review}
          currentTime={time}
          onRequestPause={() => playerRef.current?.pause()}
          onSeek={(seconds) => playerRef.current?.seekTo(seconds)}
          stillLabel="v1"
          onSubmitColorNote={async (text, colorNote, timestampSeconds) => {
            setNotes((current) => [
              ...current,
              { id: `note-${current.length + 1}`, text, timestampSeconds, colorNote },
            ]);
          }}
        />
        <section aria-label="Posted notes" className="space-y-3 border-t-2 border-[#1a1a1a] p-4">
          {notes.map((note) => (
            <article key={note.id} data-testid="posted-note">
              <p className="text-sm">{note.text}</p>
              <ColorNoteSummary
                note={note.colorNote}
                isViewing={review.viewed?.commentId === note.id}
                onView={() =>
                  review.toggleViewedNote(
                    {
                      _id: note.id,
                      timestampSeconds: note.timestampSeconds,
                      colorNote: note.colorNote,
                    },
                    playerRef.current,
                  )
                }
                onRemix={() => review.draftFromNote(note.colorNote, note.timestampSeconds)}
              />
            </article>
          ))}
        </section>
      </aside>
    </div>
  );
}
createRoot(document.getElementById("root")!).render(<Harness />);
