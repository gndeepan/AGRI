"""Gemini (Google AI Studio) client behind a small interface so tests can substitute a fake."""

import logging
from typing import Literal, Protocol

from pydantic import BaseModel, Field

from app.core.config import get_settings
from app.core.errors import AppError

log = logging.getLogger(__name__)


class SuggestedTask(BaseModel):
    title: str = Field(description="Short task title")
    description: str = Field(description="What to do and why; no chemical doses")
    due_date: str = Field(description="YYYY-MM-DD")
    category: Literal["irrigation", "nutrient", "weed", "pest_scouting", "field_prep", "harvest", "observation",
                      "custom"]


class AssistantReply(BaseModel):
    answer: str = Field(description="Reply to the farmer in markdown, in the requested language")
    cited_source_ids: list[str] = Field(default_factory=list, description="IDs of knowledge snippets used")
    missing_information: list[str] = Field(default_factory=list)
    suggested_tasks: list[SuggestedTask] = Field(default_factory=list,
                                                 description="Optional tasks the farmer may choose to add")


class LLMClient(Protocol):
    model: str

    def generate(self, system: str, history: list[tuple[str, str]], prompt: str) -> AssistantReply: ...


class GeminiClient:
    def __init__(self, api_key: str, model: str):
        from google import genai

        self.client = genai.Client(api_key=api_key)
        self.model = model

    def generate(self, system: str, history: list[tuple[str, str]], prompt: str) -> AssistantReply:
        from google.genai import errors, types

        contents = [types.Content(role="model" if role == "assistant" else "user", parts=[types.Part(text=text)])
                    for role, text in history]
        contents.append(types.Content(role="user", parts=[types.Part(text=prompt)]))
        try:
            resp = self.client.models.generate_content(
                model=self.model, contents=contents,
                config=types.GenerateContentConfig(
                    system_instruction=system, temperature=0.3, response_mime_type="application/json",
                    response_schema=AssistantReply,
                ),
            )
        except errors.APIError as exc:
            log.error("gemini call failed", extra={"code": getattr(exc, "code", None), "error": str(exc)[:300]})
            raise AppError(502, "The assistant could not answer right now. Please try again.",
                           "assistant_error") from exc
        if isinstance(resp.parsed, AssistantReply):
            return resp.parsed
        try:
            return AssistantReply.model_validate_json(resp.text or "")
        except ValueError:
            return AssistantReply(answer=resp.text or "")


def get_llm() -> LLMClient:
    settings = get_settings()
    if not settings.gemini_api_key:
        raise AppError(503, "The AI assistant is not configured (GEMINI_API_KEY missing).", "assistant_unavailable")
    return GeminiClient(settings.gemini_api_key, settings.gemini_model)
