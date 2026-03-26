"""Google Gemini provider for HADE decision engine."""

from __future__ import annotations

import asyncio
import logging
import os

import google.generativeai as genai

logger = logging.getLogger("hade.providers.google")

DEFAULT_MODEL = "gemini-1.5-flash"


class GoogleProvider:
    """HADE LLM provider backed by Google Gemini."""

    def __init__(self) -> None:
        api_key = os.environ.get("GOOGLE_API_KEY")
        if not api_key or api_key == "your_key_here":
            raise RuntimeError("GOOGLE_API_KEY is not set or is a placeholder")

        genai.configure(api_key=api_key)
        self._model_name = os.environ.get("HADE_GOOGLE_MODEL", DEFAULT_MODEL)
        logger.info("Google provider initialized (model=%s)", self._model_name)

    async def generate(self, system_prompt: str, user_content: str) -> str:
        """Generate a response using Google Gemini.

        The google-generativeai SDK is synchronous, so we wrap in
        asyncio.to_thread() to keep the event loop non-blocking.
        """
        model = genai.GenerativeModel(
            model_name=self._model_name,
            system_instruction=system_prompt,
            generation_config=genai.GenerationConfig(
                response_mime_type="application/json",
                max_output_tokens=1024,
            ),
        )

        response = await asyncio.to_thread(
            model.generate_content, user_content
        )

        return response.text
