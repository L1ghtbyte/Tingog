# Tingog Firmware

ESP32 (Arduino C++). Owns: GPIO button reads, debounce/gesture classification, WiFi AP mode, and the `GET /events` HTTP endpoint the backend polls.

Owned by the hardware engineer (GPIO/wiring/gestures) and the integration engineer (WiFi AP + HTTP server + JSON event format), per the hardware/firmware spec shared with the team.

## Structure

Not yet built. Expected shape once started:

```
firmware/
  tingog_device/
    tingog_device.ino
```

Arduino IDE or PlatformIO, either is fine — pick whichever the hardware engineer already has set up.
