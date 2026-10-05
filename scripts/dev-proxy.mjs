import http from "http";

const TARGET_PORT = 3000;
const PROXY_PORT = 3001;

const server = http.createServer((req, res) => {
  const options = {
    hostname: "127.0.0.1",
    port: TARGET_PORT,
    path: req.url,
    method: req.method,
    headers: req.headers,
  };

  req.on("error", (err) => {
    // Client aborted or socket error
    proxyReq.destroy();
  });

  res.on("error", (err) => {
    // Client aborted during response
    proxyReq.destroy();
  });

  const proxyReq = http.request(options, (proxyRes) => {
    proxyRes.on("error", (err) => {
      res.destroy();
    });
    res.writeHead(proxyRes.statusCode || 200, proxyRes.headers);
    proxyRes.pipe(res, { end: true });
  });

  proxyReq.on("error", (err) => {
    if (!res.headersSent) {
      res.writeHead(502, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          error: `Proxy error forwarding to port ${TARGET_PORT}: ${err.message}`,
        })
      );
    }
  });

  req.pipe(proxyReq, { end: true });
});

// Support WebSockets / HMR upgrade
server.on("upgrade", (req, socket, head) => {
  socket.on("error", (err) => {
    // Ignored harmless disconnects like ECONNRESET, ECONNABORTED
  });

  const proxyReq = http.request({
    hostname: "127.0.0.1",
    port: TARGET_PORT,
    path: req.url,
    method: req.method,
    headers: req.headers,
  });

  proxyReq.on("error", (err) => {
    socket.destroy();
  });

  proxyReq.on("upgrade", (proxyRes, proxySocket, proxyHead) => {
    proxySocket.on("error", (err) => {
      socket.destroy();
    });
    socket.on("error", (err) => {
      proxySocket.destroy();
    });

    socket.write(
      `HTTP/${proxyRes.httpVersion} ${proxyRes.statusCode} ${proxyRes.statusMessage}\r\n` +
        Object.entries(proxyRes.headers)
          .map(([k, v]) => `${k}: ${v}`)
          .join("\r\n") +
        "\r\n\r\n"
    );
    if (proxyHead && proxyHead.length) {
      proxySocket.unshift(proxyHead);
    }
    proxySocket.pipe(socket);
    socket.pipe(proxySocket);
  });

  proxyReq.end();
});

server.on("clientError", (err, socket) => {
  socket.destroy();
});

process.on("uncaughtException", (err) => {
  if (err.code === "ECONNRESET" || err.code === "ECONNABORTED" || err.code === "EPIPE") {
    // Common network disconnection errors, do not crash proxy
    return;
  }
  console.error("[Proxy UncaughtException]", err);
});

server.listen(PROXY_PORT, () => {
  console.log(`[Proxy] Listening on http://localhost:${PROXY_PORT} -> http://localhost:${TARGET_PORT}`);
});
