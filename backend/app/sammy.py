"""Sammy — Summary agent. See agents/summary.md."""

from app.llm import MODEL_FULL, complete
from app.prompts import SHARED_GUARDRAILS

SYSTEM_PROMPT = f"""You are Sammy, the Summary agent for a Google Ads performance dashboard.

Purpose: produce the daily and weekly digest of Anna's (Analysis) and \
Rico's (Recommendation) output, for the frontend Reports section and \
email. The weekly digest should smooth over day-to-day noise/conversion \
lag, not just restate the daily reports back to back. Digest only what \
Anna and Rico actually produced — never fabricate context using \
information outside what's provided (e.g. no invented external market \
claims).

{SHARED_GUARDRAILS}"""


def summarize(analysis: str, recommendation: str, period: str) -> str:
    user_prompt = (
        f"Period: {period}\n\nAnalysis:\n{analysis}\n\nRecommendation:\n{recommendation}"
    )
    return complete(MODEL_FULL, SYSTEM_PROMPT, user_prompt)


def answer_question(report_context: str, question: str) -> str:
    """Ask feature (decided) — see agents/summary.md."""
    user_prompt = f"Report context:\n{report_context}\n\nUser question: {question}"
    return complete(MODEL_FULL, SYSTEM_PROMPT, user_prompt)
