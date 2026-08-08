"""Ask feature (decided) — on-demand Q&A against Rico or Sammy for a given
report. See agents/recommendation.md and agents/summary.md."""

from datetime import date

from app import outputs, rico, sammy
from app.context import build_performance_context
from app.db import get_connection

ASKABLE_AGENTS = {"recommendation": rico, "summary": sammy}


def ask(output_id: int, question: str) -> int:
    """Returns the new ask_log row id."""
    output = outputs.get_output(output_id)
    if output is None:
        raise ValueError(f"No ai_outputs row with id={output_id}")
    agent_type = output["agent_type"]
    if agent_type not in ASKABLE_AGENTS:
        raise ValueError(f"Only recommendation/summary outputs are askable, got {agent_type!r}")

    end_date = date.fromisoformat(output["report_date"]) if output["report_date"] else date.today()
    supporting_data = build_performance_context(
        campaign_id=output["campaign_id"],
        segment_id=output["segment_id"],
        end_date=end_date,
    )
    report_context = f"Report:\n{output['content']}\n\nUnderlying data:\n{supporting_data}"

    agent_module = ASKABLE_AGENTS[agent_type]
    answer = agent_module.answer_question(report_context, question)

    return _log_ask(output_id, agent_type, question, answer)


def _log_ask(output_id: int, agent_type: str, question: str, answer: str) -> int:
    with get_connection() as conn:
        cur = conn.execute(
            "INSERT INTO ask_log (output_id, agent_type, question, answer) VALUES (?, ?, ?, ?)",
            (output_id, agent_type, question, answer),
        )
        return cur.lastrowid


def get_ask_history(output_id: int) -> list[dict]:
    with get_connection() as conn:
        rows = conn.execute(
            "SELECT * FROM ask_log WHERE output_id = ? ORDER BY created_at", (output_id,)
        ).fetchall()
        return [dict(r) for r in rows]
