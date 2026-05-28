# App

Vite + React + TypeScript app for SESIS Notes.

See the root README for repo-wide context and deployment.

## Quickstart

```bash
npm install
npm run dev
```

Opens at `http://localhost:5173/`.

## Structure

```
src/
├── main.tsx              Entry point, mounts React
├── App.tsx               Top-level routing + auth gate
├── styles/               Design tokens, reset, shared component CSS
├── pages/                One file per top-level route
├── components/           Reused across pages
├── clients/              Wrappers for external systems (Anthropic, GitHub, localStorage)
├── domain/               Domain logic (grows in slice 2+)
└── context/              React contexts (auth for now; term data later)
```

Design principles:

- Add files when needed, not preemptively
- Colocate types with the code that uses them
- Inline styles using CSS variables are fine — reach for utility classes when a pattern repeats 3+ times

## Scripts

```bash
npm run dev        # Dev server
npm run build      # Type-check + build to dist/
npm run typecheck  # Type-check only
npm run preview    # Preview the production build locally
```

## Data paths in the repo

The app reads/writes these paths via the GitHub API:

- `data/teachers.json`
- `data/students.csv`
- `data/goals.csv`
- `data/schedule.csv`
- `data/term.json`
- `data/feedback-rules.md`
- `data/prompts/*.md`
- `data/iep-history/{studentId}.jsonl`
- `sessions/YYYY-MM-DD-teacher.json`
