import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const coscineApiOrigin = 'https://coscine.rwth-aachen.de';

async function readRequestBody(request) {
  const chunks = [];

  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  return Buffer.concat(chunks);
}

function copyProxyHeaders(sourceHeaders) {
  const headers = {};

  for (const headerName of ['accept', 'authorization', 'content-type']) {
    if (sourceHeaders[headerName]) {
      headers[headerName] = sourceHeaders[headerName];
    }
  }

  return headers;
}

async function proxyCoscineRequest(request, response) {
  const targetPath = request.url.replace(/^\/coscine-api/, '/coscine/api/v2') || '/';
  const targetUrl = new URL(targetPath, coscineApiOrigin);
  const hasRequestBody = !['GET', 'HEAD'].includes(request.method);
  const requestBody = hasRequestBody ? await readRequestBody(request) : undefined;
  const headers = copyProxyHeaders(request.headers);

  if (requestBody) {
    headers['content-length'] = String(requestBody.byteLength);
  }

  try {
    const upstreamResponse = await fetch(targetUrl, {
      method: request.method,
      headers,
      body: requestBody,
    });
    const responseHeaders = Object.fromEntries(upstreamResponse.headers.entries());

    delete responseHeaders['content-encoding'];
    delete responseHeaders['content-length'];
    response.writeHead(upstreamResponse.status, responseHeaders);

    if (upstreamResponse.body) {
      for await (const chunk of upstreamResponse.body) {
        response.write(chunk);
      }
    }

    response.end();
  } catch (error) {
    console.error(
      `[coscine-api] ${request.method} ${targetUrl.pathname} failed: ${error?.message || error}`,
    );
    response.writeHead(502, { 'Content-Type': 'application/json; charset=utf-8' });
    response.end(
      JSON.stringify({
        message: 'Coscine proxy request failed.',
        detail: error?.message || String(error),
      }),
    );
  }
}

export default defineConfig({
  plugins: [
    react(),
    {
      name: 'coscine-api-proxy',
      configureServer(server) {
        server.middlewares.use(async (request, response, next) => {
          if (!request.url?.startsWith('/coscine-api')) {
            next();
            return;
          }

          await proxyCoscineRequest(request, response);
        });
      },
    },
  ],
  server: {
    proxy: {
      '/qudt': {
        target: 'https://qudt.org',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/qudt/, ''),
      },
    },
  },
});
