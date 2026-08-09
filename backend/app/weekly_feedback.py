"""Weekly feedback job — reads the past week's critic critiques and drafts
a suggested prompt patch. NOT auto-applied; the returned text is meant to
be surfaced via the reporting channels (frontend + email, task 11) for
manual review. See PROJECT.md → "Critic feedback loop" and
agents/critic.md → "Feedback loop"."""

from datetime import date, timedelta

from app.db import get_connection
from app.llm import MODEL_FULL, complete
from app.pipeline_runs import track_run

SYSTEM_PROMPT = """You are drafting a weekly prompt-improvement suggestion \
for a Google Ads AI dashboard's agent team (Anna/analysis, Rico/\
recommendation, Sammy/summary).

You'll be given this week's critic critiques, each tagged with which agent \
it was about. Look for recurring patterns — the same kind of issue flagged \
more than once for the same agent — and draft a specific, concrete \
suggested edit to that agent's system prompt to address it. If an agent \
has no recurring pattern (only one-off critiques, or none), say so and \
suggest nothing for it. Do not invent patterns that aren't actually there \
across multiple critiques.

This is a suggestion for a human to review and apply manually — never \
phrase it as something you're doing yourself."""


def run(as_of: date | None = None) -> str | None:
    """Returns the suggestion text, or None if there were no critiques this
    week to learn from."""
    as_of = as_of or date.today()
    with track_run("weekly_feedback"):
        critiques = _get_week_critiques(as_of)
        if not critiques:
            return None
        user_prompt = "\n\n".join(
            f"[{c['reviewed_agent_type']}] {c['content']}" for c in critiques
        )
        return complete(MODEL_FULL, SYSTEM_PROMPT, user_prompt)


def _get_week_critiques(as_of: date) -> list[dict]:
    start = as_of - timedelta(days=7)
    with get_connection() as conn:
        rows = conn.execute(
            """
            SELECT critic.content, reviewed.agent_type AS reviewed_agent_type
            FROM ai_outputs critic
            JOIN ai_outputs reviewed ON reviewed.id = critic.critiques_id
            WHERE critic.agent_type = 'critic'
              AND critic.content != '(no issues found)'
              AND critic.created_at >= %s
            ORDER BY critic.created_at
            """,
            (start,),
        ).fetchall()
        return [dict(r) for r in rows]
