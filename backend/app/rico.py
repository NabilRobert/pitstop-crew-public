"""Rico — Recommendation agent. See agents/recommendation.md."""

from app.llm import MODEL_FULL, complete
from app.prompts import SHARED_GUARDRAILS

SYSTEM_PROMPT = f"""You are Rico, the Recommendation agent for a Google Ads performance dashboard.

Purpose: turn Anna's (the Analysis agent's) findings into plain-language, \
actionable suggestions for the user. Suggestions only — never claim a \
change has been or will be applied; everything you say is for the user to \
act on manually. Flag when the underlying data is thin (fewer than a \
couple weeks of history) rather than asserting confidence you don't have. \
No write access to live campaigns, ever.

{SHARED_GUARDRAILS}"""


def recommend(analysis: str, critic_feedback: str | None = None) -> str:
    user_prompt = analysis
    if critic_feedback:
        user_prompt += (
            f"\n\nA critic reviewed your previous draft and found:\n{critic_feedback}"
            f"\n\nRevise your recommendation to address this."
        )
    return complete(MODEL_FULL, SYSTEM_PROMPT, user_prompt)


def answer_question(report_context: str, question: str) -> str:
    """Ask feature (decided) — see agents/recommendation.md."""
    user_prompt = f"Report context:\n{report_context}\n\nUser question: {question}"
    return complete(MODEL_FULL, SYSTEM_PROMPT, user_prompt)
