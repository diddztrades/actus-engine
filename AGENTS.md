ACTUS OS AGENT RULE

This repo prioritizes decision quality over signal quantity.

Build for precision, not excitement: the engine should rather miss a mediocre trade than promote a bad one.

When editing logic, optimize for:
- cleaner classification
- stronger filtering
- clearer invalidation
- better opportunity ranking
- lower false positives
- stronger penalties for messy, stretched, late, or conflicting conditions

Do not simplify the engine into a decorative dashboard.
Preserve strong existing logic and minimize regressions.

PROJECT CONTEXT

ACTUS OS is a futures-first decision engine using Databento.

Current stack includes:
- Databento futures integration
- core assets currently wired first: NQ, GC, CL
- live streaming confirmed
- session engine
- NQ options chain discovery
- NQ gamma engine
- NQ positioning overlay
- redesigned state engine

The engine is not an indicator dashboard.
It is a decision engine.

CORE PRINCIPLES

- Futures first, not spot proxies
- Positioning modifies conviction, not direction alone
- State must be time-aware and not sticky
- Waiting should not trap assets unnecessarily
- Execute should appear when alignment is real
- Stale setups must decay
- Late setups must be penalized
- Invalidations must matter
- Preserve existing architecture unless a minimal targeted fix is clearly better

CURRENT IMPORTANT ISSUE

The live board has shown cases where everything appears in Waiting even though backend logic and responses indicate mixed states.
When debugging:
- trace the full board path end-to-end
- identify where state is calculated
- identify where it is overridden, flattened, cached, or re-derived
- prefer proof via debug output over assumptions

DEBUGGING RULES

When fixing live board state issues:
- do not rebuild architecture
- do not add unrelated features
- do not rewrite the engine unnecessarily
- focus on precise state propagation
- prove root cause before broad edits

IMPLEMENTATION STYLE

- Prefer minimal, surgical changes
- Preserve stronger existing logic
- Avoid regressions
- Keep outputs explainable
- Keep confidence honest
- Do not fake precision where data quality is weak