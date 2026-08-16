import os

from dotenv import load_dotenv

load_dotenv()


def _env_float(name: str, default: float) -> float:
    return float(os.getenv(name, default))


def _env_int(name: str, default: int) -> int:
    return int(os.getenv(name, default))


def _env_list(name: str, default: list[str]) -> list[str]:
    raw = os.getenv(name)
    if not raw:
        return default
    return [item.strip() for item in raw.split(",") if item.strip()]


def _env_bool(name: str, default: bool) -> bool:
    raw = os.getenv(name)
    if raw is None:
        return default
    return raw.strip().lower() in ("1", "true", "yes", "on")


# LLM providers, tried in this order (see agent/llm_client.py) — Groq and NVIDIA Build
# each give a DEDICATED per-account free quota (not a shared pool with other users'
# traffic), which is why they're tried first; OpenRouter's :free tier is a shared pool
# that was confirmed congested during testing on 2026-08-15, kept as a last-resort tier
# since congestion isn't permanent and it's still a real free option. A provider with no
# API key set is skipped entirely, not attempted and not counted as a failure.
GROQ_API_KEY = os.getenv("GROQ_API_KEY", "")
# Larger model first, deliberately — found live 2026-08-15: the smaller/faster
# llama-3.1-8b-instant always returns a syntactically valid (HTTP 200) response, so the
# fallback chain never even reached the larger model, but its actual claims were
# frequently imprecise (hallucinated fields, incomplete citations) — Figure Checker
# rejections, not infrastructure failures. A bigger model trades a little speed for
# meaningfully better citation accuracy; Groq is fast enough that this is still fast.
GROQ_MODELS = _env_list("GROQ_MODELS", ["llama-3.3-70b-versatile", "llama-3.1-8b-instant"])

NVIDIA_API_KEY = os.getenv("NVIDIA_API_KEY", "")
# Verify against the live catalog at build.nvidia.com/explore/discover before the actual
# demo — exact slugs can change, same caveat as OpenRouter's model list.
NVIDIA_MODELS = _env_list("NVIDIA_MODELS", ["meta/llama-3.1-8b-instruct", "nvidia/nemotron-nano-9b-v2"])

OPENROUTER_API_KEY = os.getenv("OPENROUTER_API_KEY", "")
OPENROUTER_MODEL_FALLBACKS = _env_list("OPENROUTER_MODEL_FALLBACKS", [])

# Hard wall-clock deadline per model attempt, any provider (see agent/llm_client.py —
# httpx's own timeout can fail to fire if a provider trickles keep-alive bytes without
# finishing).
LLM_MODEL_TIMEOUT_SECONDS = _env_float("LLM_MODEL_TIMEOUT_SECONDS", 20)

ESP32_BASE_URL = os.getenv("ESP32_BASE_URL", "http://192.168.4.1")
DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./tanaw.db")

INGESTION_POLL_INTERVAL_SECONDS = _env_float("INGESTION_POLL_INTERVAL_SECONDS", 1.5)
SEVERITY_SWEEP_INTERVAL_SECONDS = _env_float("SEVERITY_SWEEP_INTERVAL_SECONDS", 60)

# Real hardware direction, confirmed with the hardware engineer: purok devices (ESP-NOW,
# see tingog-purok) broadcast to one gateway device (tingog-gateway), which relays
# everything to this backend over a USB serial cable. This is now the PRIMARY ingestion
# path. The single-ESP32 WiFi-hotspot-and-HTTP firmware (ESP32_BASE_URL above) is
# superseded but not deleted — kept available as an opt-in fallback, matching how
# ingestion.py still has working, tested code for it.
ENABLE_GATEWAY_SERIAL_INGESTION = _env_bool("ENABLE_GATEWAY_SERIAL_INGESTION", True)
ENABLE_LEGACY_WIFI_INGESTION = _env_bool("ENABLE_LEGACY_WIFI_INGESTION", False)

GATEWAY_SERIAL_PORT = os.getenv("GATEWAY_SERIAL_PORT", "COM7")
GATEWAY_BAUD_RATE = _env_int("GATEWAY_BAUD_RATE", 115200)

# Devices with a known, intended real-world placement (device_id -> (lat, lng)). Empty by
# default — a newly auto-registered gateway device without an entry here gets the
# barangay centroid plus a small deterministic offset instead (see
# ingestion_serial.py's _deterministic_offset), the same placeholder-coordinate pattern
# used everywhere else in this project, pending real placement data.
KNOWN_DEVICE_POSITIONS: dict[str, tuple[float, float]] = {}

# Event-triggered mode (see app/escalation.py) — an optional webhook (e.g. Slack/Discord
# incoming-webhook URL) posted to the instant a purok newly crosses into severity="high".
# Unset by default — escalation records still get written to the DB either way, only the
# outbound push is skipped without a URL configured.
ESCALATION_WEBHOOK_URL = os.getenv("ESCALATION_WEBHOOK_URL", "")

# Scheduled mode (see agent/briefing_agent.py's scheduled_briefing_loop) — periodic
# briefing generation independent of anyone asking. Real-world default would be hours
# (a shift-handoff cadence); shorten via env for testing/demo purposes.
SCHEDULED_BRIEFING_INTERVAL_SECONDS = _env_float("SCHEDULED_BRIEFING_INTERVAL_SECONDS", 4 * 3600)

SILENCE_HOURS_WARN = _env_float("SILENCE_HOURS_WARN", 6)
SILENCE_HOURS_CRITICAL = _env_float("SILENCE_HOURS_CRITICAL", 12)
PANIC_PRESS_DISTINCT_BUTTONS = _env_int("PANIC_PRESS_DISTINCT_BUTTONS", 3)
PANIC_PRESS_WINDOW_MINUTES = _env_int("PANIC_PRESS_WINDOW_MINUTES", 15)
SEVERITY_HIGH_CUTOFF = _env_int("SEVERITY_HIGH_CUTOFF", 60)
SEVERITY_MEDIUM_CUTOFF = _env_int("SEVERITY_MEDIUM_CUTOFF", 30)
CLUSTER_WINDOW_MINUTES = _env_int("CLUSTER_WINDOW_MINUTES", 45)
CLUSTER_MIN_PUROKS = _env_int("CLUSTER_MIN_PUROKS", 2)
ANOMALY_EVENT_COUNT = _env_int("ANOMALY_EVENT_COUNT", 5)
ANOMALY_WINDOW_SECONDS = _env_int("ANOMALY_WINDOW_SECONDS", 60)
STABLE_LUWAS_HOURS = _env_float("STABLE_LUWAS_HOURS", 24)

# Status derivation's "very large / contacted once long ago" wording (03_inference_rules_spec.md)
# has no explicit number attached. Judgment call: reuse SILENCE_HOURS_CRITICAL as the
# unknown-status trigger rather than inventing a new separate constant.
STATUS_UNKNOWN_HOURS = SILENCE_HOURS_CRITICAL

# Barangay confirmed by the user: Lambusan, San Remigio, Cebu. Coordinates are Lambusan's
# real barangay centroid (verified via GADM boundary data + PhilAtlas, ~10.2m elevation),
# not a schematic placeholder. "San Remigio" is the MUNICIPALITY, not a barangay — do not
# use it here. STILL PLACEHOLDER: exact PUROK-level positions within Lambusan (in
# seed_data.py's per-purok offsets) are pending real placement from the teammate who lived
# through the San Remigio earthquake — this constant just fixes which barangay they'll be
# offset within.
BARANGAY_NAME = os.getenv("BARANGAY_NAME", "Lambusan")
BARANGAY_CENTER_LAT = _env_float("BARANGAY_CENTER_LAT", 10.9990)
BARANGAY_CENTER_LNG = _env_float("BARANGAY_CENTER_LNG", 123.9311)

# Real device's marker position — still placeholder, same barangay area. Disclosed verbally
# when presenting ("the board sits on a demo table"), not via a UI badge, since it's real
# (non-simulated) data just imprecisely located.
REAL_DEVICE_LAT = _env_float("REAL_DEVICE_LAT", BARANGAY_CENTER_LAT)
REAL_DEVICE_LNG = _env_float("REAL_DEVICE_LNG", BARANGAY_CENTER_LNG)
