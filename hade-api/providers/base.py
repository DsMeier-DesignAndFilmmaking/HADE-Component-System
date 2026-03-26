"""Base protocol for HADE LLM providers.

All providers must implement the `generate` method. Uses structural typing
via Protocol — no explicit inheritance required.
"""

from __future__ import annotations

from typing import Protocol


class LLMProvider(Protocol):
    """Consistent interface for all LLM providers in the HADE system."""

    async def generate(self, system_prompt: str, user_content: str) -> str:
        """Send a system prompt + user content and return raw text response.

        Args:
            system_prompt: HADE decision philosophy and output format instructions.
            user_content: Formatted context + venue list for this decision.

        Returns:
            Raw text response from the LLM (expected to be JSON).
        """
        ...
