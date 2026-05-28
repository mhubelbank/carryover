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
  check: "<polyline points='5 12 10 17 20 7'/>",
  "chevron-left": "<polyline points='15 6 9 12 15 18'/>",
  "chevron-right": "<polyline points='9 6 15 12 9 18'/>",
  eye: "<circle cx='12' cy='12' r='2'/><path d='M22 12c-2.667 4.667 -6 7 -10 7s-7.333 -2.333 -10 -7c2.667 -4.667 6 -7 10 -7s7.333 2.333 10 7'/>",
  "external-link":
    "<path d='M11 7h-5a2 2 0 0 0 -2 2v9a2 2 0 0 0 2 2h9a2 2 0 0 0 2 -2v-5'/><path d='M10 14l10 -10'/><path d='M15 4h5v5'/>",
  "info-circle":
    "<circle cx='12' cy='12' r='9'/><line x1='12' y1='8' x2='12.01' y2='8'/><polyline points='11 12 12 12 12 16 13 16'/>",
  notebook:
    "<path d='M6 4h11a2 2 0 0 1 2 2v12a2 2 0 0 1 -2 2h-11a1 1 0 0 1 -1 -1v-14a1 1 0 0 1 1 -1m3 0v18'/><line x1='13' y1='8' x2='15' y2='8'/><line x1='13' y1='12' x2='15' y2='12'/>",
  plus: "<line x1='12' y1='5' x2='12' y2='19'/><line x1='5' y1='12' x2='19' y2='12'/>",
  refresh:
    "<path d='M20 11a8.1 8.1 0 0 0 -15.5 -2m-.5 -4v4h4'/><path d='M4 13a8.1 8.1 0 0 0 15.5 2m.5 4v-4h-4'/>",
  settings:
    "<path d='M10.325 4.317c.426 -1.756 2.924 -1.756 3.35 0a1.724 1.724 0 0 0 2.573 1.066c1.543 -.94 3.31 .826 2.37 2.37a1.724 1.724 0 0 0 1.065 2.572c1.756 .426 1.756 2.924 0 3.35a1.724 1.724 0 0 0 -1.066 2.573c.94 1.543 -.826 3.31 -2.37 2.37a1.724 1.724 0 0 0 -2.572 1.065c-.426 1.756 -2.924 1.756 -3.35 0a1.724 1.724 0 0 0 -2.573 -1.066c-1.543 .94 -3.31 -.826 -2.37 -2.37a1.724 1.724 0 0 0 -1.065 -2.572c-1.756 -.426 -1.756 -2.924 0 -3.35a1.724 1.724 0 0 0 1.066 -2.573c-.94 -1.543 .826 -3.31 2.37 -2.37c1 .608 2.296 .07 2.572 -1.065z'/><circle cx='12' cy='12' r='3'/>",
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
