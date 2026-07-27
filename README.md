# AES67 Node web interface

This directory contains the stateful React frontend served by the Zephyr
firmware. Vite and `vite-plugin-singlefile` bundle the application, styles and
icons into one `src/web/index.html`. CMake then gzip-compresses that file into
the byte array included by `webapi_core.c`.

## Development

```sh
npm install
AES67_DEVICE_URL=http://<node-ip> npm run dev
```

The Vite development server proxies `/api` to the node. The browser therefore
uses the same resource-oriented REST API as the embedded production build.

Configured RX resources include the persistent discovery metadata `name`,
`sender_name` and `sender_ip`. A `PUT /api/streams/rx/{id}` may supply these
fields; when they are omitted, the firmware enriches them from a matching
currently discovered multicast flow.

## Production build

```sh
npm ci
npm run check
npm run build
```

When `node_modules` exists, the regular Zephyr build automatically rebuilds the
frontend before regenerating `src/index.html.gz.inc`. Without local npm
dependencies it uses the checked-in gzip include, so firmware-only builds do
not require Node.js or registry access.
