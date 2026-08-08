"""Ties an agent's generate function to the Critic, enforcing the max-2-
revisions-per-agent-per-run cap from PROJECT.md's cost guardrails."""

from typing import Callable

from app import critic, outputs

MAX_REVISIONS = 2


def run_with_critic(
    agent_type: str,
    generate: Callable[[str | None], str],
    supporting_data: str,
    campaign_id: int | None = None,
    segment_id: int | None = None,
) -> int:
    """`generate(critic_feedback)` is the agent's own call — None on the
    first pass, the critic's feedback text on every revision. Returns the
    id of the final ai_outputs row (status 'approved' or 'flagged')."""
    content = generate(None)
    current_id = outputs.insert_output(
        agent_type, content, status="draft", campaign_id=campaign_id, segment_id=segment_id
    )

    for _ in range(MAX_REVISIONS):
        verdict = critic.critique(agent_type, content, supporting_data)
        outputs.insert_output(
            "critic", verdict["feedback"] or "(no issues found)", critiques_id=current_id
        )
        if not verdict["has_issues"]:
            outputs.update_status(current_id, "approved")
            return current_id

        content = generate(verdict["feedback"])
        current_id = outputs.insert_output(
            agent_type, content, status="revised",
            campaign_id=campaign_id, segment_id=segment_id, revises_id=current_id,
        )

    outputs.update_status(current_id, "flagged")
    return current_id
