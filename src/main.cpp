// TANAW demo firmware — Wi-Fi AP + button gesture event buffer (no LoRa)
// PlatformIO: framework = arduino, board = esp32dev
//
// Button wiring: each normally-open button connects its assigned GPIO to GND.
// The pins below come from 01_hardware_firmware_spec.md. Check them against the
// actual board pinout before wiring: LoRa/OLED boards may reserve some pins.

#include <Arduino.h>
#include <LittleFS.h>
#include <WiFi.h>
#include <WebServer.h>

// ---------- Device and Wi-Fi configuration ----------
constexpr uint16_t DEVICE_ID = 1;
constexpr char AP_SSID[] = "TANAW-DEMO";
// The demo network is intentionally open. Do not use this configuration for a field deployment.

// ---------- Inputs and gesture timing ----------
constexpr uint8_t BUTTON_COUNT = 5;
constexpr uint8_t BUTTON_PINS[BUTTON_COUNT] = {4, 5, 18, 19, 21};
constexpr const char *BUTTON_NAMES[BUTTON_COUNT] = {
    "TABANG", "TUBIG", "TAMBAL", "PAGKAON", "LUWAS"};

constexpr uint32_t DEBOUNCE_MS = 50;
constexpr uint32_t DOUBLE_WINDOW_MS = 400;
constexpr uint32_t HOLD_MS = 2000;
constexpr uint32_t COMBO_WINDOW_MS = 150;

// 64 events is ample for a short demonstration. When full, the oldest event is overwritten.
constexpr uint8_t EVENT_BUFFER_SIZE = 64;

enum PressType : uint8_t
{
  SINGLE,
  HOLD,
  DOUBLE
};

struct ButtonState
{
  bool rawLast;
  bool stable; // true = released/HIGH, false = pressed/LOW
  bool partOfCombo;
  bool holdReported;
  uint8_t pendingClicks;
  uint32_t rawChangedAt;
  uint32_t pressedAt;
  uint32_t firstReleaseAt;
};

struct Event
{
  uint32_t seqNum;
  uint8_t buttonMask; // one bit for each button; two bits identify a combo
  PressType pressType;
  uint32_t timestampSeconds; // seconds since boot in this offline demo
};

ButtonState buttons[BUTTON_COUNT];
Event eventBuffer[EVENT_BUFFER_SIZE];
uint8_t eventStart = 0; // index of the oldest retained event
uint8_t eventCount = 0;
uint32_t nextSequence = 1;

WebServer server(80);

const char *pressTypeName(PressType type)
{
  switch (type)
  {
  case HOLD:
    return "hold";
  case DOUBLE:
    return "double";
  default:
    return "single";
  }
}

void appendEvent(uint8_t buttonMask, PressType pressType)
{
  const Event event = {
      nextSequence++, buttonMask, pressType, static_cast<uint32_t>(millis() / 1000UL)};

  uint8_t destination;
  if (eventCount < EVENT_BUFFER_SIZE)
  {
    destination = (eventStart + eventCount) % EVENT_BUFFER_SIZE;
    eventCount++;
  }
  else
  {
    // Explicit demo limitation: overwrite the oldest event when the RAM buffer fills.
    destination = eventStart;
    eventStart = (eventStart + 1) % EVENT_BUFFER_SIZE;
  }
  eventBuffer[destination] = event;

  Serial.printf("EVENT seq=%lu type=%s buttons=", static_cast<unsigned long>(event.seqNum),
                pressTypeName(pressType));
  for (uint8_t i = 0; i < BUTTON_COUNT; ++i)
  {
    if (buttonMask & (1U << i))
      Serial.printf("%s ", BUTTON_NAMES[i]);
  }
  Serial.printf("time=%lus\n", static_cast<unsigned long>(event.timestampSeconds));
}

void appendSingleButtonEvent(uint8_t buttonIndex, PressType pressType)
{
  appendEvent(1U << buttonIndex, pressType);
}

void appendComboEvent(uint8_t first, uint8_t second)
{
  appendEvent((1U << first) | (1U << second), SINGLE);
}

void sendEvents()
{
  uint32_t since = 0;
  if (server.hasArg("since"))
  {
    // Invalid or negative input safely behaves as a first poll.
    const long requested = server.arg("since").toInt();
    if (requested > 0)
      since = static_cast<uint32_t>(requested);
  }

  String body;
  body.reserve(256 + eventCount * 110);
  body += "{\"device_id\":";
  body += DEVICE_ID;
  body += ",\"events\":[";

  bool firstJsonEvent = true;
  for (uint8_t offset = 0; offset < eventCount; ++offset)
  {
    const Event &event = eventBuffer[(eventStart + offset) % EVENT_BUFFER_SIZE];
    if (event.seqNum <= since)
      continue;

    if (!firstJsonEvent)
      body += ',';
    firstJsonEvent = false;
    body += "{\"seq_num\":";
    body += event.seqNum;
    body += ",\"press_type\":\"";
    body += pressTypeName(event.pressType);
    body += "\",\"timestamp\":";
    body += event.timestampSeconds;

    // One bit = named button; multiple bits = COMBO plus its named buttons.
    if ((event.buttonMask & (event.buttonMask - 1U)) == 0)
    {
      for (uint8_t i = 0; i < BUTTON_COUNT; ++i)
      {
        if (event.buttonMask & (1U << i))
        {
          body += ",\"button\":\"";
          body += BUTTON_NAMES[i];
          body += '"';
          break;
        }
      }
    }
    else
    {
      body += ",\"button\":\"COMBO\",\"buttons\":[";
      bool firstButton = true;
      for (uint8_t i = 0; i < BUTTON_COUNT; ++i)
      {
        if (!(event.buttonMask & (1U << i)))
          continue;
        if (!firstButton)
          body += ',';
        firstButton = false;
        body += '"';
        body += BUTTON_NAMES[i];
        body += '"';
      }
      body += ']';
    }
    body += '}';
  }
  body += "]}";
  server.sendHeader("Cache-Control", "no-store");
  server.send(200, "application/json", body);
}

void sendRoot()
{
  File index = LittleFS.open("/index.html", "r");
  if (!index)
  {
    server.send(503, "text/plain", "Tingog web files are not installed. Upload the filesystem image first.");
    return;
  }
  server.sendHeader("Cache-Control", "no-store");
  server.streamFile(index, "text/html");
  index.close();
}

const char *contentTypeFor(const String &path)
{
  if (path.endsWith(".css"))
    return "text/css";
  if (path.endsWith(".js"))
    return "application/javascript";
  if (path.endsWith(".svg"))
    return "image/svg+xml";
  if (path.endsWith(".png"))
    return "image/png";
  if (path.endsWith(".json"))
    return "application/json";
  return "application/octet-stream";
}

// Serves the Vite production bundle copied from Tingog/frontend/dist into data/.
void sendStaticFile()
{
  String path = server.uri();
  if (path.indexOf("..") >= 0)
  {
    server.send(400, "application/json", "{\"error\":\"invalid path\"}");
    return;
  }

  File file = LittleFS.open(path, "r");
  if (!file)
  {
    server.send(404, "application/json", "{\"error\":\"not found\"}");
    return;
  }

  server.sendHeader("Cache-Control", "public, max-age=86400");
  server.streamFile(file, contentTypeFor(path));
  file.close();
}

void startWiFi()
{
  WiFi.mode(WIFI_AP);
  if (!WiFi.softAP(AP_SSID))
  {
    Serial.println("ERROR: Wi-Fi access point failed to start.");
    return;
  }
  Serial.printf("Wi-Fi AP: %s\n", AP_SSID);
  Serial.printf("Open Tingog at http://%s/\n", WiFi.softAPIP().toString().c_str());
  Serial.printf("Events API: http://%s/events?since=0\n", WiFi.softAPIP().toString().c_str());
}

void handleStablePress(uint8_t buttonIndex, uint32_t now)
{
  ButtonState &current = buttons[buttonIndex];

  // A pending first click has expired: commit it before this becomes a new press.
  if (current.pendingClicks == 1 && now - current.firstReleaseAt > DOUBLE_WINDOW_MS)
  {
    appendSingleButtonEvent(buttonIndex, SINGLE);
    current.pendingClicks = 0;
  }

  current.pressedAt = now;
  current.holdReported = false;
  current.partOfCombo = false;

  // This is the second button. A first button already down within 150 ms creates a combo.
  for (uint8_t other = 0; other < BUTTON_COUNT; ++other)
  {
    if (other == buttonIndex || buttons[other].stable != LOW || buttons[other].partOfCombo)
      continue;
    if (now - buttons[other].pressedAt <= COMBO_WINDOW_MS)
    {
      current.partOfCombo = true;
      buttons[other].partOfCombo = true;
      current.pendingClicks = 0;
      buttons[other].pendingClicks = 0;
      appendComboEvent(other, buttonIndex);
      break;
    }
  }
}

void handleStableRelease(uint8_t buttonIndex, uint32_t now)
{
  ButtonState &button = buttons[buttonIndex];
  if (button.partOfCombo)
  {
    // The combo was already recorded at the second press; a release adds no extra event.
    button.partOfCombo = false;
    return;
  }
  if (button.holdReported)
    return; // Hold is reported immediately at its 2-second threshold.

  if (button.pendingClicks == 0)
  {
    button.pendingClicks = 1;
    button.firstReleaseAt = now;
  }
  else if (now - button.firstReleaseAt <= DOUBLE_WINDOW_MS)
  {
    // The two releases are close enough to be one double press.
    button.pendingClicks = 0;
    appendSingleButtonEvent(buttonIndex, DOUBLE);
  }
  else
  {
    // The first tap was a single; this release starts a fresh possible single.
    appendSingleButtonEvent(buttonIndex, SINGLE);
    button.pendingClicks = 1;
    button.firstReleaseAt = now;
  }
}

void pollButtons()
{
  const uint32_t now = millis();
  for (uint8_t i = 0; i < BUTTON_COUNT; ++i)
  {
    ButtonState &button = buttons[i];
    const bool raw = digitalRead(BUTTON_PINS[i]);

    if (raw != button.rawLast)
    {
      button.rawLast = raw;
      button.rawChangedAt = now;
    }
    if (raw != button.stable && now - button.rawChangedAt >= DEBOUNCE_MS)
    {
      button.stable = raw;
      if (button.stable == LOW)
        handleStablePress(i, now);
      else
        handleStableRelease(i, now);
    }

    // A held button is reported as soon as the 2-second threshold is reached.
    if (button.stable == LOW && !button.partOfCombo && !button.holdReported &&
        now - button.pressedAt >= HOLD_MS)
    {
      button.holdReported = true;
      button.pendingClicks = 0;
      appendSingleButtonEvent(i, HOLD);
    }

    // A short release becomes a single once the double-click window expires.
    if (button.pendingClicks == 1 && button.stable == HIGH &&
        now - button.firstReleaseAt > DOUBLE_WINDOW_MS)
    {
      button.pendingClicks = 0;
      appendSingleButtonEvent(i, SINGLE);
    }
  }
}

void setup()
{
  Serial.begin(115200);
  delay(200); // gives the serial monitor time to attach after reset
  Serial.println("\nTANAW demo booting (Wi-Fi only; LoRa is disabled).");

  for (uint8_t i = 0; i < BUTTON_COUNT; ++i)
  {
    pinMode(BUTTON_PINS[i], INPUT_PULLUP);
    const bool state = digitalRead(BUTTON_PINS[i]);
    buttons[i] = {state, state, false, false, 0, millis(), 0, 0};
  }

  startWiFi();
  if (!LittleFS.begin(true))
  {
    Serial.println("ERROR: LittleFS could not be mounted. Upload the filesystem image.");
  }
  server.on("/", HTTP_GET, sendRoot);
  server.on("/events", HTTP_GET, sendEvents);
  server.onNotFound(sendStaticFile);
  server.begin();
  Serial.println("HTTP server ready.");
}

void loop()
{
  pollButtons();
  server.handleClient();
}
