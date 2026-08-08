"""Orca — orchestrator. See agents/orchestrator.md. Ties Damon -> Anna ->
Rico -> Critic -> Sammy together for the daily run and the weekly rollup.
The weekly feedback job (critic-pattern -> prompt-patch suggestion) is a
separate, simpler flow — see weekly_feedback.py."""

from datetime import date

from app import anna, critic_loop, damon, outputs, rico, sammy
from app.config import DATA_SOURCE
from app.context import build_performance_context
from app.pipeline_runs import track_run

TRAILING_WINDOW_DAYS = 7
ANALYSIS_LOOKBACK_DAYS = 30


def run_daily(target_date: date, seed: int = 0, data_source: str | None = None) -> dict:
    data_source = data_source or DATA_SOURCE
    with track_run("daily") as run:
        damon.sync_trailing_window(target_date, days=TRAILING_WINDOW_DAYS, seed=seed, data_source=data_source)
        result = _run_agent_chain(target_date, "daily", days=ANALYSIS_LOOKBACK_DAYS)
        run.cost_usd_micros = None  # populated once real token-usage accounting lands
        return result


def run_weekly(target_date: date) -> dict:
    with track_run("weekly") as run:
        result = _run_agent_chain(target_date, "weekly", days=TRAILING_WINDOW_DAYS)
        run.cost_usd_micros = None
        return result


def _run_agent_chain(target_date: date, period: str, days: int) -> dict:
    performance_data = build_performance_context(end_date=target_date, days=days)

    analysis_id = critic_loop.run_with_critic(
        "analysis",
        lambda feedback: anna.analyze(performance_data, feedback),
        performance_data,
        report_date=target_date,
    )
    analysis_content = outputs.get_output(analysis_id)["content"]

    recommendation_id = critic_loop.run_with_critic(
        "recommendation",
        lambda feedback: rico.recommend(analysis_content, feedback),
        performance_data,
        report_date=target_date,
    )
    recommendation_content = outputs.get_output(recommendation_id)["content"]

    summary_id = critic_loop.run_with_critic(
        "summary",
        lambda feedback: sammy.summarize(analysis_content, recommendation_content, period, feedback),
        performance_data,
        report_date=target_date,
    )

    return {
        "analysis_id": analysis_id,
        "recommendation_id": recommendation_id,
        "summary_id": summary_id,
    }
