"""
Standalone mock ESP32 HTTP server.

Reproduces the real firmware's `GET /events?since=N` contract exactly — verified
byte-for-byte against `sendEvents()` in `src/main.cpp` on the
`ESP32-and-Web-Connection-Test` branch: same JSON shape, same `since` filtering
(`seq_num > since`), same single-button vs. COMBO+`buttons[]` branching, same
press_type values (single/hold/double).

Exists to exercise `poll_esp32_loop()` against a real HTTP connection — real
sockets, real JSON parsing, real idempotent inserts — before real hardware is
available, and as a repeatable way to rehearse the event-triggered demo on cue
without needing the physical device in the room.

Run:
    python mock_esp32.py --port 9000

Then point the backend at it (e.g. in backend/.env or inline):
    ESP32_BASE_URL=http://127.0.0.1:9000 uvicorn app.main:app --reload

Fire a press:
    curl -X POST http://127.0.0.1:9000/press -H "Content-Type: application/json" \\
         -d '{"buttons": ["TUBIG"], "press_type": "single"}'

Fire a combo (COMBO + buttons[]):
    curl -X POST http://127.0.0.1:9000/press -H "Content-Type: application/json" \\
         -d '{"buttons": ["TABANG", "TUBIG"], "press_type": "single"}'

Rehearse the flagship panic-press demo (3 distinct buttons in quick succession):
    curl -X POST http://127.0.0.1:9000/panic-press-demo
"""

import argparse
import time

import uvicorn
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel

DEVICE_ID = 1  # matches firmware's constexpr DEVICE_ID and backend's REAL_DEVICE_ID
BUTTON_NAMES = ["TABANG", "TUBIG", "TAMBAL", "PAGKAON", "LUWAS"]

app = FastAPI(title="Mock ESP32")

events: list[dict] = []
next_seq = 1


class PressIn(BaseModel):
    buttons: list[str]  # one name = single-button event, two names = COMBO
    press_type: str = "single"  # single | hold | double


def _append(buttons: list[str], press_type: str) -> dict:
    global next_seq
    event = {"seq_num": next_seq, "press_type": press_type, "timestamp": int(time.time())}
    if len(buttons) == 1:
        event["button"] = buttons[0]
    else:
        event["button"] = "COMBO"
        event["buttons"] = buttons
    events.append(event)
    next_seq += 1
    return event


@app.post("/press")
def press(body: PressIn):
    invalid = sorted(set(body.buttons) - set(BUTTON_NAMES))
    if invalid:
        raise HTTPException(422, f"unknown button(s): {invalid}")
    if not (1 <= len(body.buttons) <= 2):
        raise HTTPException(422, "buttons must be 1 (single-button event) or 2 (combo) names")
    if body.press_type not in ("single", "hold", "double"):
        raise HTTPException(422, "press_type must be single, hold, or double")
    return _append(body.buttons, body.press_type)


@app.post("/panic-press-demo")
def panic_press_demo():
    """Fires 3 distinct single-button events back to back — the flagship
    event-triggered demo condition (panic_press in escalation.py), independent
    of overall severity. Lets this be rehearsed on cue without real hardware."""
    fired = [_append([button], "single") for button in BUTTON_NAMES[:3]]
    return {"fired": fired}


@app.get("/events")
def get_events(since: int = 0):
    return {"device_id": DEVICE_ID, "events": [e for e in events if e["seq_num"] > since]}


@app.get("/")
def root():
    return {"mock": "ESP32", "device_id": DEVICE_ID, "buffered_events": len(events)}


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--port", type=int, default=9000)
    args = parser.parse_args()
    uvicorn.run(app, host="127.0.0.1", port=args.port)
