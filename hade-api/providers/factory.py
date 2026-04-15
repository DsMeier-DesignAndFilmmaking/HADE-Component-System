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

DEFAULT_PROVIDER = "openai"

_SUPPORTED_PROVIDERS = {"anthropic", "openai", "google"}

# ── Model Target Resolution ─────────────────────────────────────────────────
#
# Maps frontend ModelTarget strings → (provider_name, actual API model ID).
# Used by brain.py to route settings.model_target to the correct provider
# and pass the right model string into provider.generate(model_override=...).

MODEL_TARGET_MAP: dict[str, tuple[str, str]] = {
    "gpt-4o":         ("openai",    "gpt-4o"),
    "gpt-4o-mini":    ("openai",    "gpt-4o-mini"),
    "claude-sonnet":  ("anthropic", "claude-sonnet-4-20250514"),
    "claude-haiku":   ("anthropic", "claude-haiku-4-20250514"),
    "gemini-flash":   ("google",    "gemini-1.5-flash"),
    # Ollama targets intentionally omitted — require local runtime, not cloud API
}

# Mode presets: when no explicit model_target, mode selects a quality tier
MODE_MODEL_MAP: dict[str, str] = {
    "precise":     "gpt-4o",           # highest quality available
    "balanced":    "",                  # empty → server default, no override
    "explorative": "",                  # no model change, but affects exploration temp
}


def resolve_model_target(
    model_target: str | None,
    mode: str | None = None,
) -> tuple[str | None, str | None]:
    """Resolve a frontend ModelTarget (and optional mode) to provider + model overrides.

    Returns:
        (provider_name_override, model_string_override) — either or both may be None,
        meaning "use the default".
    """
    # Explicit model_target takes priority over mode
    if model_target and model_target in MODEL_TARGET_MAP:
        return MODEL_TARGET_MAP[model_target]

    # Mode-based fallback
    if mode and mode in MODE_MODEL_MAP:
        mode_model = MODE_MODEL_MAP[mode]
        if mode_model and mode_model in MODEL_TARGET_MAP:
            return MODEL_TARGET_MAP[mode_model]

    return None, None


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
