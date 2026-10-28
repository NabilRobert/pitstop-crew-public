# Research — Supporting Studies

Reference list backing key design decisions in [design-doc.md](design-doc.md). Organized by which decision each supports. Academic/peer-reviewed sources are separated from industry-reported figures — the latter are directional context from vendors/agencies, not proven research, and should be cited as "industry reports suggest," not as fact.

## 1. Conversion lag → supports the trailing-window re-fetch decision
Google's own documentation confirms delayed conversion attribution is real and systematic, especially for longer consideration cycles and cross-device journeys — directly validates why a single "yesterday only" pull would misreport recent days.

- [About conversion lag reporting — Google Ads Help](https://support.google.com/google-ads/answer/9347141?hl=en)
- [Analysing Google Ads data correctly: the role of delayed conversions](https://smarter-ecommerce.com/blog/en/google-ads/analysing-google-ads-data-correctly-delayed-conversions/)

## 2. Audience segmentation → supports the core segment-performance tracking feature

**Academic:**
- [Towards Data Quality Assessment in Online Advertising (arXiv)](https://arxiv.org/pdf/1711.11175)

**Industry-reported (directional, not peer-reviewed):**
- [31 Audience Targeting Statistics — DataPartners](https://www.datapartners.com/audience-targeting-statistics/)
- [How Audience Segmentation Helps Increase Conversion](https://newage.agency/en/expertise/how-audience-segmentation-helps-increase-conversion/)

## 3. Human-in-the-loop / no auto-apply → supports the "recommendations only, no auto-applied changes" design principle
The strongest, most directly usable set — real peer-reviewed research on why keeping a human as the final decision-maker matters, including evidence that people over-trust algorithmic advice even when it's wrong.

- [The impact of AI errors in a human-in-the-loop process — Cognitive Research: Principles and Implications](https://cognitiveresearchjournal.springeropen.com/articles/10.1186/s41235-023-00529-3)
- [Automation Bias and Selective Adherence to Algorithmic Advice — Oxford JPART](https://academic.oup.com/jpart/article/33/1/153/6524536)
- [Bias in the Loop: How Humans Evaluate AI-Generated Suggestions — Harvard Data Science Review](https://hdsr.mitpress.mit.edu/pub/nrcn4h7d/release/1)
- [Putting a human in the loop: increasing uptake but decreasing accuracy of automated decision-making — PMC](https://www.ncbi.nlm.nih.gov/pmc/articles/PMC10857587/)

**Note:** this research cuts both ways and is worth being honest about — human-in-the-loop doesn't automatically fix AI errors; people tend to over-comply with algorithmic suggestions regardless of correctness. This is part of the justification for the **critic agent**: an automated skeptic checking the AI's own output before a human ever sees it, rather than a human rubber-stamping raw suggestions.

## 4. LLMs for marketing analytics → supports the GPT-mini/GPT-5 agent layer
- [Harnessing the Potential of Large Language Models in Modern Marketing Management (arXiv)](https://arxiv.org/pdf/2501.10685)
- [Market research and knowledge using Generative AI — ScienceDirect](https://www.sciencedirect.com/science/article/pii/S2444569X25001416)

## 5. Reflection loops → supports the critic-feedback self-improvement design
The critic agent doesn't retrain the model — it improves the *system* by accumulating critique history and feeding recurring patterns back into the other agents' prompts. This is a published pattern in LLM agent research, not a novel idea invented for this project.

- [Reflexion: Language Agents with Verbal Reinforcement Learning (arXiv)](https://arxiv.org/abs/2303.11366)

## 6. Automotive / used car dealer benchmarks → supports the `dummy.md` synthetic profile
Real-world figures grounding the used-car-dealer demo dataset design (campaign structure, budget, blended CPC/CTR/conversion rate). US figures below informed campaign structure and the relative-cost pattern (PMax/Vehicle Ads cheaper than standard search); actual budget/CPC figures used in `dummy.md` are IDR-native (see Indonesia-specific sources), not converted from these.

**US-market (campaign structure & relative CPC pattern):**
- [Automotive Google Ads Statistics — Web Tonic](https://www.webtonic.io/blog/automotive-google-ads-statistics)
- [Google Ads Benchmarks by Industry — Agency Dashboard](https://agencydashboard.io/blog/google-ads-benchmarks-by-industry)
- [Google's Performance Max for Car Dealerships — Glo3D](https://glo3d.com/google_performance_max_dealer/)
- [Google Ads for Car Dealerships: A Comprehensive Setup Guide — Sona](https://www.sona.com/blog/how-to-optimize-google-ads-for-car-dealership-success)
- [Recommended Google Ads Budget for Car Dealerships in 2026 — Wiener Squad Media](https://www.wienersquadmedia.com/google-ads-budget-for-car-dealerships/)
- [Realistic Marketing Budget for a Car Dealership Doing $2M in Revenue — Ritner Digital](https://www.ritnerdigital.com/blog/whats-a-realistic-marketing-budget-for-a-dealership-doing-2m-a-year-in-revenue)

**Indonesia-specific (actual budget/CPC figures used in `dummy.md`):**
- [Biaya Iklan Google Ads Per Bulan 2025 — Rakitawebsite](https://www.rakitawebsite.com/biaya-iklan-google-ads-per-bulan/)
- [Berapa Biaya Google Ads? — Whello Indonesia](https://whello.id/tips-digital-marketing/biaya-google-ads/)
- [Biaya Google Ads Indonesia: Panduan Lengkap 2026 — Lopokopi](https://lopokopi.co/biaya-google-ads-indonesia/)

## 7. Google Ads API data availability → verifies the "Important Constraint" and segment design in PROJECT.md
Confirms against official Google documentation that individual user data is structurally unavailable (every reporting resource is an aggregate view, not per-person), and that the device/geography/demographic/audience segments the schema assumes are real, documented resources. Also surfaced a real implementation detail: demographic views (`age_range_view`, `gender_view`, `income_range_view`, `parental_status_view`) can't be combined into a single query — see `agents/data.md`.

- [Segmentation — Google Ads API](https://developers.google.com/google-ads/api/docs/reporting/segmentation)
- [age_range_view — Google Ads API](https://developers.google.com/google-ads/api/fields/v22/age_range_view)
- [income_range_view — Google Ads API](https://developers.google.com/google-ads/api/fields/v19/income_range_view)
- [Audience insights — Google Ads API](https://developers.google.com/google-ads/api/docs/insights/audience-insights)
- [Create and manage audiences — Google Ads API](https://developers.google.com/google-ads/api/docs/remarketing/audiences)

## 8. Google Ads Recommendations tab bias → supports the Positioning section in PROJECT.md
The core "why this, not Google's own tools" pitch: the Optimization Score is structurally maximized by accepting spend-expanding recommendations (broader match types, bigger budgets, audience expansion) regardless of CPA or lead quality — not a hunch, a widely documented criticism. Directly justifies why a critic-verified, suggestions-only, never-auto-applied system is structurally different, not just a nicer UI on the same incentives.

- [Why we frequently ignore Google's recommendations — Refuel Creative](https://www.refuelcreative.com.au/blog/why-we-frequently-ignore-googles-recommendations)
- [The truth about Google Ads recommendations (and auto-apply) — Search Engine Land](https://searchengineland.com/google-ads-recommendations-auto-apply-465909)
- [Google Ads Optimization Score: Exposed! — Grow My Ads](https://growmyads.com/google-ads-optimization-score/)
- [Google Ads Recommendations You Shouldn't Follow — Ten Thousand Foot View](https://www.tenthousandfootview.com/google-ads-recommendations-you-shouldnt-follow/)
