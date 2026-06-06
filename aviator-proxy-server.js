/**
 * ═══════════════════════════════════════════════
 *  AVIATOR GURU — WebSocket Proxy Server
 *  Connects to Spribe Aviator real server
 *  Deploy on Railway.app / Render.com / any VPS
 * ═══════════════════════════════════════════════
 */

const WebSocket = require('ws');
const http      = require('http');

const PORT           = process.env.PORT || 3000;
const SPRIBE_WS_URL  = 'wss://game5.apac.spribegaming.com/BlueBox/websocket';

// ── HTTP server (required for Railway health check) ──
const server = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
        status  : 'Aviator Guru Proxy Running',
        clients : wss ? wss.clients.size : 0,
        uptime  : Math.floor(process.uptime()) + 's'
    }));
});

// ── WebSocket Server (for your app to connect) ──
const wss = new WebSocket.Server({ server });

console.log(`[PROXY] Starting Aviator Guru Proxy Server on port ${PORT}`);

wss.on('connection', function(clientWs, req) {
    const clientIp = req.socket.remoteAddress;
    console.log(`[CLIENT] Connected: ${clientIp}`);

    // ── Connect to real Spribe server ──
    const spribeWs = new WebSocket(SPRIBE_WS_URL, {
        headers: {
            'Origin'     : 'https://aviator-next.spribegaming.com',
            'User-Agent' : 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36',
        }
    });

    spribeWs.on('open', function() {
        console.log('[SPRIBE] Connected to real Aviator server');
        // Notify app that proxy is connected
        if (clientWs.readyState === WebSocket.OPEN) {
            clientWs.send(JSON.stringify({
                type   : 'proxy_status',
                status : 'connected',
                server : SPRIBE_WS_URL
            }));
        }
    });

    // ── Forward Spribe data → App ──
    spribeWs.on('message', function(data) {
        try {
            var raw = data.toString();
            var parsed = JSON.parse(raw);

            // Extract round result (multiplier/coefficient)
            var mult = extractMultiplier(parsed);

            if (mult) {
                // Send clean round data to app
                var roundData = {
                    type        : 'round_result',
                    coefficient : mult,
                    multiplier  : mult,
                    raw         : parsed
                };
                if (clientWs.readyState === WebSocket.OPEN) {
                    clientWs.send(JSON.stringify(roundData));
                }
                console.log(`[ROUND] Result: ${mult}x`);
            } else {
                // Forward all other messages too
                if (clientWs.readyState === WebSocket.OPEN) {
                    clientWs.send(raw);
                }
            }
        } catch(e) {
            // Forward raw if not JSON
            if (clientWs.readyState === WebSocket.OPEN) {
                clientWs.send(data.toString());
            }
        }
    });

    spribeWs.on('error', function(err) {
        console.error('[SPRIBE] Error:', err.message);
        if (clientWs.readyState === WebSocket.OPEN) {
            clientWs.send(JSON.stringify({
                type    : 'proxy_error',
                message : err.message
            }));
        }
    });

    spribeWs.on('close', function(code, reason) {
        console.log(`[SPRIBE] Disconnected: ${code} ${reason}`);
        // Auto reconnect after 3s
        setTimeout(function() {
            console.log('[SPRIBE] Reconnecting...');
        }, 3000);
        if (clientWs.readyState === WebSocket.OPEN) {
            clientWs.send(JSON.stringify({
                type : 'proxy_status',
                status: 'reconnecting'
            }));
        }
    });

    // ── Forward app messages → Spribe (auth token etc) ──
    clientWs.on('message', function(data) {
        try {
            var msg = JSON.parse(data.toString());
            // If app sends auth token, forward to Spribe
            if (spribeWs.readyState === WebSocket.OPEN) {
                spribeWs.send(data.toString());
                console.log('[AUTH] Forwarded auth to Spribe:', data.toString().substring(0,80));
            }
        } catch(e) {}
    });

    clientWs.on('close', function() {
        console.log(`[CLIENT] Disconnected: ${clientIp}`);
        if (spribeWs.readyState === WebSocket.OPEN) {
            spribeWs.close();
        }
    });

    clientWs.on('error', function(err) {
        console.error('[CLIENT] Error:', err.message);
    });
});

// ── Extract multiplier from various Spribe message formats ──
function extractMultiplier(data) {
    if (!data || typeof data !== 'object') return null;

    // Common Spribe field names
    var fields = ['coefficient', 'multiplier', 'crash_point',
                  'result', 'value', 'x', 'payout', 'rate', 'bust'];

    for (var i = 0; i < fields.length; i++) {
        if (data[fields[i]] !== undefined) {
            var v = parseFloat(data[fields[i]]);
            if (!isNaN(v) && v > 1) return v;
        }
    }

    // Check nested objects
    if (data.data)   return extractMultiplier(data.data);
    if (data.round)  return extractMultiplier(data.round);
    if (data.result) return extractMultiplier(data.result);
    if (data.game)   return extractMultiplier(data.game);

    return null;
}

server.listen(PORT, function() {
    console.log(`[PROXY] ✅ Server running on port ${PORT}`);
    console.log(`[PROXY] App connect URL: wss://YOUR-RAILWAY-URL/`);
});
