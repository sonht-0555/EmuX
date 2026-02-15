# EmuX Relay Server (Go)

This is a high-performance WebSocket relay server designed to replace PeerJS for EmuX netplay.

## How it works

1. Each client connects with a unique ID: `ws://your-app.fly.dev/ws?id=ABCD`
2. Messages are forwarded based on the `target` field.
3. Bypasses P2P issues (NAT/Firewalls/4G) by relaying all traffic through Fly.io.

## Deployment to Fly.io

1. Install `flyctl` if you haven't (https://fly.io/docs/hands-on/install-flyctl/)
2. Open terminal in this folder:
   ```bash
   cd server
   fly launch
   ```
3. Choose a region near Vietnam (e.g., `hkg` - Hong Kong or `sin` - Singapore) for lowest latency.
4. After deployment, get your app URL (e.g., `emux-relay.fly.dev`).

## Testing

1. Update `test-2.html` with your new URL:
   ```javascript
   const RELAY_URL = "wss://your-app.fly.dev/ws";
   ```
2. Open `test-2.html` on two different devices/networks.
3. Enter the other device's ID and click CONNECT / SEND PING.
