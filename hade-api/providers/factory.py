"""LLM Provider Factory for HADE decision engine.

Routes to the correct provider based on HADE_LLM_PROVIDER env var.
Imports are lazy to avoid loading unused SDKs.
"""

from __future__ import annotations

import logging
import os
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from providers.base import LLMProvider

logger = logging.getLogger("hade.providers.factory")

DEFAULT_PROVIDER = "anthropic"

_SUPPORTED_PROVIDERS = {"anthropic", "openai", "google"}


def get_llm_provider(provider_name: str | None = None) -> LLMProvider:
    """Instantiate and return the configured LLM provider.

    Args:
        provider_name: Override provider selection. If None, reads
                       HADE_LLM_PROVIDER from env (default: "anthropic").

    Returns:
        An initialized LLMProvider instance.

    Raises:
        ValueError: If the provider name is not recognized.
        RuntimeError: If the provider's API key is missing.
    """
    name = provider_name or os.environ.get("HADE_LLM_PROVIDER", DEFAULT_PROVIDER)
    name = name.strip().lower()

    if name not in _SUPPORTED_PROVIDERS:
        raise ValueError(
            f"Unknown LLM provider '{name}'. Supported: {', '.join(sorted(_SUPPORTED_PROVIDERS))}"
        )

    logger.info("Initializing LLM provider: %s", name)

    if name == "anthropic":
        from providers.anthropic_provider import AnthropicProvider
        return AnthropicProvider()

    if name == "openai":
        from providers.openai_provider import OpenAIProvider
        return OpenAIProvider()

    if name == "google":
        from providers.google_provider import GoogleProvider
        return GoogleProvider()

    # Should never reach here due to the set check above
    raise ValueError(f"Unknown LLM provider '{name}'")
