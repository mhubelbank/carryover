// Rule-check eval: runs the fixture set through the live 3-pass pipeline and
// scores each note against the deterministic CHECKS. Verbose — prints every
// generated note and every check result. Exits non-zero on any failure/error.
//
//   ANTHROPIC_API_KEY=... GITHUB_TOKEN=... npx tsx scripts/eval-checks.ts
//   (or PROMPTS_DIR=/path/to/data/prompts to use local prompts)
import { CHECKS } from "../src/__eval__/checks";
import { FIXTURES } from "../src/__eval__/fixtures";
import { generateNote } from "../src/domain/notes";
import { getGolden, getPrompts, mapPool, requireEnv } from "./_shared";

const apiKey = requireEnv("ANTHROPIC_API_KEY");
const rule = "=".repeat(72);

const prompts = await getPrompts("regular");
const golden = await getGolden();
console.log(`Running ${FIXTURES.length} fixtures through the regular pipeline${golden ? " (with golden examples)" : ""}…\n`);

let failCount = 0;
let errorCount = 0;

await mapPool(FIXTURES, 4, async (fx) => {
  let out = `\n${rule}\nFIXTURE: ${fx.name}  ·  student: ${fx.studentName}\n${rule}\n`;
  try {
    const r = await generateNote(apiKey, prompts, fx.ctx, { maxTokens: fx.maxTokens, goldenExamples: golden });
    out += `\n${r.final}\n`;
    out += `\nchecks:\n`;
    for (const c of CHECKS) {
      const res = c.run(r.final, fx);
      const tag = res.status === "pass" ? "PASS" : res.status === "fail" ? "FAIL" : " na ";
      if (res.status === "fail") failCount++;
      out += `  [${tag}] ${c.label}${res.detail ? ` — ${res.detail}` : ""}\n`;
    }
  } catch (e) {
    errorCount++;
    out += `\n✗ ERROR: ${e instanceof Error ? e.message : String(e)}\n`;
  }
  // Print each fixture's block atomically (avoids interleaving under concurrency).
  console.log(out);
});

console.log(`${rule}\nSUMMARY: ${FIXTURES.length} fixtures · ${failCount} check failure(s) · ${errorCount} error(s)\n${rule}`);
process.exit(failCount > 0 || errorCount > 0 ? 1 : 0);
