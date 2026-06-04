import type { Student } from "../domain/student";

// Circular student avatar: the chosen emoji on a warm brown background, falling
// back to the first (+ last) initial when no emoji is set.
const AVATAR_BG = "#e1c8b8";
export function StudentAvatar({
  student,
  size = 32,
}: {
  student: Pick<Student, "emoji" | "firstName" | "lastName">;
  size?: number;
}) {
  const f = student.firstName.trim()[0] ?? "";
  const l = student.lastName.trim()[0] ?? "";
  const initials = (f + l).toUpperCase() || "?";
  // One letter ~0.44, two letters a bit smaller; emoji larger — but emoji glyphs
  // overflow their box, so trim the scale on small (list) avatars.
  const emojiScale = size >= 40 ? 0.58 : 0.46;
  const scale = student.emoji ? emojiScale : initials.length > 1 ? 0.38 : 0.44;
  return (
    <span
      aria-hidden
      style={{
        width: size,
        height: size,
        flexShrink: 0,
        borderRadius: "50%",
        background: AVATAR_BG,
        // Fixed dark text — the circle is always light tan, in light and dark mode.
        color: "#46362a",
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: Math.round(size * scale),
        fontWeight: 500,
        lineHeight: 1,
        userSelect: "none",
        textShadow: "0 1px 2px rgba(0, 0, 0, 0.15)",
      }}
    >
      {student.emoji || initials}
    </span>
  );
}

// First grapheme of a string (so a multi-codepoint emoji — flags, skin tones —
// stays intact, and stray extra characters are dropped).
export function firstGrapheme(s: string): string {
  const t = s.trim();
  if (!t) return "";
  const Seg = (Intl as unknown as { Segmenter?: typeof Intl.Segmenter }).Segmenter;
  if (Seg) {
    const first = [...new Seg().segment(t)][0];
    return first ? first.segment : t;
  }
  return [...t][0] ?? "";
}
