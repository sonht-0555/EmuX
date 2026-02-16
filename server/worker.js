export default {
    async fetch(request, env) {
        const upgradeHeader = request.headers.get('Upgrade');
        if (!upgradeHeader || upgradeHeader !== 'websocket') {
            return new Response('EmuX Worker Relay Active', {status: 200});
        }

        const id = new URL(request.url).searchParams.get('id');
        if (!id) return new Response('Missing ID', {status: 400});

        // Sử dụng một Durable Object hoặc đơn giản là Broadcast Channel (nếu có DO)
        // Lưu ý: Worker tiêu chuẩn không chia sẻ bộ nhớ giữa các Isolate.
        // NHƯNG, chúng ta sẽ dùng Durable Objects để đảm bảo 100% kết nối thấy nhau.
        // Nếu bạn dùng bản Free, tôi sẽ dùng một mẹo nhỏ: kết nối chéo WebRTC Signaling.

        // Để đơn giản và MIỄN PHÍ hoàn toàn, tôi sẽ viết bản Signaling cho WebRTC 
        // giúp đục hầm P2P nhanh hơn thông qua Edge của Cloudflare.

        return new Response("Durable Objects required for pure relay. Use Fly.io for Relay or WebRTC for P2P.", {status: 400});
    }
};
