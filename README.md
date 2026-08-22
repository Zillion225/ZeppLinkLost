# Link Lost

Link Lost is a small utility app for Amazfit watches running Zepp OS. It monitors the connection between your watch and its paired phone and alerts you when that connection is lost.

## Features

- Background phone-connection monitoring
- Configurable disconnect delay: 10, 15, 30, or 60 seconds
- Watch notification when the phone remains disconnected
- Optional vibration alert
- Selectable alarm sound
- Configurable alarm auto-stop duration
- Reconnection notification after a previously reported disconnect
- Monitoring on/off control from the watch

## How it works

1. Open Link Lost on the watch.
2. Allow the required background-service permission.
3. Open Link Lost again after granting the permission.
4. Confirm that the app shows **Monitoring ON**.
5. Return to the watch face and use the watch normally.
6. If the paired phone connection is lost and remains disconnected longer than the selected delay, Link Lost shows a notification and can trigger vibration and an alarm sound.

The disconnect delay helps avoid alerts for very short connection interruptions.

## Settings

Link Lost currently provides the following watch-side settings:

- **Alert Delay** — 10s, 15s, 30s, or 60s
- **Alarm Auto-Stop** — 5s, 10s, 15s, or 30s
- **Alarm Sound** — selectable alert sound
- **Alarm Vibration** — on or off
- **Monitoring** — enable or disable connection monitoring

## Permissions

The app uses these Zepp OS permissions:

- `device:os.bg_service` — keep connection monitoring active in the background
- `device:os.notification` — show connection-loss and reconnection notifications
- `device:os.local_storage` — save app settings on the watch

## Zepp OS target

The current project targets Zepp OS API 4.0.

## Development

The project is structured around a Zepp OS Device App and App Service:

- `page/` — watch UI and settings
- `app-service/` — background connection monitoring
- `core/` — connection-alert and alarm logic
- `utils/` — settings and connection-state helpers
- `test/` — unit tests for core behavior

Run the automated tests with:

```bash
npm test
```

## Manual testing

Physical-watch testing is required for behavior that depends on the Amazfit device, Bluetooth state, background App Service lifecycle, vibration, alarm audio, and system notifications.

Important manual scenarios include:

- Fresh install, then normal disconnect
- Fresh install, then immediate disconnect
- Reconnect before the configured alert delay
- Disconnect while Link Lost is closed and the watch face is visible
- Permission denied behavior
- Watch reboot behavior
- Long-running background monitoring

## Store-review behavior

For review or manual verification, use this sequence:

1. Install Link Lost.
2. Open Link Lost on the watch.
3. Grant the requested background-service permission.
4. Open Link Lost again after the permission has been granted.
5. Verify that the main screen shows **Monitoring ON**.
6. Return to the watch face.
7. Disconnect the paired phone.
8. Wait for the configured disconnect delay.

If the watch remains disconnected, Link Lost should display the disconnect reminder and trigger the enabled alert effects.

## Status

Link Lost is under active development and validation for Zepp Store distribution.
