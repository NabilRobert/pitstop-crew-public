"""REST API — what the Vercel frontend calls. Per PROJECT.md's Deployment
decision: no auth on this boundary (single-user), CORS locked to
FRONTEND_ORIGIN. Endpoints only cover what's actually been built so far —
reports/why-trail, Ask, Time Machine, system health."""

from datetime import date

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from app import ask as ask_module
from app import outputs, pipeline_runs, reporting
from app.config import DATA_SOURCE, FRONTEND_ORIGIN
from app.demo import time_machine
from app.demo.markov import STATES

app = FastAPI(title="Google Ads AI Performance Dashboard API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[FRONTEND_ORIGIN],
    allow_methods=["GET", "POST", "DELETE"],
    allow_headers=["*"],
)


@app.get("/health")
def health():
    return {"status": "ok"}


@app.get("/system-health")
def system_health():
    """Backs the System Health Standout Feature."""
    last_daily = pipeline_runs.get_last_successful_run("daily")
    return {
        "last_successful_daily_run": last_daily,
        "recent_runs": pipeline_runs.get_recent_runs(limit=20),
    }


@app.get("/config")
def get_config():
    """Backs the Demo Mode badge — always visible when active, per PROJECT.md."""
    return {"data_source": DATA_SOURCE}


@app.get("/campaigns")
def list_campaigns():
    return reporting.list_campaigns()


@app.get("/performance")
def get_performance(days: int = 30):
    return reporting.get_performance_series(days=days)


@app.get("/reports/latest")
def get_latest_report(period: str = "daily"):
    if period not in ("daily", "weekly"):
        raise HTTPException(status_code=400, detail="period must be 'daily' or 'weekly'")
    return reporting.get_latest_report(period)


@app.get("/outputs/{output_id}")
def get_output(output_id: int):
    result = outputs.get_output(output_id)
    if result is None:
        raise HTTPException(status_code=404, detail="Output not found")
    return result


@app.get("/outputs/{output_id}/why-trail")
def get_why_trail(output_id: int):
    """Backs the "why trail" Standout Feature."""
    trail = outputs.get_why_trail(output_id)
    if not trail:
        raise HTTPException(status_code=404, detail="Output not found")
    return trail


class AskRequest(BaseModel):
    output_id: int
    question: str


@app.post("/ask")
def ask(request: AskRequest):
    try:
        ask_id = ask_module.ask(request.output_id, request.question)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    return {"ask_id": ask_id, "history": ask_module.get_ask_history(request.output_id)}


class TimeMachineOverrideRequest(BaseModel):
    date: date
    forced_state: str


@app.post("/time-machine/override")
def set_time_machine_override(request: TimeMachineOverrideRequest):
    if request.forced_state not in STATES:
        raise HTTPException(status_code=400, detail=f"forced_state must be one of {STATES}")
    time_machine.set_override(request.date, request.forced_state)
    return {"date": request.date, "forced_state": request.forced_state}


@app.get("/time-machine/overrides")
def get_time_machine_overrides():
    return time_machine.get_overrides()


@app.delete("/time-machine/override/{override_date}")
def clear_time_machine_override(override_date: date):
    time_machine.clear_override(override_date)
    return {"cleared": override_date}
