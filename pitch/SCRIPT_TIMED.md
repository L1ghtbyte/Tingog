# Tingog — Spoken Script

Total ~6:48 of 7:00.

---

### 0:00 — Opening

We believe that in a disaster, every community deserves to be heard — not eventually. Immediately.

---

### 0:05 — The Problem

Imagine a major disaster hits your barangay. Communication is unreliable, sometimes gone completely.

People need water, food, medicine, help.

Here's the real problem: even when a community does get word out, it still goes through the normal process — a health worker has to physically go out and survey the damage before anything moves. By the time that reaches whoever decides where help goes, the situation's already changed.

So the question isn't just can a community be heard.

It's whether they're heard **in time** to still matter.

---

### 0:35 — Meet Tingog

That's the problem we wanted to solve.

Our idea was simple: a purok's status should not depend on a person reaching it.

We are L1ghtbyte, and this is Tingog.

Tingog is Bisaya for voice.

And that's exactly what we want to give every purok — a voice when normal communication fails.

---

### 0:55 — Four Steps

Tingog works in four simple steps:

Report — a resident presses a physical button.

Transmit — the signal reaches a base device wirelessly, which relays it into our system.

Understand — our system works out what's needed, how urgent it is, whether a purok's gone quiet, and whether the same need is showing up elsewhere.

Respond — the coordinator sees the real situation on the dashboard and can act on it.

Let me show you how that works.

---

### 1:25 — Demo: The Report

Let's say a typhoon just hit, and someone in this community urgently needs medicine.

I simply press: TAMBAL.

That's it. The ESP32 inside receives the press, and sends it — not through the internet, but directly over ESP-NOW — to our gateway.

This is the gateway. It picks up the signal and passes it to our laptop.

And now —

There it is. A medicine need, reported.

No survey. No one had to reach us first.

The coordinator knows — immediately.

---

### 2:25 — Demo: Clustering

But one report is only the beginning.

Purok 1 and Purok 2 have already been reporting TUBIG. Let's make it three.

Now the coordinator isn't looking at three separate, isolated presses. Tingog recognizes multiple communities reporting the same need, close together in time — and draws the connection automatically.

That's not a coincidence. That might be a wider water problem.

This is where Tingog moves beyond collecting reports. It turns local signals into situational awareness.

---

### 3:05 — Demo: Silence

And there's another problem during disasters: silence.

Look at Purok 4. Its last signal was fourteen hours ago — someone holding down the help button. Nothing since.

A system that assumes silence means safety would call this "fine." Tingog doesn't. It's marked unknown — because we genuinely don't know, and guessing wrong here could mean nobody checks on them at all.

Unknown is uncomfortable. But it's more honest than a false "all clear."

---

### 3:35 — The AI

One more thing — let's ask Tingog to make sense of all of this.

It told us something like: a medicine need was reported, three puroks are reporting water, and Purok 4 hasn't been heard from in fourteen hours.

Here's what that actually involved — and this is the part worth being precise about. This isn't one API call that returns text. It's agentic tool-calling: the model reasons about what it actually needs, and decides for itself which of several tools to call — check who hasn't reported in, check who's at the highest severity, look for clusters forming, even recall what it told a coordinator last time — then reads what comes back, and decides whether it needs to look at more before it answers, or ask a clarifying question instead.

And the cluster, the silence alert — none of that waited for any of this. That's deliberate: a safety-critical alert can't depend on an API call succeeding, so the moment something's genuinely urgent, we don't even touch AI.

Every claim it does make gets checked against real records first — not by asking another AI to check itself, which can still hallucinate agreement with its own mistake, but by actual code.

It can summarize. It doesn't decide. That's still the coordinator's call.

---

### 5:05 — Why Not an App

You might be wondering — why not just an app?

Because an app assumes exactly what a disaster takes away: charged phones, a cell signal, one device per person — and days into a blackout, none of that holds.

Tingog doesn't need any of it. One physical device covers an entire purok — a shared point, not something each household has to individually own, install, and keep charged. It talks directly to our gateway. No cell tower. No internet. No account.

That's not a smaller version of an app. It's built for the actual conditions a disaster leaves behind.

---

### 5:45 — Scale

This isn't locked to one purok. The same gateway can already listen to many purok devices at once — what you saw tonight is one small barangay's worth, not the ceiling.

And Tingog isn't meant to replace the people already responsible for this — barangay officials, DRRMO, BHWs. It's meant to give them a faster, more honest picture than they've had, using hardware cheap enough to put in every purok.

Right now, each purok device reaches the gateway over ESP-NOW — a direct, low-power mesh, no cell tower or internet needed. Our planned upgrade path is LoRa: same idea, trading some speed for real distance — kilometers instead of hundreds of meters, as we scale to full barangay coverage.

---

### 6:33 — Closing

A disaster can take the power, the roads, the signal.

It doesn't get to take your voice too.

This is Tingog. When a signal dies, your voice doesn't.

Thank you.
