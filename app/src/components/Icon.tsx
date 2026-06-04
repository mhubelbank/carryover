// Renders a Tabler icon by name. Icons are inlined as SVGs with
// stroke="currentColor" so they inherit color from text styling.
//
// To add an icon: paste its inner SVG markup into ICONS below. Paths come
// from https://tabler.io/icons (MIT licensed).

const ICONS = {
  "alert-circle":
    "<circle cx='12' cy='12' r='9'/><line x1='12' y1='8' x2='12' y2='12'/><line x1='12' y1='16' x2='12.01' y2='16'/>",
  "calendar-plus":
    "<path d='M12.5 21h-6.5a2 2 0 0 1 -2 -2v-12a2 2 0 0 1 2 -2h12a2 2 0 0 1 2 2v6.5'/><line x1='16' y1='3' x2='16' y2='7'/><line x1='8' y1='3' x2='8' y2='7'/><line x1='4' y1='11' x2='20' y2='11'/><line x1='16' y1='19' x2='22' y2='19'/><line x1='19' y1='16' x2='19' y2='22'/>",
  bulb: "<path d='M3 12h1m8 -9v1m8 8h1m-15.4 -6.4l.7 .7m12.1 -.7l-.7 .7'/><path d='M9 16a5 5 0 1 1 6 0a3.5 3.5 0 0 0 -1 3a2 2 0 0 1 -4 0a3.5 3.5 0 0 0 -1 -3'/><line x1='9.7' y1='17' x2='14.3' y2='17'/>",
  cake: "<path d='M3 20h18v-8a3 3 0 0 0 -3 -3h-12a3 3 0 0 0 -3 3v8'/><path d='M3 14.803c.312 .135 .654 .204 1 .197a2.4 2.4 0 0 0 2 -1a2.4 2.4 0 0 1 2 -1a2.4 2.4 0 0 1 2 1a2.4 2.4 0 0 0 2 1a2.4 2.4 0 0 0 2 -1a2.4 2.4 0 0 1 2 -1a2.4 2.4 0 0 1 2 1a2.4 2.4 0 0 0 2 1c.35 .007 .692 -.062 1 -.197'/><path d='M12 4l1.465 1.638a2 2 0 1 1 -3.015 .099l1.55 -1.737'/>",
  gift: "<path d='M3 9a1 1 0 0 1 1 -1h16a1 1 0 0 1 1 1v2a1 1 0 0 1 -1 1h-16a1 1 0 0 1 -1 -1l0 -2'/><path d='M12 8l0 13'/><path d='M19 12v7a2 2 0 0 1 -2 2h-10a2 2 0 0 1 -2 -2v-7'/><path d='M7.5 8a2.5 2.5 0 0 1 0 -5a4.8 8 0 0 1 4.5 5a4.8 8 0 0 1 4.5 -5a2.5 2.5 0 0 1 0 5'/>",
  check: "<polyline points='5 12 10 17 20 7'/>",
  "clipboard-check":
    "<path d='M9 5h-2a2 2 0 0 0 -2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2 -2v-12a2 2 0 0 0 -2 -2h-2'/><path d='M9 5a2 2 0 0 1 2 -2h2a2 2 0 0 1 2 2a2 2 0 0 1 -2 2h-2a2 2 0 0 1 -2 -2'/><path d='M9 14l2 2l4 -4'/>",
  "chevron-left": "<polyline points='15 6 9 12 15 18'/>",
  "chevron-right": "<polyline points='9 6 15 12 9 18'/>",
  "door-enter":
    "<path d='M13 12v.01'/><path d='M3 21h18'/><path d='M5 21v-16a2 2 0 0 1 2 -2h6m4 10.5v7.5'/><path d='M21 7h-7m3 -3l-3 3l3 3'/>",
  "door-exit":
    "<path d='M13 12v.01'/><path d='M3 21h18'/><path d='M5 21v-16a2 2 0 0 1 2 -2h7.5m2.5 10.5v7.5'/><path d='M14 7h7m-3 -3l3 3l-3 3'/>",
  eye: "<circle cx='12' cy='12' r='2'/><path d='M22 12c-2.667 4.667 -6 7 -10 7s-7.333 -2.333 -10 -7c2.667 -4.667 6 -7 10 -7s7.333 2.333 10 7'/>",
  "external-link":
    "<path d='M11 7h-5a2 2 0 0 0 -2 2v9a2 2 0 0 0 2 2h9a2 2 0 0 0 2 -2v-5'/><path d='M10 14l10 -10'/><path d='M15 4h5v5'/>",
  "info-circle":
    "<circle cx='12' cy='12' r='9'/><line x1='12' y1='8' x2='12.01' y2='8'/><polyline points='11 12 12 12 12 16 13 16'/>",
  pencil:
    "<path d='M4 20h4l10.5 -10.5a2.828 2.828 0 1 0 -4 -4l-10.5 10.5v4'/><path d='M13.5 6.5l4 4'/>",
  notebook:
    "<path d='M6 4h11a2 2 0 0 1 2 2v12a2 2 0 0 1 -2 2h-11a1 1 0 0 1 -1 -1v-14a1 1 0 0 1 1 -1m3 0v18'/><line x1='13' y1='8' x2='15' y2='8'/><line x1='13' y1='12' x2='15' y2='12'/>",
  plus: "<line x1='12' y1='5' x2='12' y2='19'/><line x1='5' y1='12' x2='19' y2='12'/>",
  refresh:
    "<path d='M20 11a8.1 8.1 0 0 0 -15.5 -2m-.5 -4v4h4'/><path d='M4 13a8.1 8.1 0 0 0 15.5 2m.5 4v-4h-4'/>",
  search: "<circle cx='10' cy='10' r='7'/><line x1='21' y1='21' x2='15' y2='15'/>",
  "user-off":
    "<path d='M8.18 8.189a4.01 4.01 0 0 0 2.616 2.627m3.507 -.545a4 4 0 1 0 -5.59 -5.552'/><path d='M6 21v-2a4 4 0 0 1 4 -4h4c.412 0 .81 .062 1.183 .178m2.633 2.618c.12 .38 .184 .785 .184 1.204v2'/><path d='M3 3l18 18'/>",
  settings:
    "<path d='M10.325 4.317c.426 -1.756 2.924 -1.756 3.35 0a1.724 1.724 0 0 0 2.573 1.066c1.543 -.94 3.31 .826 2.37 2.37a1.724 1.724 0 0 0 1.065 2.572c1.756 .426 1.756 2.924 0 3.35a1.724 1.724 0 0 0 -1.066 2.573c.94 1.543 -.826 3.31 -2.37 2.37a1.724 1.724 0 0 0 -2.572 1.065c-.426 1.756 -2.924 1.756 -3.35 0a1.724 1.724 0 0 0 -2.573 -1.066c-1.543 .94 -3.31 -.826 -2.37 -2.37a1.724 1.724 0 0 0 -1.065 -2.572c-1.756 -.426 -1.756 -2.924 0 -3.35a1.724 1.724 0 0 0 1.066 -2.573c-.94 -1.543 .826 -3.31 2.37 -2.37c1 .608 2.296 .07 2.572 -1.065z'/><circle cx='12' cy='12' r='3'/>",
  sparkles:
    "<path d='M16 18a2 2 0 0 1 2 2a2 2 0 0 1 2 -2a2 2 0 0 1 -2 -2a2 2 0 0 1 -2 2z'/><path d='M16 6a2 2 0 0 1 2 2a2 2 0 0 1 2 -2a2 2 0 0 1 -2 -2a2 2 0 0 1 -2 2z'/><path d='M9 18a6 6 0 0 1 6 -6a6 6 0 0 1 -6 -6a6 6 0 0 1 -6 6a6 6 0 0 1 6 6z'/>",
  x: "<path d='M18 6l-12 12'/><path d='M6 6l12 12'/>",
  // Prompting-type symbols: verbal (speech), tactile (pointing finger),
  // gestural (open hand), modeled (a person to imitate). visual reuses `eye`.
  message:
    "<path d='M8 9h8'/><path d='M8 13h6'/><path d='M18 4a3 3 0 0 1 3 3v8a3 3 0 0 1 -3 3h-5l-5 3v-3h-2a3 3 0 0 1 -3 -3v-8a3 3 0 0 1 3 -3h12z'/>",
  "hand-finger":
    "<path d='M8 13v-7.5a1.5 1.5 0 0 1 3 0v6.5'/><path d='M11 5.5v-2a1.5 1.5 0 1 1 3 0v8.5'/><path d='M14 5.5a1.5 1.5 0 0 1 3 0v6.5'/><path d='M17 7.5a1.5 1.5 0 0 1 3 0v8.5a6 6 0 0 1 -6 6h-2h.208a6 6 0 0 1 -5.012 -2.7a69.74 69.74 0 0 1 -.196 -.3c-.312 -.479 -1.407 -2.388 -3.286 -5.728a1.5 1.5 0 0 1 .536 -2.022a1.867 1.867 0 0 1 2.28 .28l1.27 1.32'/>",
  // Tabler hand-finger-right (gestural prompt).
  "hand-finger-right":
    "<path d='M12 8h8.5a1.5 1.5 0 0 1 0 3h-7.5'/><path d='M13.5 11h2a1.5 1.5 0 0 1 0 3h-2.5'/><path d='M14.5 14a1.5 1.5 0 0 1 0 3h-1.5'/><path d='M13.5 17a1.5 1.5 0 1 1 0 3h-4.5a6 6 0 0 1 -6 -6v-2v.208a6 6 0 0 1 2.7 -5.012l.3 -.196q .718 -.468 5.728 -3.286a1.5 1.5 0 0 1 2.022 .536c.44 .734 .325 1.674 -.28 2.28l-1.47 1.47'/>",
  user:
    "<path d='M8 7a4 4 0 1 0 8 0a4 4 0 0 0 -8 0'/><path d='M6 21v-2a4 4 0 0 1 4 -4h4a4 4 0 0 1 4 4v2'/>",
} as const;

export type IconName = keyof typeof ICONS;

interface IconProps {
  name: IconName;
  size?: number;
  // Inline label for accessibility. Omit for purely decorative icons.
  label?: string;
}

export function Icon({ name, size = 16, label }: IconProps) {
  const paths = ICONS[name];
  if (!paths) {
    if (import.meta.env.DEV) {
      console.warn(`Icon "${name}" not found. Add it to ICONS in Icon.tsx.`);
    }
    return null;
  }

  // Build the SVG inline so we can color it via `currentColor`. Faster and
  // simpler than the mask-image approach we used for the static mocks.
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="${!label}">${paths}</svg>`;

  return (
    <span
      role={label ? "img" : undefined}
      aria-label={label}
      style={{ display: "inline-flex", lineHeight: 0 }}
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}
