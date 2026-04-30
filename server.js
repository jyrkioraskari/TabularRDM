import { createReadStream } from 'node:fs';
import { readFile, stat } from 'node:fs/promises';
import { createServer } from 'node:http';
import { extname, join, normalize, resolve } from 'node:path';

const port = Number(process.env.PORT) || 4173;
const distDir = resolve('dist');
const qudtOrigin = 'https://qudt.org';

const contentTypes = new Map([
  ['.css', 'text/css; charset=utf-8'],
  ['.html', 'text/html; charset=utf-8'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.png', 'image/png'],
  ['.svg', 'image/svg+xml'],
  ['.ttl', 'text/turtle; charset=utf-8'],
]);

function send(response, statusCode, body, headers = {}) {
  response.writeHead(statusCode, headers);
  response.end(body);
}

function getStaticPath(requestPath) {
  const decodedPath = decodeURIComponent(requestPath.split('?')[0]);
  const normalizedPath = normalize(decodedPath).replace(/^(\.\.[/\\])+/, '');
  const relativePath = normalizedPath === '/' ? '/index.html' : normalizedPath;
  const filePath = join(distDir, relativePath);

  if (!filePath.startsWith(distDir)) {
    return null;
  }

  return filePath;
}

async function proxyQudt(request, response) {
  const targetPath = request.url.replace(/^\/qudt/, '') || '/';
  const targetUrl = new URL(targetPath, qudtOrigin);
  const upstreamResponse = await fetch(targetUrl, {
    headers: {
      Accept: request.headers.accept || 'text/turtle, */*;q=0.1',
    },
  });
  const headers = Object.fromEntries(upstreamResponse.headers.entries());

  delete headers['content-encoding'];
  delete headers['content-length'];
  headers['access-control-allow-origin'] = '*';

  response.writeHead(upstreamResponse.status, headers);

  if (upstreamResponse.body) {
    for await (const chunk of upstreamResponse.body) {
      response.write(chunk);
    }
  }

  response.end();
}

async function serveStatic(request, response) {
  const filePath = getStaticPath(request.url);

  if (!filePath) {
    send(response, 403, 'Forbidden');
    return;
  }

  try {
    const fileStat = await stat(filePath);

    if (!fileStat.isFile()) {
      throw new Error('Not a file.');
    }

    response.writeHead(200, {
      'Content-Type': contentTypes.get(extname(filePath)) || 'application/octet-stream',
    });
    createReadStream(filePath).pipe(response);
  } catch {
    const indexHtml = await readFile(join(distDir, 'index.html'));

    response.writeHead(200, {
      'Content-Type': 'text/html; charset=utf-8',
    });
    response.end(indexHtml);
  }
}

const server = createServer(async (request, response) => {
  try {
    if (request.url.startsWith('/qudt')) {
      await proxyQudt(request, response);
      return;
    }

    await serveStatic(request, response);
  } catch (error) {
    send(response, 502, error?.message || 'Proxy request failed.');
  }
});

server.listen(port, () => {
  console.log(`TabulatRDM server listening on http://localhost:${port}`);
});
