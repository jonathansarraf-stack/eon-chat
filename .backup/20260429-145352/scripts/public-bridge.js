'use strict';

const http = require('http');

const host = process.env.PUBLIC_BRIDGE_HOST || '0.0.0.0';
const port = Number(process.env.PUBLIC_BRIDGE_PORT || 3888);
const upstreamHost = process.env.PUBLIC_BRIDGE_UPSTREAM_HOST || '127.0.0.1';
const upstreamPort = Number(process.env.PUBLIC_BRIDGE_UPSTREAM_PORT || 4080);

const server = http.createServer((req, res) => {
  const proxyReq = http.request({
    host: upstreamHost,
    port: upstreamPort,
    method: req.method,
    path: req.url,
    headers: {
      ...req.headers,
      host: req.headers.host || `127.0.0.1:${upstreamPort}`,
      connection: req.headers.connection || 'keep-alive'
    }
  }, (proxyRes) => {
    res.writeHead(proxyRes.statusCode || 502, proxyRes.headers);
    proxyRes.pipe(res);
  });

  proxyReq.on('error', (error) => {
    res.writeHead(502, { 'content-type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({
      error: 'public_bridge_upstream_error',
      message: error.message
    }));
  });

  req.pipe(proxyReq);
});

server.listen(port, host, () => {
  console.log(`[public-bridge] listening on http://${host}:${port} -> http://${upstreamHost}:${upstreamPort}`);
});
