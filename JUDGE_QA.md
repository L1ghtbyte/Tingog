# Tingog — Judge Q&A Preparation

*Two parts: questions already tested against real mentor review (with answers proven to hold up), and questions nobody's asked yet but a sharp judge plausibly will. Every question is phrased as a judge would actually ask it; every answer is phrased as us actually answering, out loud, structured with whichever framework fits that specific question best — not one template forced onto all of it:*

- **AREM** (Answer → Reason → Example → Message) — for a direct question with a direct answer: say it, justify it, back it with evidence, close with a memorable line.
- **PREP** (Point → Reason → Example → Point) — for defending a decision against a challenge: assert it, justify it, back it, restate it.
- **OREO** (Opinion → Reason → Example → Opinion) — for a judgment call or an open tension where we're stating our own position, not a settled fact.

For the second set, every answer is either a real, defensible position or an honest flag that it needs the team's own input — nothing here is invented confidence.

## Demo strategy — how to actually show each of the four modes in a timed pitch

**Event-triggered — must be live, this is the flagship moment, rehearse it specifically.**
- Trigger with the panic-press condition specifically (3 distinct buttons, rapid succession) — it fires independent of overall severity reaching "high," so it doesn't depend on other seeded state lining up correctly. The most reliable, deterministic thing to demo live.
- Detection latency is bounded by the ~1.5s device poll, not by any AI call — this is fast and consistent, worth protecting rehearsal time for so the "press → alert appears" beat lands cleanly.
- Know your starting purok state before you're on stage. If a webhook is wired to something visible (a projected Slack/Discord channel), that's the strongest version of this moment.

**On-demand — now streams live step-by-step (2026-08-17); still keep a pre-recorded fallback ready.**
- Measured during development: a real checked ("briefed") response ranged from ~3 seconds best case to 80+ seconds worst case, cycling through the provider fallback chain under real free-tier congestion. Live streaming (`GET /api/briefing/stream`) doesn't change that underlying latency — it changes what the worst case *looks like*: instead of dead air, the audience watches real tool calls arrive (which tools, in what order), a live Figure Checker pass, and — if it happens — a genuine "a claim didn't check out, retrying" moment, which is a stronger demonstration of the fact-checking pitch (§11) than a fast answer would be.
- The risk this doesn't remove: a stalled connection (a slow/congested provider, a venue-network hiccup) is now a visibly frozen step list instead of a normal spinner, which reads worse if it happens. Rehearse this specifically before trusting it live — see the plan's Stage F rehearsal checklist (local correctness pass, an induced Figure-Checker-failure pass, a forced-provider-failure pass, and if possible one run on the actual venue network).
- **Keep a genuine pre-recorded exchange ready regardless** (a real call, real checked output, not staged) — the presentation-layer fallback if live streaming has *any* problem in the room. The blocking, non-streaming `/api/briefing` endpoint is also still fully intact as a middle fallback (live, just not step-by-step) if only the streaming transport misbehaves. Two independent fallback layers, not one.

**Scheduled — don't attempt to trigger it live at all; show evidence it already ran.**
- Even a shortened interval is dead air in a pitch. Show the accumulated briefing history (real timestamped entries from development/testing) as proof the mechanism fires unattended over time, instead of demanding live stage time to watch a timer.

## Part 1 — Already tested against real mentor review

**Judge: "Who holds the hardware? Who can access it, who's actually got authority over it?"**

- **Answer:** We installed it at a fixed, shared community point, not any one household — and we deliberately let anyone in the community press it, unrestricted.
- **Reason:** Fixed placement means it doesn't depend on one specific person being present. Unrestricted access is the same logic as a fire alarm — restricting who's "allowed" to signal distress would defeat the entire purpose.
- **Example:** Accountability, not access, turned out to be the real gap here — a mentor caught this directly in an earlier review. We modeled it with a `purok_leader` field, currently a reasonable placeholder ("Purok Leader (TBD)") since we don't have real roster data yet.
- **Message:** Once real barangay governance data exists, that field maps onto an existing purok leader role — not a permission system we invented ourselves. Full answer in `ARCHITECTURE.md` §13.

**Judge: "The buttons are all labeled in Bisaya — isn't that exclusionary for other regions?"**

- **Point:** That was a deliberate pilot choice, not an oversight.
- **Reason:** Our grounding case — San Remigio, Cebu — is a Bisaya-speaking area, so the labels match exactly where we're actually demonstrating this.
- **Example:** `TABANG`/`TUBIG`/etc. are internal identifiers in our data model — nobody in the field ever reads them. What's physically printed on the button is a manufacturing decision, decoupled from the backend entirely. The real fielded fix is icons (which also solve illiteracy, not just language) plus localized text as a redundant second channel.
- **Point (restated):** So no — we don't have to touch a single line of software to fix this for a wider rollout.

**Judge: "Does a button press correlate to an individual — does more presses mean more people need help?"**

- **Answer:** No.
- **Reason:** One device serves an entire purok, so a press means "this community has this need," not a headcount.
- **Example:** We verified this directly in our own scoring code — repeat presses of the same button never increase severity.
- **Message:** This is a real, still-open limitation we haven't solved, and we're not claiming otherwise.

**Judge: "Why purok-level devices — why not one per household?"**

- **Point:** Cost, plainly.
- **Reason:** Per-household deployment is a 20–50x hardware multiplier over per-purok at any real municipal scale.
- **Example:** Per-household was actually our original idea — we dropped it specifically for this reason.
- **Point (restated):** That multiplier is the difference between something deployable and something flatly impossible at scale.

**Judge: "What are the trigger modes — on-demand, scheduled, event-triggered — and how are they actually different?"**

- **Answer:** On-demand and scheduled both run the exact same AI-written, checked briefing — they only differ in who asks, a person versus a timer. Event-triggered is a separate, deterministic mechanism that never touches the AI layer at all.
- **Reason:** A safety-critical "this just got serious" alert can't depend on an AI call succeeding.
- **Example:** Four specific conditions drive it — severity crossing into high, dropping back out, a panic-press threshold on its own, or a new cross-purok cluster.
- **Message:** Full breakdown in `ARCHITECTURE.md` §10.

**Judge: "Is the on-demand mode basically a chatbot?"**

- **Answer:** Functionally, yes, when given a specific question.
- **Reason:** Natural language in, the agent decides what to look up, natural language out.
- **Example:** Two things keep it from being a generic chatbot — it can only use this system's own tools, and every claim it makes is mechanically verified before we ever show it.
- **Message:** That verification step is the real differentiator, not the conversational surface.

**Judge: "Does every data change trigger an alert?"**

- **Answer:** No.
- **Reason:** We deliberately chose four specific conditions, not "anything changed."
- **Example:** A purok newly crossing into high severity, dropping back out of it, crossing the panic-press threshold on its own, or a new cross-purok cluster forming.
- **Message:** Everything else stays silent by design — we didn't want to build something that cries wolf.

**Judge: "Why is severity scoring deterministic instead of AI-driven?"**

- **Opinion:** We don't think severity scoring should be AI-driven at all.
- **Reason:** A fixed rule table gives identical inputs identical outputs, every time, with every score traceable to exactly which rule fired. An AI model could reasonably score the same situation differently on different runs, and its stated reasoning is generated after the fact — no guarantee it's the actual mechanism.
- **Example:** For a system whose output might shape where limited response attention goes, we decided that gap wasn't acceptable.
- **Opinion (restated):** So the inference engine stays deterministic, full stop — the AI only writes narrative around numbers we've already computed.

**Judge: "Events already carry a timestamp — why does the backend need to poll the device at all?"**

- **Answer:** Because recording *when* something happened and the backend *knowing about* it are two different problems.
- **Reason:** The ESP32 buffers presses in its own memory on its own isolated WiFi network — nothing connects it to our backend until something actively asks "what's happened?"
- **Example:** We considered push instead — the device sending data itself — and rejected it, since that shifts connection-management complexity onto the more constrained device instead of the more capable backend.
- **Message:** Polling is just that retrieval step, not a second clock layered on top of the first.

**Judge: "Is severity logic merely time-based — 'gone quiet for N hours'?"**

- **Answer:** No.
- **Reason:** Two of our five rules have nothing to do with elapsed time at all.
- **Example:** A held TABANG press alone scores medium severity (40 points) instantly — zero time-based rules involved.
- **Message:** Full breakdown in `ARCHITECTURE.md` §7.

**Judge: "If events are already timestamped, why does the inference engine also need a periodic sweep — isn't recomputing on each new event enough?"**

- **Answer:** No, and this is the sharpest version of the polling question, because it exposes something structural.
- **Reason:** Severity partly depends on how much time has passed since the last event, measured against right now — a moving target. If we only recomputed on new events, a purok that goes completely silent would never get recomputed again, since there's no new event to trigger it.
- **Example:** A purely event-driven design can't react to the *absence* of an event — that's exactly the gap our 60-second sweep closes.
- **Message:** "Nothing happened, and that's the problem" is the exact premise this whole system is built around — silence is never assumed safe.

**Judge: "What happens if the AI is down, rate-limited, or just wrong?"**

- **Answer:** The coordinator still sees everything real.
- **Reason:** A deterministic Figure Checker validates every claim before we deliver it; if it fails twice, we show the real underlying data plainly instead of an unverified narrative.
- **Example:** We confirmed this live, not just in theory — this path fired repeatedly during development under genuine free-tier congestion and a provider's own malformed tool-call rejection.
- **Message:** It never once produced a wrong claim to a user.

**Judge: "Why doesn't the AI rank which puroks need help first?"**

- **Opinion:** We decided that call should never belong to the AI.
- **Reason:** It's structurally excluded — no code path can produce a ranked list, not just a prompt instruction telling it not to.
- **Example:** We built it this way specifically so it can't drift into ranking even if a future prompt change nudged it that direction.
- **Opinion (restated):** That decision stays with the human coordinator, permanently, by design.

**Judge: "Isn't showing 'unknown' a weaker demo than confidently saying a purok is 'probably fine'?"**

- **Point:** We think it's actually the opposite.
- **Reason:** A system that guesses optimistically about silence is one that shouldn't be trusted in an actual emergency.
- **Example:** We chose to show "unknown" over silence rather than assume the best — that's rule one of our honesty rules, `ARCHITECTURE.md` §8.
- **Point (restated):** So no, it's not weaker — it's the entire credibility of the system.

**Judge: "Does this solve relief logistics too — trucks, supply, road access?"**

- **Answer:** No, deliberately.
- **Reason:** Tingog's scope is collapsing *information* latency specifically; logistics capacity is a separate, real constraint independent of how fast information travels.
- **Example:** We tested this boundary twice, not just assumed it. An Access-status specialist (road/bridge passability) and a field-confirmation step (a headcount logged on-site) were both built or seriously proposed, then explicitly rejected — both would have quietly recreated the slow manual-verification process this whole project exists to bypass. We went further and considered a full distribution-management system too — inventory, routing, allocation — and archived that as well, for the same reason: it's a genuinely different, much bigger software problem, and building it would reverse the exact boundary we're defending.
- **Message:** What we built instead is much smaller — a delivery-record feature that lets a coordinator log that a specific item actually reached a purok. That closes the loop on our own information system; it doesn't manage physical distribution. Worth raising this unprompted if logistics comes up — it shows the boundary was tested, not assumed.

**Judge: "Okay — but can you at least tell if relief was actually delivered, or just that a need was reported?"**

- **Answer:** Yes, as of this build.
- **Reason:** A LUWAS press was our only self-report signal, and it's all-or-nothing — it means "we're fine now," but it doesn't say which specific requested item actually got addressed.
- **Example:** A coordinator now logs a delivery directly against a purok — a real, human-confirmed record, not the device guessing. We clear only that specific need, not everything at once, and we track presses and deliveries on the same timeline, so a need pressed again after a delivery correctly stays active instead of being silently swallowed by an earlier delivery.
- **Message:** This deliberately stops short of the distribution-management system we archived above — no inventory, no routing, no allocation. It's a confirmation log, not logistics software.

## Part 2 — Likely questions we haven't rehearsed yet

### Resilience & abuse

**Judge: "What stops someone from pressing buttons falsely, or maliciously flooding the system with panic-presses?"**

- **Answer:** Honestly — nothing, technically.
- **Reason:** That's the direct cost of the same low-friction design that makes the device usable under real stress — no login, no identity, no rate-limit on who can press it.
- **Example:** The only real mitigation we have is social, not technical — a fixed, visible, shared community location makes anonymous abuse harder than a purely digital channel would, but that's a physical-world deterrent, not an engineered one.
- **Message:** We'd rather say that plainly than claim a protection that doesn't exist.

**Judge: "What if the laptop running the backend crashes or loses power mid-disaster?"**

- **Answer:** Our data survives.
- **Reason:** SQLite persists to disk, not memory, and our ingestion poller recovers its position from the database on restart instead of assuming a fresh start — a real fix we made during development specifically for this scenario.
- **Example:** What's lost is only in-flight state, like a briefing mid-generation, which just regenerates. Separately, if the ESP32 device itself loses power before we've polled its buffered events, those specific events are lost — an accepted demo-week limitation we haven't solved.
- **Message:** Worth naming both halves honestly, not just the reassuring one.

**Judge: "What about alert fatigue — if escalations fire too often, do real alerts start getting ignored?"**

- **Opinion:** We think this is a real, open risk, not a solved problem.
- **Reason:** Our panic-press and severity thresholds are tunable constants, not empirically validated numbers — we calibrated them by reasoning about the rules, because no field data exists yet.
- **Example:** We haven't run this against real deployment behavior, so we genuinely don't know how it holds up.
- **Opinion (restated):** This needs real tuning before we'd trust it, and we're not pretending otherwise.

### Fielded deployment

**Judge: "The fielded device needs solar charging and a weatherproof enclosure — has that been tested under real disaster conditions?"**

- **Answer:** No, and we want to name that as a real engineering risk, not a solved detail.
- **Reason:** A typhoon is exactly the scenario with extended cloud cover reducing solar charging at the exact moment the device is needed most.
- **Example:** This week's build is USB-powered on a table — solar and battery survivability under real weather is genuinely untested.
- **Message:** We're not presenting it as more mature than it is.

**Judge: "Who physically repairs or replaces a broken device in the field?"**

- **Answer:** Same open gap as our stewardship answer.
- **Reason:** A named accountable party — the purok leader — is the honest answer in principle.
- **Example:** But we haven't designed anything about the actual repair or replacement process itself.
- **Message:** Worth connecting this back to the hardware-custody question if it comes up as the natural follow-up.

### AI trust & accuracy

**Judge: "How do you ensure your AI outputs factual, not false, information — how do you prevent AI hallucination?"**

- **Point:** We don't trust the model to be accurate — we mechanically verify it, with real deterministic code, before anything reaches a coordinator.
- **Reason:** An LLM asked to summarize data can still state a wrong number with total confidence. The common fix — having a second AI call "check" the first — doesn't actually solve this: a system that hallucinates can just as easily hallucinate agreement with its own mistake.
- **Example:** Every specific claim the model makes must cite exactly which real tool result it came from. Our Figure Checker — plain Python, not another AI call — walks that citation back to the actual data and confirms it matches, and separately confirms every number in the written narrative traces back to a cited claim, not just one that sounds plausible. If a claim doesn't check out, we retry once, telling the model precisely what was wrong. If it still doesn't check out, we show the coordinator the real underlying data directly — no AI-generated text at all — rather than ever displaying an unverified claim.
- **Point (restated):** This isn't a policy we're asking the model to follow — it's arithmetic checking its work, so the system is structurally incapable of quietly showing something false.

Worth adding if pressed further: this was hardened through genuine live testing, not just designed on paper — real edge cases (a claim citing a number under an unexpected field name, a model rounding a precise figure to a whole number) were found and fixed specifically because the checker kept catching them, which is itself evidence it works, not just a claim that it should.

**Judge: "How can you say your system is agentic — aren't you just using it as a buzzword?"**

- **Point:** No — "agentic" describes one specific, narrow part of our system, and we can point to exactly the code that makes it true.
- **Reason:** The real test of "agentic" is whether the model itself decides which actions to take and in what order, versus a developer hardcoding a fixed sequence. Our on-demand briefing layer does the former: given a question, the model chooses which of our seven read-only tools to call, how many times, and in what order, up to a bounded six iterations, and decides for itself when it has enough information to answer.
- **Example:** Ask "what's the current situation?" versus "is Purok 4 okay?" and the tool-call trace genuinely differs — different tools, different counts, different order — because the model is making that call live, not because we wrote two separate code paths for two different questions. We can show this literally, live, in the streaming step trace as it happens.
- **Point (restated):** And we're precise about where the word stops applying, which is itself evidence we're not overusing it — severity scoring, clustering, and escalation are all explicitly deterministic, no AI involved at all (see "why is severity scoring deterministic" above). If we were reaching for "agentic" as a buzzword, we'd be tempted to slap it on those too. We don't.

Worth adding if pressed further: this isn't the open-ended, self-directed kind of "agentic" either — no internet access, no code execution, no ability to set its own goals, a hard cap of six tool-call iterations, and every output still passes through the same deterministic Figure Checker before a coordinator ever sees it. We're claiming a bounded, tool-using agent, not an autonomous one — and we'd rather defend that precise, smaller claim than an impressive-sounding bigger one that doesn't hold up.

### Software architecture

**Judge: "Why isn't this deployed somewhere public — why are we looking at localhost?"**

- **Point:** The backend stays local deliberately — it's reading a real ESP32 gateway over a physical USB serial port on this laptop, and that's not something a cloud server can have.
- **Reason:** Deploying the backend elsewhere would sever it from the actual hardware; a cloud-hosted version could only ever show simulated presses, never the real pipeline we're demonstrating tonight.
- **Example:** The frontend alone is trivially deployable — a static build, live on Vercel or Netlify in minutes. It's specifically the backend's real-time serial connection to physical buttons that ties it to this machine.
- **Point (restated):** We chose to keep the demo tied to something real over something that merely looked more finished — deployment itself isn't the hard problem here; real barangay-scale hardware rollout is (§10).

Worth knowing if pressed further: the backend could be exposed through a tunnel (e.g. ngrok) to get a real public URL while keeping the real hardware connection intact — a fast option we simply didn't need tonight, not a gap we couldn't close.

### Ethics & equity

**Judge: "Does instrumenting some puroks and not others create a two-tier response — do instrumented communities get helped faster while others fall further behind?"**

- **Opinion:** We think this is a real tension worth naming directly, not deflecting.
- **Reason:** Our no-ranking constraint helps structurally — the system never tells a coordinator to prioritize an instrumented purok over an uninstrumented one — but it can't stop a human coordinator from psychologically over-weighting what's visible on a live dashboard versus what isn't being reported at all.
- **Example:** That's a genuine risk of any signal-augmentation system, not something unique to Tingog.
- **Opinion (restated):** We're treating this as an open concern, not something our architecture fully neutralizes.

**Judge: "What personal data does this system collect — any privacy concern?"**

- **Answer:** Genuinely minimal.
- **Reason:** No individual is identified by a press — there's no login, no name, no household tied to any event.
- **Example:** This is a real, non-obvious upside of the same per-purok (not per-person) design that costs us headcount precision — the tradeoff that hurts scale-of-need is the same one that keeps us close to privacy-neutral by construction.
- **Message:** Worth volunteering this if privacy comes up, since it follows directly from a design choice we're already defending for other reasons.

### Comparison & cost

**Judge: "How is this different from existing disaster-reporting channels — DSWD's own systems, SMS hotlines, social-media-based crowdsourced reporting?"**

- **Answer:** We're flagging this honestly rather than guessing — this needs our own research before the pitch, not a fabricated comparison.
- **Reason:** We haven't done that comparison yet.
- **Example:** One point we are confident stating: this isn't "just use SMS/Messenger" — normal telecom infrastructure being down is the explicit premise the whole system is built around, and a channel that assumes working cell towers doesn't solve the problem we're targeting.
- **Message:** Beyond that one point, we won't improvise a comparison live.

**Judge: "What does a device actually cost to build and deploy at scale, and who pays for it?"**

- **Answer:** We won't state a specific dollar figure.
- **Reason:** We haven't done real component sourcing — only a rough relative multiplier (per-household vs. per-purok), which holds up as a *ratio*, not as an absolute number.
- **Example:** Deployment funding — LGU budget, DSWD partnership, NGO grant — is a business question, not a technical one.
- **Message:** We'd rather flag that honestly than improvise an answer on stage.

### Team & roadmap

**Judge: "What would you build next with more time?"**

- **Opinion:** We're genuinely well-prepared for this one.
- **Reason:** We've already explored and explicitly deferred a specific set of next steps, not a vague wishlist.
- **Example:** A real fix for scale-of-need (a passive motion/approach sensor was our most promising hardware idea, not yet built), real purok-level coordinates from the teammate who lived through the San Remigio earthquake, the automatic device heartbeat that would close the LUWAS honesty gap, role-based dashboard authentication, weatherproofing/solar validation, and — only once real data sources exist — reconsidering Access/Verification-style specialist agents.
- **Opinion (restated):** Every item on that list traces back to a limitation we already named ourselves, not one a judge would have to point out to us first.

**Judge: "Who on the team actually built what?"**

- **Answer:** This is team-specific, and we won't let it get answered by guessing from repo history.
- **Message:** Worth the team aligning on this directly rather than improvising it under pressure.
