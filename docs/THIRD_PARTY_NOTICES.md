# Third-party notices

Licenses were read from each project's own repository or npm metadata on 2026-10-04. Nothing here is
vendored or copied; everything comes in through npm. Where a license asks for the notice to travel with
a redistributed copy, the text is in the package's own folder inside `node_modules` and in the built
`dist/assets` license comments.

## UI guidance resources

| Resource | License | How it was used |
|---|---|---|
| [leonxlnx/taste-skill](https://github.com/leonxlnx/taste-skill) (`redesign-skill`) | MIT | **Read only.** Its audit-first workflow (typography, palette, rhythm, states) shaped the review order in `docs/DESIGN_SYSTEM.md`. No code, wording or visual composition was copied or installed. |
| [nextlevelbuilder/ui-ux-pro-max-skill](https://github.com/nextlevelbuilder/ui-ux-pro-max-skill) | MIT | **Read only.** Its accessibility and interaction rules (4.5:1 contrast, visible focus, reduced motion, meaning not carried by colour alone, explicit loading/error/empty states) are general principles restated in our own words in the design system. Not installed as a plugin. |
| [21st-dev Magic MCP](https://github.com/21st-dev/magic-mcp) | ISC | **Dev tool, installed locally, not shipped.** Installed as a Claude Code plugin to browse component ideas. Anything it generates is reviewed and reimplemented against our tokens; generated component code is only kept if its terms allow it. The API key lives in the git-ignored `.claude/settings.local.json`. |

Neither skill nor any 21st component is copied, so no MIT notice is redistributed in the app. If you later install either, keep its
LICENSE file.

## Runtime dependencies

| Package | License |
|---|---|
| react, react-dom | MIT |
| vite, @vitejs/plugin-react | MIT |
| lucide-react | ISC |
| recharts | MIT |
| @supabase/supabase-js | MIT |
| pdfjs-dist | Apache-2.0 |
| tesseract.js | Apache-2.0 |
| @fontsource/ibm-plex-sans, @fontsource/ibm-plex-mono (IBM Plex) | OFL-1.1 |

Tesseract.js downloads its WebAssembly core and language data when OCR is first used. Check the
self-hosting note in `docs/ARCHITECTURE.md` if you need OCR to work with no third-party fetch.

## Development-only dependencies

vitest (MIT), jsdom (MIT), @testing-library/* (MIT), fake-indexeddb (Apache-2.0), @electric-sql/pglite (Apache-2.0).

## Models and agents (evaluated, not bundled)

| Option | License / terms | Role here |
|---|---|---|
| Claude Code | commercial tool | Development agent used to build this. Project skills live in `.claude/skills/`. |
| OpenCode | see its repository | Development-agent alternative. It reads `.claude/skills/` as well. Not required. |
| Kimi K2.x (Moonshot AI) | Modified MIT, open weights | A **model family**, not a development tool. Roughly 1T parameters, not realistic to self-host on a personal machine; hosted use is paid. Documented as an option behind the optional AI flag only. |
| Ollama + a small open-weight model | per-model license | Practical local option for the optional explanation layer; check the specific model card. |

## Fonts

IBM Plex Sans and IBM Plex Mono are licensed under the SIL Open Font License 1.1, served from the app's own
origin (no Google Fonts request).
