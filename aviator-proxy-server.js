/**
 * AVIATOR GURU — WebSocket Proxy Server
 * Connects to Spribe Aviator real server
 */

const WebSocket = require('ws');
const http      = require('http');

const PORT          = process.env.PORT || 8080;
const SPRIBE_WS_URL = 'wss://game5.apac.spribegaming.com/BlueBox/websocket';

const server = http.createServer((req, res) => {
    res.writeHead(200, {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
    });
    res.end(JSON.stringify({
        status : 'Aviator Guru Proxy Running',
        port   : PORT,
        uptime : Math.floor(process.uptime()) + 's'
    }));
});

const wss = new WebSocket.Server({ server });

console.log('[PROXY] Starting on port', PORT);

wss.on('connection', function(clientWs, req) {
    console.log('[CLIENT] App connected');

    const spribeWs = new WebSocket(SPRIBE_WS_URL, {
        headers: {
            'Origin'     : 'https://aviator-next.spribegaming.com',
            'User-Agent' : 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0 Safari/537.36',
            'Host'       : 'game5.apac.spribegaming.com',
        }
    });

    spribeWs.on('open', function() {
        console.log('[SPRIBE] Connected to real Aviator server!');
        safeSend(clientWs, {
            type: 'proxy_status', status: 'connected', server: SPRIBE_WS_URL
        });
    });

    spribeWs.on('message', function(data) {
        try {
            var raw    = data.toString();
            var parsed = JSON.parse(raw);
            var mult   = extractMultiplier(parsed);

            if (mult) {
                console.log('[ROUND]', mult + 'x');
                safeSend(clientWs, {
                    type: 'round_result', coefficient: mult, multiplier: mult, raw: parsed
                });
            } else {
                if (clientWs.readyState === WebSocket.OPEN) clientWs.send(raw);
            }
        } catch(e) {
            if (clientWs.readyState === WebSocket.OPEN) clientWs.send(data.toString());
        }
    });

    spribeWs.on('error', function(err) {
        console.error('[SPRIBE] Error:', err.message);
        safeSend(clientWs, { type: 'proxy_error', message: err.message });
    });

    spribeWs.on('close', function(code) {
        console.log('[SPRIBE] Closed:', code);
        safeSend(clientWs, { type: 'proxy_status', status: 'reconnecting' });
        setTimeout(function() {
            console.log('[SPRIBE] Reconnecting...');
        }, 3000);
    });

    clientWs.on('message', function(data) {
        if (spribeWs.readyState === WebSocket.OPEN) {
            spribeWs.send(data.toString());
        }
    });

    clientWs.on('close', function() {
        console.log('[CLIENT] App disconnected');
        if (spribeWs.readyState === WebSocket.OPEN) spribeWs.close();
    });

    clientWs.on('error', function(err) {
        console.error('[CLIENT] Error:', err.message);
    });
});

function safeSend(ws, obj) {
    if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(obj));
    }
}

function extractMultiplier(data) {
    if (!data || typeof data !== 'object') return null;
    var fields = ['coefficient','multiplier','crash_point','result','value','x','payout','rate','bust','odd'];
    for (var i = 0; i < fields.length; i++) {
        var v = parseFloat(data[fields[i]]);
        if (!isNaN(v) && v > 1) return v;
    }
    if (data.data)   return extractMultiplier(data.data);
    if (data.round)  return extractMultiplier(data.round);
    if (data.result) return extractMultiplier(data.result);
    if (data.game)   return extractMultiplier(data.game);
    return null;
}

server.listen(PORT, function() {
    console.log('[PROXY] ✅ Running on port', PORT);
});
