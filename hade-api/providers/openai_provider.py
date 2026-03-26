"""OpenAI GPT provider for HADE decision engine."""

from __future__ import annotations

import logging
import os

import openai

logger = logging.getLogger("hade.providers.openai")

DEFAULT_MODEL = "gpt-4o-mini"


class OpenAIProvider:
    """HADE LLM provider backed by OpenAI GPT."""

    def __init__(self) -> None:
        api_key = os.environ.get("OPENAI_API_KEY")
        if not api_key or api_key == "your_key_here":
            raise RuntimeError("OPENAI_API_KEY is not set or is a placeholder")

        self._client = openai.AsyncOpenAI(api_key=api_key, timeout=15.0)
        self._model = os.environ.get("HADE_OPENAI_MODEL", DEFAULT_MODEL)
        logger.info("OpenAI provider initialized (model=%s)", self._model)

    async def generate(self, system_prompt: str, user_content: str) -> str:
        """Generate a response using OpenAI GPT."""
        response = await self._client.chat.completions.create(
            model=self._model,
            response_format={"type": "json_object"},
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_content},
            ],
            max_tokens=1024,
        )

        return response.choices[0].message.content or ""
