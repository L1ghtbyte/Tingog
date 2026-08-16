# Tingog Pitch Script — Staged Draft

Built stage by stage, each one reviewed before moving to the next. Structure is checked against two references: Bant.ai's winning script (technique source) and our own prior script (what's being replaced or kept). **Stage numbering is narrative, not slide numbering** — see `DECK.md` for how slides map to these stages (not 1:1).

Total budget: **7 minutes**, demo included, Q&A excluded (no time limit there).

## Stage list

| # | Stage | Status |
|---|---|---|
| 1 | Opening — shared stake | **DRAFTED** |
| 2 | The Problem | **DRAFTED** |
| 3 | Product Reveal + Name Meaning | **DRAFTED** |
| 4 | The Four-Step Framework | **DRAFTED** |
| 5 | Live Demo — Persona-Driven Report | **DRAFTED** |
| 6 | Differentiator #1, flagged — Clustering | **DRAFTED** |
| 7 | Differentiator #2, flagged — Honest Silence | pending |
| 8 | Where AI Fits — Trust Boundary | pending |
| 9 | Why Not an App / What Makes Us Different (merged, moved late) | pending |
| 10 | Deployment & Scale — Vision Grounded in Real Constraints | pending |
| 11 | Closing — Callback + Local-Language Tagline | pending |

---

## Stage 1 — Opening: shared stake

**What changed:** this stage doesn't exist in the old script at all. The old script opens directly with the disaster scenario. New stage inserted before it.

**Why:** Bant.ai opens with a belief ("we believe technology plays a part in a child's development") before any problem statement — the audience agrees with something first, then gets asked to worry. Our old script asks for worry immediately, with nothing earned first. This line also seeds "voice/heard" as a throughline that pays off twice more later — at the name reveal (Tingog = voice) and at the closing tagline ("your voice doesn't") — the same full-circle technique Bant.ai uses with "Bantay."

**Timing:** ~5 seconds.

**Script:**

> We believe that in a disaster, every community deserves to be heard — not eventually. Immediately.

**Delivery note:** flat, declarative, no build-up — said plainly before the energy shifts into the problem in Stage 2. Slide: title card only (see `DECK.md`, Slide 1).

---

## Stage 2 — The Problem

**Revision history, in order:**

1. First pass kept the old script's "channel failure" framing (power/towers/internet down) almost verbatim, closing on "how does the barangay know which puroks need help."
2. Caught: that framing only argues *total* communication failure. It misses the deeper, actually-defensible root cause this whole project is built on — that even a *working* process is too slow, because the true situation changes before an assessment finishes escalating up the chain. Added a latency beat.
3. Caught (factual): the latency beat originally said "someone reaches the barangay hall, it gets written down" — backwards. The real, fieldwork-grounded process is a health worker physically going *out* to survey each community, not residents traveling *in* to report. Fixed the direction.
4. Caught (structural): with both the channel-failure argument and the latency argument in the same stage, the transition read as a contradiction — "some communities can't report at all" followed by "even where they can" implies two different populations without ever saying so. Also realized the channel-failure argument duplicates Stage 9 ("why not just an app"), which already makes that case properly. Collapsed channel-failure down to one clause of scene-setting and let latency be the entire point of this stage.

**Why latency, not channel failure, is the real argument here:** it's the one every other stage in this script actually depends on — the four-step framework, the AI-fits stage, the differentiators — all of them are about *speed*, not about *reachability*. Channel failure belongs to Stage 9's argument (why not an app); this stage's job is to justify the whole system's existence, which is a timing claim.

**Timing:** ~29–31 seconds.

**Script:**

> Imagine a major disaster hits your barangay. Communication is unreliable, sometimes gone completely.
> People need water, food, medicine, help.
>
> Here's the real problem: even when a community does get word out, it still goes through the normal process — a health worker has to physically go out and survey the damage before anything moves. By the time that reaches whoever decides where help goes, the situation's already changed.
>
> So the question isn't just can a community be heard.
> It's whether they're heard **in time** to still matter.

**Delivery note:** slight pause before "in time" — that's the word the whole pitch pivots on, give it a beat of its own.

---

## Stage 3 — Product Reveal + Name Meaning

**What changed:** one word-level fix. "Tingog means voice" → "Tingog is Bisaya for voice" — Bant.ai names the language explicitly ("Bisaya for to watch over"), not just the meaning. Naming the language here also quietly plants the fact before it's needed — if a judge later asks about the Bisaya button labels, the grounding language was already established here, not introduced reactively when challenged.

**What's already stronger than it looks:** "A purok's status should not depend on a person reaching it" wasn't rewritten, but it reads better now than it did before the Stage 2 fix — "a person reaching it" is literally the health-worker-survey bottleneck Stage 2 just described. That connection is a byproduct of getting Stage 2's facts right, not something deliberately engineered here.

**Considered and left alone:** could echo Stage 1's exact phrase ("not eventually. Immediately.") in the closing line instead of "when normal communication fails." Decided against forcing it — twice in under a minute risks sounding repeated rather than reinforcing. Revisit if the motif feels too weak once the whole script is read end to end.

**Timing:** ~19–20 seconds.

**Script:**

> That's the problem we wanted to solve.
> Our idea was simple: a purok's status should not depend on a person reaching it.
>
> We are L1ghtbyte, and this is Tingog.
> Tingog is Bisaya for voice.
>
> And that's exactly what we want to give every purok — a voice when normal communication fails.

---

## Stage 4 — The Four-Step Framework

**Revision history:**

1. First pass kept the old script's four steps almost as-is, with "Transmit" claiming the signal travels wirelessly (full stop) and "Respond" claiming the coordinator "acts on verified information."
2. Caught: "Transmit" only describes the purok→gateway hop. The gateway→laptop hop is a USB cable, disclosed two stages later in the live demo. Saying "wirelessly" here with no qualifier sets up a contradiction the moment the cable is shown. Fixed to describe the relay without over-claiming full wireless.
3. Caught: "verified information" reuses a word that gets a specific, mechanically-true meaning later (the Figure Checker actually checking AI claims against real data, Stage 8). Used loosely here, before that machinery exists in the pitch, it dilutes the word for when it needs full weight.
4. Caught (bigger): my fix for #3 replaced "verified" with "the coordinator... decides where to send help" — which is a real overclaim. This project has repeatedly, deliberately drawn the line that Tingog does not touch relief logistics or dispatch decisions (see `JUDGE_QA.md`). A framework overview that implies "Tingog → help gets sent" sets up a direct contradiction with that already-tested Q&A answer. Reverted to the original script's own safer instinct: "can act on it," which doesn't claim what the action is.
5. Caught (on "Understand," after a first fix that wasn't enough): "scores how urgent each report is" was wrong twice over — the system doesn't score individual reports, it continuously scores a *purok's overall situation* (fixed that part first) — but even "how urgent" alone still under-describes what "Understand" actually produces. The real system determines three separate things: what's needed (`active_needs`), how urgent it is (`severity`), and whether the purok's gone silent at all (`status`) — that last one is the whole silence-honesty differentiator, and the shorter version dropped it entirely. Rewritten to name all three, so this line properly sets up *both* later differentiator stages (clustering in Stage 6, silence-handling in Stage 7) instead of only one.

**Timing:** ~29–31 seconds (back near the original 30s allocation after Understand grew).

**Script:**

> Tingog works in four simple steps:
>
> Report — a resident presses a physical button.
> Transmit — the signal reaches a base device wirelessly, which relays it into our system.
> Understand — our system works out what's needed, how urgent it is, whether a purok's gone quiet, and whether the same need is showing up elsewhere.
> Respond — the coordinator sees the real situation on the dashboard and can act on it.
>
> Let me show you how that works.

---

## Stage 5 — Live Demo: Persona-Driven Report

**Revision history:**

1. The old script's "Purok 3" reference was never actually resolved from when it was first flagged — the real device shows on the dashboard as `Live Device (DEV-089)`, not "Purok 3." Saying "I'm a resident in Purok 3" would create a live, visible mismatch the moment the dashboard updates on screen. Fixed by dropping the specific purok number entirely — zero code risk, versus renaming the real device in config the night before the pitch.
2. The old script re-argued "why not a phone" twice within this one stage ("I don't have internet, I don't have mobile data" up front, "nobody had to call, text, or rely on a cell tower" at the close) — that's Stage 9's argument, made here before Stage 9 even exists in the pitch. Cut both, since this stage's job is to show the system working, not re-justify why it exists.
3. The old closing line was about *channel* independence. Everything else in this script — "not eventually, immediately" (Stage 1), "in time to still matter" (Stage 2), "shouldn't depend on a person reaching it" (Stage 3) — is about *time*. Rewrote the close to land on the same idea the rest of the pitch already built, instead of a different one.
4. Scenario changed from TUBIG (water) to TAMBAL (medicine) — a specific person needing medication reads as more urgent than a general supply shortage. Considered making Stage 6's cluster demo match (same need, continuous thread) but decided against it: different needs across the two demos actually proves the system generalizes across need types, and keeps Stage 6 using the cluster scenario that's *actually* seeded (TUBIG, Puroks 1 and 2) with zero code changes needed before the pitch.

**Timing:** budget is mostly physical action (walking, pressing, waiting for the real ~1.5s poll cycle to actually update the screen), not word count — the original 60s allocation still applies.

**Script:**

> Let's say a typhoon just hit, and someone in this community urgently needs medicine.
> *[walks to / points to module]*
>
> I simply press: TAMBAL.
> *[press button]*
>
> That's it. The ESP32 inside receives the press, and sends it — not through the internet, but directly over ESP-NOW — to our gateway.
> *[point to / show gateway ESP32]*
>
> This is the gateway. It picks up the signal and passes it to our laptop.
> *[show laptop]*
>
> And now —
> *[wait for dashboard update]*
>
> There it is. A medicine need, reported.
>
> No survey. No one had to reach us first.
> The coordinator knows — immediately.

---

## Stage 6 — Differentiator #1, flagged: Clustering

**Revision history:**

1. Old script implied the cluster forms live and sequentially in front of judges ("let's say Purok X also reports... and then Purok Y"). In reality this would come from re-seeded simulated data, already sitting there when the dashboard loads — not something happening step by step. Claiming it's live when it's actually a reveal of pre-existing state is the same category of overclaim caught in Stage 5.
2. Old script only names two puroks (5 and 7) despite its own next line saying "three separate button presses" — that "three" only worked in the old draft because it was counting the live press from the old (TUBIG) version of Stage 5. Now that Stage 5 is TAMBAL and unrelated, that count needed fixing.
3. The explicit "this is our differentiator" flag was planned for this stage when the 11-stage structure was set up, but the original script just describes clustering matter-of-factly. Added the flag.
4. **Fix for #1, better than originally planned:** instead of only revealing pre-seeded data, the presenter presses the real device live (TUBIG) during this stage. Since clustering groups by need type and timing regardless of whether a purok is real or simulated, and the seeded Puroks 1/2's TUBIG events are still well inside the 45-minute cluster window at this point in the pitch, the real press genuinely joins the cluster on screen, live. This makes the "watch this happen" framing true again instead of a soft overclaim, and reinforces Stage 5's mechanism a second time without re-explaining it.

**Timing:** ~34–36 seconds of speech, plus a physical press-and-wait beat (same shape as Stage 5, not free — flagged honestly).

**Script:**

> But one report is only the beginning.
>
> Here's the part that actually sets Tingog apart from a simple notification system.
>
> Purok 1 and Purok 2 have already been reporting TUBIG. Let's make it three.
> *[press button — TUBIG]* *[wait for dashboard update]*
>
> Now the coordinator isn't looking at three separate, isolated presses. Tingog recognizes multiple communities reporting the same need, close together in time — and draws the connection automatically.
> *[point to the cluster line on the map]*
>
> That's not a coincidence. That might be a wider water problem.
>
> This is where Tingog moves beyond collecting reports. It turns local signals into situational awareness.

---

## Stages 7–11

Not yet drafted — waiting on Stage 6 sign-off.
