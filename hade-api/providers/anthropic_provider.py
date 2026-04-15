"""Anthropic Claude provider for HADE decision engine."""

from __future__ import annotations

import asyncio
import logging
import os

import anthropic

logger = logging.getLogger("hade.providers.anthropic")

DEFAULT_MODEL = "claude-sonnet-4-20250514"
_DEFAULT_LLM_TIMEOUT = 6.0


class AnthropicProvider:
    """HADE LLM provider backed by Anthropic Claude."""

    def __init__(self) -> None:
        api_key = os.environ.get("ANTHROPIC_API_KEY")
        if not api_key or api_key.startswith("your_"):
            raise RuntimeError("ANTHROPIC_API_KEY is not set or is a placeholder")

        _timeout = float(os.environ.get("HADE_LLM_TIMEOUT", _DEFAULT_LLM_TIMEOUT))
        self._client = anthropic.AsyncAnthropic(api_key=api_key, timeout=_timeout)
        self._model = os.environ.get("HADE_ANTHROPIC_MODEL", DEFAULT_MODEL)
        logger.info("Anthropic provider initialized (model=%s, timeout=%.1fs)", self._model, _timeout)

    async def generate(
        self, system_prompt: str, user_content: str, *, model_override: str | None = None
    ) -> str:
        """Generate a response using Anthropic Claude."""
        model = model_override or self._model
        try:
            response = await self._client.messages.create(
                model=model,
                max_tokens=512,
                system=system_prompt,
                messages=[{"role": "user", "content": user_content}],
            )
            return response.content[0].text
        except anthropic.APITimeoutError as exc:
            # Re-raise as asyncio.TimeoutError so brain.py classifies it correctly
            raise asyncio.TimeoutError(str(exc)) from exc
