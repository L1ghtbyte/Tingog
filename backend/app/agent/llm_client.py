"""
Multi-provider fallback chain for the Briefing Agent's LLM calls. Providers are tried in
this order (see config.py): Groq -> NVIDIA Build -> OpenRouter's :free model chain.

Why this order: Groq and NVIDIA Build both give a DEDICATED per-account free quota, not
a shared pool with every other user of that model — architecturally different from
OpenRouter's :free tier, which is one queue shared by everyone using that specific model.
Confirmed live on 2026-08-15: every OpenRouter :free attempt either 429'd with
"limit_source":"upstream_provider_shared_pool" or silently timed out, while the shared
pool itself wasn't something switching API keys/accounts could fix. OpenRouter is kept as
a last-resort tier rather than removed — congestion isn't permanent, and it's still a
real free option.

Each provider is a flat (provider, base_url, api_key, model) attempt; a provider with no
API key configured is skipped entirely, not attempted and not counted as a failure. A
fresh httpx.AsyncClient is used per attempt (each attempt should be fully independent of
the others), and each is wrapped in asyncio.wait_for with a hard wall-clock deadline —
httpx's own timeout isn't reliable if a provider trickles keep-alive bytes without
finishing the response (also confirmed live on 2026-08-15).

Returns the RAW assistant message (dict with role/content/tool_calls), not parsed JSON —
callers decide whether a turn is a tool call or a final answer. response_format is
deliberately not forced here: combining strict JSON modes with tool-calling has known
rough edges across providers, and the system prompt's explicit instructions plus the
Figure Checker downstream already have to tolerate imprecise output regardless of what
any provider's schema mode claims to guarantee.
"""

import asyncio
import logging

import httpx

from app import config

logger = logging.getLogger("tanaw.llm_client")

GROQ_URL = "https://api.groq.com/openai/v1/chat/completions"
NVIDIA_URL = "https://integrate.api.nvidia.com/v1/chat/completions"
OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions"


class AllModelsFailedError(Exception):
    pass


class _Attempt:
    def __init__(self, provider: str, base_url: str, api_key: str, model: str):
        self.provider = provider
        self.base_url = base_url
        self.api_key = api_key
        self.model = model

    def __str__(self) -> str:
        return f"{self.provider}:{self.model}"


def _build_attempts() -> list[_Attempt]:
    attempts: list[_Attempt] = []
    if config.GROQ_API_KEY:
        attempts += [_Attempt("groq", GROQ_URL, config.GROQ_API_KEY, m) for m in config.GROQ_MODELS]
    if config.NVIDIA_API_KEY:
        attempts += [_Attempt("nvidia", NVIDIA_URL, config.NVIDIA_API_KEY, m) for m in config.NVIDIA_MODELS]
    if config.OPENROUTER_API_KEY:
        attempts += [_Attempt("openrouter", OPENROUTER_URL, config.OPENROUTER_API_KEY, m) for m in config.OPENROUTER_MODEL_FALLBACKS]
    return attempts


async def _call_one(attempt: _Attempt, messages: list[dict], tools: list[dict] | None) -> dict:
    payload: dict = {"model": attempt.model, "messages": messages}
    if tools:
        payload["tools"] = tools
        payload["tool_choice"] = "auto"

    # Fresh client per attempt, deliberately — see module docstring.
    async with httpx.AsyncClient(timeout=config.LLM_MODEL_TIMEOUT_SECONDS) as client:
        resp = await client.post(
            attempt.base_url,
            json=payload,
            headers={"Authorization": f"Bearer {attempt.api_key}"},
        )
        if resp.status_code >= 400:
            # httpx's default exception text (just status + URL) hides the actual reason
            # the provider gave — surfacing the response body directly, that's the part
            # worth seeing when diagnosing why a free-tier call failed.
            logger.warning("%s returned %s: %s", attempt, resp.status_code, resp.text[:500])
        resp.raise_for_status()
        return resp.json()["choices"][0]["message"]


async def call_llm_with_fallback(messages: list[dict], tools: list[dict] | None = None) -> dict:
    """Returns the raw assistant message dict for whichever provider/model succeeds
    first. May contain "tool_calls" (the model wants to call one or more tools) or just
    "content" (a final answer) — the caller (briefing_agent's ReAct loop) decides which."""
    attempts = _build_attempts()
    if not attempts:
        raise AllModelsFailedError(
            "No LLM providers configured — set at least one of GROQ_API_KEY, "
            "NVIDIA_API_KEY, OPENROUTER_API_KEY (+ their model lists) in .env"
        )

    last_error: Exception | None = None
    for attempt in attempts:
        try:
            return await asyncio.wait_for(
                _call_one(attempt, messages, tools),
                timeout=config.LLM_MODEL_TIMEOUT_SECONDS,
            )
        except (httpx.HTTPError, KeyError, IndexError, asyncio.TimeoutError) as exc:
            logger.warning("%s failed in fallback chain: %s", attempt, exc)
            last_error = exc
            continue

    raise AllModelsFailedError(f"All providers/models failed. Last error: {last_error}")
