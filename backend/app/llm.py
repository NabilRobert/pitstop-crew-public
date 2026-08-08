"""Thin OpenAI client wrapper — kept swappable so agent logic can be tested
with a fake client, and so a model/provider change is a one-line edit."""

import json

from openai import OpenAI

from app.config import OPENAI_API_KEY

MODEL_MINI = "gpt-5-mini"  # Orca, Anna — see agents/*.md for the reasoning
MODEL_FULL = "gpt-5"       # Rico, Sammy, Critic

_client: OpenAI | None = None


def get_client() -> OpenAI:
    global _client
    if _client is None:
        if not OPENAI_API_KEY:
            raise RuntimeError("OPENAI_API_KEY not set — add it to .env")
        _client = OpenAI(api_key=OPENAI_API_KEY)
    return _client


def complete(model: str, system_prompt: str, user_prompt: str, client: OpenAI | None = None) -> str:
    client = client or get_client()
    response = client.chat.completions.create(
        model=model,
        messages=[
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt},
        ],
    )
    return response.choices[0].message.content


def complete_json(model: str, system_prompt: str, user_prompt: str, client: OpenAI | None = None) -> dict:
    client = client or get_client()
    response = client.chat.completions.create(
        model=model,
        response_format={"type": "json_object"},
        messages=[
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt},
        ],
    )
    return json.loads(response.choices[0].message.content)
