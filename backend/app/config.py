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
# Verify against the live catalog at build.nvidia.com/explore/discover (or GET
# https://integrate.api.nvidia.com/v1/models with the real key) before the actual demo —
# exact slugs can change, same caveat as OpenRouter's model list. Confirmed live
# 2026-08-17 by querying that endpoint directly: the slug is "nvidia/nvidia-nemotron-
# nano-9b-v2" (the "nvidia-" prefix repeats), NOT "nvidia/nemotron-nano-9b-v2" — the
# shorter form 404s on every single attempt, silently wasting one full fallback-chain
# hop on every LLM call. nvidia-nemotron-nano-9b-v2 is listed FIRST: meta/llama-3.1-8b-
# instruct has a separate, confirmed structural issue ("This model only supports
# single tool-calls at once!") on this agent's normal multi-tool-call turns — kept as a
# last resort (it does succeed on single-tool turns) rather than removed, but must never
# sit ahead of a model that handles multi-tool turns correctly.
NVIDIA_MODELS = _env_list("NVIDIA_MODELS", ["nvidia/nvidia-nemotron-nano-9b-v2", "meta/llama-3.1-8b-instruct"])

OPENROUTER_API_KEY = os.getenv("OPENROUTER_API_KEY", "")
OPENROUTER_MODEL_FALLBACKS = _env_list("OPENROUTER_MODEL_FALLBACKS", [])

# Hard wall-clock deadline per model attempt, any provider (see agent/llm_client.py —
# httpx's own timeout can fail to fire if a provider trickles keep-alive bytes without
# finishing).
LLM_MODEL_TIMEOUT_SECONDS = _env_float("LLM_MODEL_TIMEOUT_SECONDS", 20)

# The Briefing Agent's third output field, "assessment" (agent/prompts.py's
# ASSESSMENT_ADDENDUM) — a genuine interpretive layer built ONLY from already-verified
# claims/narrative (never a new fact), explicitly framed as suggestions, never a
# decision. Added 2026-08-17, deliberately behind a flag: this is new, higher-risk
# surface added close to the actual pitch, and needs to be revertible with a single env
# var flip (or just deleting this line to fall back to the default) rather than a code
# rollback if it destabilizes reliability. Flip to False (or unset + change the default
# below) to instantly return to the exact prior claims+narrative-only contract.
ENABLE_ASSESSMENT_LAYER = _env_bool("ENABLE_ASSESSMENT_LAYER", True)

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

# Devices with a known, intended real-world placement (device_id -> (lat, lng)). A newly
# auto-registered gateway device without an entry here gets the barangay centroid plus a
# small deterministic offset instead (see ingestion_serial.py's _deterministic_offset) —
# that fallback has no awareness of the real coastline, and for our actual demo device
# (DEV-089) it happened to land in the water (verified against real OSM coastline
# geometry, 2026-08-17). Overriding it here with a checked, on-land position rather than
# patching the generic hash formula, which needs to stay a reasonable generic fallback
# for any future unknown device, not tuned to this one coastline. This position was
# picked (and re-picked once) specifically to stay ~300m+ from every simulated purok too
# — an earlier candidate sat ~56m from Purok 5, effectively overlapping it on the map.
KNOWN_DEVICE_POSITIONS: dict[str, tuple[float, float]] = {
    "DEV-089": (10.9925, 123.9355),
    "DEV-090": (10.9940, 123.9370),
}

# Same override idea as KNOWN_DEVICE_POSITIONS, for the display name — an unknown
# device still falls back to a generic "Live Device (id)" name (see
# ingestion_serial.py), but our actual demo device gets a real purok-style name so it
# reads the same as every simulated purok, matching the UI no longer distinguishing
# real from simulated at all.
KNOWN_DEVICE_NAMES: dict[str, str] = {
    "DEV-089": "Purok 7",
    "DEV-090": "Purok 8",
}

# Same override pattern again, for purok_leader — reasonable placeholder name (not any
# real identifiable person), same category as the simulated puroks' leader names in
# seed_data.py, so this purok's popup card doesn't stand out as the only one still
# saying "(TBD)".
KNOWN_DEVICE_LEADERS: dict[str, str] = {
    "DEV-089": "Rosario Fernandez",
    "DEV-090": "Miguel Santos",
}

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
