"""Pluggable JSON-returning LLM backends for the script / prompt modules.

Zero-cost options come first:

* ``gemini``  - Google AI Studio free tier (an API key from aistudio.google.com,
                no subscription). Keys rotate on 429 via :class:`KeyRotator`.
* ``openai_compatible`` - any OpenAI-style ``/chat/completions`` server:
                a local Ollama / LM Studio / llama.cpp server (free, offline),
                or hosted Groq / OpenRouter free tiers.
* ``anthropic`` - optional paid backend through the official Anthropic SDK.

When no backend is configured the prompt director falls back to its
deterministic offline composer, so the pipeline never hard-requires an LLM.
"""

from __future__ import annotations

import json
import logging
import os
import re
import time
import urllib.error
import urllib.request
from abc import ABC, abstractmethod
from typing import Any, Optional

log = logging.getLogger("flowcraft.llm")


class LLMError(RuntimeError):
    pass


def _extract_json(text: str) -> Any:
    """Parse JSON from a model reply, tolerating ```json fences or prose."""
    text = text.strip()
    fence = re.search(r"```(?:json)?\s*(.*?)```", text, re.DOTALL)
    if fence:
        text = fence.group(1).strip()
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        pass
    for open_c, close_c in (("{", "}"), ("[", "]")):
        start, end = text.find(open_c), text.rfind(close_c)
        if 0 <= start < end:
            try:
                return json.loads(text[start:end + 1])
            except json.JSONDecodeError:
                continue
    raise LLMError(f"Model did not return valid JSON: {text[:300]}")


def _post_json(url: str, payload: dict, headers: dict[str, str], timeout: float = 120) -> dict:
    req = urllib.request.Request(
        url, data=json.dumps(payload).encode("utf-8"),
        headers={"Content-Type": "application/json", **headers}, method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        body = e.read().decode("utf-8", "replace")
        raise _HTTPStatus(e.code, body) from e


class _HTTPStatus(Exception):
    def __init__(self, code: int, body: str):
        super().__init__(f"HTTP {code}: {body[:400]}")
        self.code = code
        self.body = body


class LLMClient(ABC):
    name: str = "base"

    @abstractmethod
    def complete_json(self, system: str, user: str, schema: dict) -> Any:
        """Return parsed JSON matching ``schema`` (a JSON Schema object)."""


class GeminiClient(LLMClient):
    name = "gemini"

    def __init__(self, rotator, model: str = "gemini-2.5-flash", temperature: float = 0.9):
        self.rotator = rotator
        self.model = model
        self.temperature = temperature

    def complete_json(self, system: str, user: str, schema: dict) -> Any:
        last_err: Exception | None = None
        for _ in range(6):
            key_id, key = self.rotator.next()
            url = (f"https://generativelanguage.googleapis.com/v1beta/models/"
                   f"{self.model}:generateContent")
            payload = {
                "systemInstruction": {"parts": [{"text": system}]},
                "contents": [{"role": "user", "parts": [{"text": user}]}],
                "generationConfig": {
                    "temperature": self.temperature,
                    "responseMimeType": "application/json",
                },
            }
            try:
                data = _post_json(url, payload, {"x-goog-api-key": key})
            except _HTTPStatus as e:
                last_err = e
                if e.code == 429:
                    self.rotator.exhausted(key_id, seconds=65)
                    continue
                if e.code == 403 and "quota" in e.body.lower():
                    self.rotator.exhausted(key_id)
                    continue
                if e.code >= 500:
                    time.sleep(2)
                    continue
                raise LLMError(str(e)) from e
            try:
                text = "".join(p.get("text", "") for p in data["candidates"][0]["content"]["parts"])
            except (KeyError, IndexError) as e:
                raise LLMError(f"Unexpected Gemini response: {json.dumps(data)[:300]}") from e
            return _extract_json(text)
        raise LLMError(f"Gemini failed after retries: {last_err}")


class OpenAICompatibleClient(LLMClient):
    name = "openai_compatible"

    def __init__(self, base_url: str, model: str, api_key: str | None = None, temperature: float = 0.9):
        self.base_url = base_url.rstrip("/")
        self.model = model
        self.api_key = api_key
        self.temperature = temperature

    def complete_json(self, system: str, user: str, schema: dict) -> Any:
        payload = {
            "model": self.model,
            "temperature": self.temperature,
            "response_format": {"type": "json_object"},
            "messages": [
                {"role": "system", "content": system + "\nReply with a single JSON object only."},
                {"role": "user", "content": user},
            ],
        }
        headers = {"Authorization": f"Bearer {self.api_key}"} if self.api_key else {}
        last_err: Exception | None = None
        for attempt in range(4):
            try:
                data = _post_json(f"{self.base_url}/chat/completions", payload, headers, timeout=600)
                return _extract_json(data["choices"][0]["message"]["content"])
            except _HTTPStatus as e:
                last_err = e
                if e.code == 429 or e.code >= 500:
                    time.sleep(2 ** attempt)
                    continue
                if e.code == 400 and "response_format" in e.body:
                    payload.pop("response_format", None)
                    continue
                raise LLMError(str(e)) from e
            except (urllib.error.URLError, KeyError, IndexError) as e:
                raise LLMError(f"LLM server error at {self.base_url}: {e}") from e
        raise LLMError(f"LLM failed after retries: {last_err}")


class AnthropicClient(LLMClient):
    """Optional paid backend via the official ``anthropic`` SDK."""

    name = "anthropic"

    def __init__(self, model: str = "claude-opus-5-5", api_key: str | None = None):
        import anthropic  # imported lazily: optional dependency

        self._anthropic = anthropic
        self.client = anthropic.Anthropic(api_key=api_key) if api_key else anthropic.Anthropic()
        self.model = model

    def complete_json(self, system: str, user: str, schema: dict) -> Any:
        anthropic = self._anthropic
        try:
            response = self.client.beta.messages.create(
                model=self.model,
                max_tokens=16000,
                system=system,
                messages=[{"role": "user", "content": user}],
                output_config={
                    "effort": "medium",
                    "format": {"type": "json_schema", "schema": schema},
                },
                betas=["server-side-fallback-2026-07-01"],
                fallbacks="default",
            )
        except anthropic.RateLimitError as e:
            raise LLMError(f"Anthropic rate limited: {e}") from e
        except anthropic.APIStatusError as e:
            raise LLMError(f"Anthropic API error {e.status_code}: {e.message}") from e
        except anthropic.APIConnectionError as e:
            raise LLMError(f"Anthropic connection error: {e}") from e
        if response.stop_reason == "refusal":
            raise LLMError("Model declined this request")
        text = next((b.text for b in response.content if b.type == "text"), "")
        return _extract_json(text)


def build_llm(store) -> Optional[LLMClient]:
    """Create the configured backend from saved settings, or ``None``."""
    from config import KeyRotator  # local import to avoid a cycle

    cfg = store.get_setting("llm", {}) or {}
    provider = cfg.get("provider") or os.environ.get("FLOWCRAFT_LLM_PROVIDER", "")
    if provider == "gemini":
        rot = KeyRotator(store, "gemini")
        if not rot.has_keys():
            log.warning("Gemini selected but no key configured; using offline composer")
            return None
        return GeminiClient(rot, model=cfg.get("model", "gemini-2.5-flash"))
    if provider == "openai_compatible":
        return OpenAICompatibleClient(
            base_url=cfg.get("base_url", "http://127.0.0.1:11434/v1"),
            model=cfg.get("model", "qwen2.5:14b-instruct"),
            api_key=cfg.get("api_key") or None,
        )
    if provider == "anthropic":
        return AnthropicClient(model=cfg.get("model", "claude-opus-5-5"), api_key=cfg.get("api_key") or None)
    return None
