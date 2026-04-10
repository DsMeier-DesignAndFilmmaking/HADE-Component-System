"""Anthropic Claude provider for HADE decision engine."""

from __future__ import annotations

import logging
import os

import anthropic

logger = logging.getLogger("hade.providers.anthropic")

DEFAULT_MODEL = "claude-sonnet-4-20250514"
_DEFAULT_LLM_TIMEOUT = 5.0


class AnthropicProvider:
    """HADE LLM provider backed by Anthropic Claude."""

    def __init__(self) -> None:
        api_key = os.environ.get("ANTHROPIC_API_KEY")
        if not api_key or api_key == "your_key_here":
            raise RuntimeError("ANTHROPIC_API_KEY is not set or is a placeholder")

        _timeout = float(os.environ.get("HADE_LLM_TIMEOUT", _DEFAULT_LLM_TIMEOUT))
        self._client = anthropic.AsyncAnthropic(api_key=api_key, timeout=_timeout)
        self._model = os.environ.get("HADE_ANTHROPIC_MODEL", DEFAULT_MODEL)
        logger.info("Anthropic provider initialized (model=%s, timeout=%.1fs)", self._model, _timeout)

    async def generate(self, system_prompt: str, user_content: str) -> str:
        """Generate a response using Anthropic Claude."""
        response = await self._client.messages.create(
            model=self._model,
            max_tokens=256,
            system=system_prompt,
            messages=[{"role": "user", "content": user_content}],
        )

        # Extract text from the first content block
        return response.content[0].text
