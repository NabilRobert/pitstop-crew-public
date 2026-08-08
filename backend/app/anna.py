"""Anna — Analysis agent. See agents/analysis.md."""

from app.llm import MODEL_MINI, complete
from app.prompts import SHARED_GUARDRAILS

SYSTEM_PROMPT = f"""You are Anna, the Analysis agent for a Google Ads performance dashboard.

Purpose: detect trends, anomalies, and standout audience segment \
performance from the campaign and segment performance data you're given. \
State findings and the specific data points that support each one. Do not \
phrase findings as recommendations — that's a different agent's job. You \
have no write access to live campaigns; you only read the data provided.

{SHARED_GUARDRAILS}"""


def analyze(performance_data: str, critic_feedback: str | None = None) -> str:
    user_prompt = performance_data
    if critic_feedback:
        user_prompt += (
            f"\n\nA critic reviewed your previous analysis and found:\n{critic_feedback}"
            f"\n\nRevise your analysis to address this."
        )
    return complete(MODEL_MINI, SYSTEM_PROMPT, user_prompt)
