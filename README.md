# Case Workbench: concept prototype (HiLabs APM case study)

A working prototype of a reimagined case-management workbench for an RN case manager ("Maria") at a US health plan.
**All data is synthetic.** Phone numbers use the fictional 555-01xx range.

## What it shows (5–7 minute walkthrough: click **5-min tour**)
| Screen | What Maria gets |
|---|---|
| **Today** | 10 members ranked by `clinical risk (1–5) × time window (1–3) × reachability (0.5–1)`, the reason for each rank, re-ordering with a logged reason, and the alert that a guard held back (Margaret's mail-order refill). |
| **Member 360** | Signals S1–S8 that cite record IDs, guards checked before alerting, sources that disagree shown side by side, medication reconciliation, a timeline with "not yet received" items, identity-match and consent gates. |
| **Call prep** | Ranked contact numbers (source, freshness, consent), a template callback text, and a 30-second AI call brief. |
| **Document** | Call transcript → AI-drafted note fields with sources → Maria reviews each field → sign once (fans out to 5 places). |
| **How it works** | Pipeline, scoring, trust rules, AI boundaries, and the 24 planted data flaws with how each is handled. |

The top 5 members are the 5 patients in the deck and in `HiLabs_Synthetic_Patients_Annex.xlsx` (same record IDs).

## Architecture
- Static page (`index.html`, `styles.css`, `app.js`, `data.json`); no build step, no database, no storage (no Vercel Blob). State lives in memory for the session.
- `api/ai.js`: Vercel serverless function calling Gemini. The key is read from the `GEMINI_API_KEY` environment variable and never sent to the browser.
  - Only two jobs: call brief and note draft. Ranking and alerts are deterministic rules, so they are auditable.
  - Temperature 0.1, JSON schema output, only the member's own records in the prompt.
  - Server-side validation: any line citing a record ID that is not in that member's record is removed.
  - Any failure (no key, quota, timeout, bad JSON) returns a pre-generated draft, so the demo never breaks.
  - Optional `GEMINI_MODEL` env var overrides the model list.
- `tools/gen_data.py` regenerates `data.json` (mirrors the Excel annex).
