# Planning docs

Every spec and plan behind Pitstop, in two groups. Nothing here was
deleted. These are the documents as they were written. A "Status" line
inside a file shows where things stood on the day it was written, not
today.

## The case-study plan (October 2026)

How the shelved prototype was turned into this public case study.

| File | What it is |
|---|---|
| [phase-1-problem-brief.md](phase-1-problem-brief.md) | The problem, who it affects, and the success metrics |
| [phase-2-requirements-constraints.md](phase-2-requirements-constraints.md) | The requirements, constraints and Must / Should / Could list |
| [phase-5-architecture-decisions.md](phase-5-architecture-decisions.md) | The architecture decisions (ADR-001 to ADR-006) and the slice plan |
| [evaluation.md](evaluation.md) | The finished work, checked against the Phase 1 metrics and the Phase 2 list |

The log of how that went is [JOURNEY.md](../../JOURNEY.md).

## The original build (August to October 2026)

The specs and plans written while Pitstop itself was being built. The
v2 plans, the v3 keyword optimizer and the voice assistant were all
built; the code is in `backend/` and `frontend/`.

These files were renamed when they moved here. Code comments still cite
them by their old names (often as `docs/<old name>`), so the old name is
listed for each.

| File | Old name | What it is |
|---|---|---|
| [design-doc.md](original-build/design-doc.md) | `PROJECT.md` | The design doc: positioning, the agents, the data model, cost guardrails, known gaps |
| [research.md](original-build/research.md) | `research.md` | The studies and benchmarks behind the design decisions |
| [demo-dataset.md](original-build/demo-dataset.md) | `dummy.md` | The synthetic used-car-dealer account the demo data generator targets |
| [v2-backend-plan.md](original-build/v2-backend-plan.md) | `docs/v2-backend-plan.md` | v2: the full Google Ads data surface, backend stages |
| [v2-frontend-plan.md](original-build/v2-frontend-plan.md) | `docs/v2-frontend-plan.md` | v2: the frontend half of the same plan |
| [v3-keyword-optimizer-scope.md](original-build/v3-keyword-optimizer-scope.md) | `overhaul-v3.md` | v3: the keyword optimizer's scope, decisions and API contract |
| [v3-backend-plan.md](original-build/v3-backend-plan.md) | `overhaul-v3-backend.md` | v3: the backend steps, with "as built" notes |
| [v3-frontend-plan.md](original-build/v3-frontend-plan.md) | `overhaul-v3-frontend.md` | v3: the frontend steps |
| [v3-contract-3.3-campaign-proposals.md](original-build/v3-contract-3.3-campaign-proposals.md) | `overhaul-v3-contract-3.3.md` | v3 contract 3.3: whole-campaign proposals |
| [v3-contract-3.6-ad-suggestions.md](original-build/v3-contract-3.6-ad-suggestions.md) | `overhaul-v3-contract-3.6.md` | v3 contract 3.6: ad suggestions and simulated launches |
| [voice-assistant-plan.md](original-build/voice-assistant-plan.md) | `VOICE_ASSISTANT.md` | The voice assistant ("Ask Aska" and voice in the Ask panel) |

### Agent specs

One file per agent: its model, prompt design and guardrails. Code
comments cite these as `agents/<name>.md`.

| File | Agent |
|---|---|
| [orchestrator.md](original-build/agents/orchestrator.md) | Orca, which runs the pipeline in order |
| [data.md](original-build/agents/data.md) | Damon, the data fetch and store step (not a model) |
| [analysis.md](original-build/agents/analysis.md) | Anna, the analysis |
| [recommendation.md](original-build/agents/recommendation.md) | Rico, the recommendations |
| [summary.md](original-build/agents/summary.md) | Sammy, the summary |
| [critic.md](original-build/agents/critic.md) | Ciri, the critic that reviews every output |
