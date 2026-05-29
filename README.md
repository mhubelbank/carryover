# SESIS Notes

A note-writing app for Emily's caseload. Replaces seven near-duplicate
TSX-in-Artifacts files plus a Google Sheet with one configurable web app.

## How it runs

The app is deployed to Cloudflare Pages, gated by Cloudflare Access. Only
Emily can load the URL — anyone else gets a sign-in challenge they can't
complete.

Her data lives in this private GitHub repo. The app reads and writes that
data over the GitHub API using a personal access token she pastes in on
first run.

## Privacy

Student data is FERPA-protected. With this setup:

- The app URL is gated by Cloudflare Access — random visitors are blocked
  at the edge, not at the app layer
- The repo is private — invisible to anyone without a token scoped to it
- The Anthropic API key has a monthly spend cap — bounded damage if exfiltrated
- Both keys live only in Emily's browser `localStorage`

## Repo layout

```
mhubelbank/emily-sesis     (private)
├── app/                    Vite + React + TypeScript app source
├── data/                   Emily's roster, goals, schedule, prompts (live data)
└── sessions/               Append-only generated note history
```

- `data/` is the source of truth, edited through the app
- `sessions/` accumulates generated notes — append-only

## First-time setup (developer, one-time)

### 1. Create the Cloudflare Pages project

1. Sign in to Cloudflare. (Free tier is fine.)
2. Workers & Pages → Create → Pages → Connect to Git
3. Authorize Cloudflare to read this private repo
4. Build settings:
   - Framework preset: **Vite**
   - Build command: `cd app && npm install && npm run build`
   - Build output directory: `app/dist`
   - Root directory: leave blank (project root)
5. Save and deploy. Initial deploy takes a few minutes.

### 2. Set up Cloudflare Access

1. Zero Trust → Access → Applications → Add an application → Self-hosted
2. Application name: `SESIS Notes`
3. Session duration: 1 month (so Emily isn't constantly re-authing)
4. Application domain: the `*.pages.dev` URL from step 1, or a custom subdomain if you set one up
5. Add a policy:
   - Policy name: `Emily`
   - Action: `Allow`
   - Include: `Emails` → her email address
6. Save. The app is now gated.

### 3. Configure auto-deploy

Cloudflare Pages automatically rebuilds on push to `main`. No additional
workflow file needed.

To skip rebuilds on pure-data commits, configure the Cloudflare build to
only trigger when files in `app/` change. Cloudflare's UI doesn't expose
this directly, but you can set the build to check the latest commit and
exit early if it only touches `data/` or `sessions/`. (Or accept the cost
of a build per data commit — they're fast and free on the Pages tier.)

### 4. Grant Emily repo access

Add Emily as a collaborator with write access so her token can reach the data
(GitHub → repo **Settings → Collaborators → Add people**), or run:

```
gh api -X PUT repos/mhubelbank/emily-sesis/collaborators/<her-username> -f permission=push
```

She accepts the emailed invite. Required: a classic `repo` token only reaches
repositories the token owner's account can already see.

## First-time setup (Emily, one-time)

1. **Get an Anthropic API key** at https://console.anthropic.com/settings/keys.
   Set a monthly spend cap in your billing dashboard for safety.

2. **Create a GitHub token (classic)** at
   https://github.com/settings/tokens/new?scopes=repo&description=SESIS+Notes
   (the link pre-selects the scope):
   - Type: **Tokens (classic)**, not fine-grained — a fine-grained PAT can't be
     scoped to a repo owned by someone else, and the repo lives on the
     developer's account, so classic is required here.
   - Scope: **`repo`** (checked)
   - Expiration: 1 year. Rotate it when you set up the new term each summer, so
     it never lapses mid-year.

   You must first be added as a collaborator on the repo (developer setup
   step 4) — a classic token only reaches repos your account can already see.

3. **Open the app URL.** Cloudflare Access asks for her email and sends a
   one-time code. Safari remembers the session afterwards.

4. **Paste both keys** into the Welcome screen. They're validated against
   the real APIs before the app proceeds.

## Daily use

Emily opens the bookmarked URL in Safari. The Cloudflare Access session
keeps her signed in for a month at a time; when it expires she gets an
email code to re-auth.

## Local development

For working on the app itself:

```bash
cd app
npm install
npm run dev
```

Opens at `http://localhost:5173/`. Use the same two keys as the deployed
app — local dev reads/writes the same data repo via GitHub API. As the repo
owner you only need a classic `repo` token (no collaborator invite required).

See `app/README.md` for the app's source layout.

## Slices

- **Slice 1**: Welcome + Settings + key validation
- **Slice 2**: Read-only data screens (Students, Goals, Schedule, Today)
- **Slice 3**: Edit affordances (inline edit, add/remove, validation)
- **Slice 4**: Goal-writing workflow (bulk paste + AI shortname suggestion)
- **Slice 5**: Note generation (three-pass pipeline)
- **Slice 6**: Year setup wizard, IEP review, regenerate with feedback
- **Slice 7**: Export
