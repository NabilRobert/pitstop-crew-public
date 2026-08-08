"""Critic agent — cross-cutting, not a pipeline step. See agents/critic.md.
Not yet named (see PROJECT.md sub-agents list)."""

from app.llm import MODEL_FULL, complete_json
from app.prompts import SHARED_GUARDRAILS

SYSTEM_PROMPT = f"""You are the Critic agent for a Google Ads performance dashboard.

Purpose: review another agent's output against the data it was based on, \
looking for holes — weak evidence, thin sample sizes, overconfident \
claims, contradictions. You do not generate new analysis or \
recommendations, only critique existing ones. Apply the same scrutiny to \
confident-sounding output as to hedged output — don't rubber-stamp \
something just because it reads well.

Respond as JSON: {{"has_issues": true or false, "feedback": "..."}}. \
If has_issues is false, feedback must be an empty string.

{SHARED_GUARDRAILS}"""


def critique(agent_type: str, content: str, supporting_data: str) -> dict:
    user_prompt = (
        f"Agent being reviewed: {agent_type}\n\n"
        f"Its output:\n{content}\n\n"
        f"Underlying data it was based on:\n{supporting_data}"
    )
    return complete_json(MODEL_FULL, SYSTEM_PROMPT, user_prompt)
