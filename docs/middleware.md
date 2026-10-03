# Optional middleware

By default, generated apps include only request logging, body parsing and static files (no static
files with `--api`). Add more with:

- `--helmet`: [helmet](https://helmetjs.github.io/) security headers
- `--compression`: gzip/brotli response [compression](https://github.com/expressjs/compression)
- `--cookies`: [cookie-parser](https://github.com/expressjs/cookie-parser), for reading `req.cookies`
- `--cors`: [cors](https://github.com/expressjs/cors), allowing requests from other origins. Any origin is
  allowed by default; set `CORS_ORIGIN` (see `.env.example`) to a comma-separated list of origins to
  allow only your front ends.
- `--rate-limit`: [express-rate-limit](https://express-rate-limit.mintlify.app/), limiting each client
  to 100 requests every 15 minutes, with `RateLimit` headers and `429 Too Many Requests` responses
  past the limit. Change the limit with `RATE_LIMIT_MAX` and `RATE_LIMIT_WINDOW_MS`. It comes after the
  static files, so only app routes count, and `/health` is never limited.
- `--session` (web apps only): [express-session](https://github.com/expressjs/session), for
  `req.session`. Set `SESSION_SECRET` to a long random string; the app refuses to start in production
  without one. The session cookie is `SameSite=Lax`, and `Secure` over HTTPS. Sessions are kept in
  memory, which loses them on restart and does not suit more than one process, so add a
  [store](https://github.com/expressjs/session#compatible-session-stores) such as `connect-redis`
  before going to production.
- `--csrf` (with `--session` and a view engine): [csrf-sync](https://github.com/Psifi-Solutions/csrf-sync)
  CSRF protection, set up in `csrf.js`. Requests other than `GET`, `HEAD` and `OPTIONS` need the
  session's token, or get `403 Forbidden`. Views get it as `csrfToken`, and the page layout has it in a
  `<meta name="csrf-token">` tag. An example form at `/users/new` shows it in use, with a
  `POST /users/new` that checks the name and redirects back. Send the token in a hidden `_csrf` form
  field:

  ```pug
  form(method='post', action='/users/new')
    input(type='hidden', name='_csrf', value=csrfToken)
  ```

  or, from JavaScript, in an `x-csrf-token` header:

  ```js
  const token = document.querySelector('meta[name="csrf-token"]').content;
  await fetch('/users/new', { method: 'POST', headers: { 'x-csrf-token': token }, body: new URLSearchParams({ name: 'Ada' }) });
  ```

- `--uploads`: [multer](https://github.com/expressjs/multer) and a `POST /uploads` route that takes one
  file in a `file` field, with a form at `GET /uploads` in apps with views (JSON APIs and `--no-view`
  apps respond with the saved file's details as JSON instead). See [File uploads](#file-uploads).

## Behind a proxy

`--rate-limit` and `--session` also make the app trust the `X-Forwarded-*` headers of the proxies set
in `TRUST_PROXY`, the number of proxies (such as `1` behind one load balancer) or their addresses.
Behind a proxy, set it so the rate limit counts each client rather than the proxy, and session
cookies are `Secure` when the proxy terminates HTTPS. Leave it unset otherwise, as clients could
then fake their address.

## File uploads

`--uploads` adds multer to the `/uploads` route only, rather than to every route, so no other route
accepts files. Its `routes/uploads.js`:

- saves files in `uploads/` under random names, never the name the client sent, and does not serve
  them as static files, where an uploaded HTML or SVG file could run scripts on your site. Both
  `.gitignore` and `.dockerignore` ignore the folder.
- accepts one file of up to 5 MB (set `UPLOAD_MAX_SIZE` in bytes to change it), responding with
  `413` for larger files and `400` for other upload errors.
- accepts only PDF, GIF, JPEG, PNG, WebP and plain text files, responding with `415` for others. Edit
  `TYPES` to change the list. The type is the one the client sends, so check a file's contents too
  before trusting it.

With `--csrf`, the CSRF check for the whole app skips `/uploads`, as multer reads the form, including
its `_csrf` field, only inside the route. The route checks the token itself as soon as the file
arrives, before saving anything, so the `_csrf` field must come before the file in the form, as it
does in the generated one. JavaScript can send the token in an `x-csrf-token` header instead.

With `--docker`, the image has an `uploads` folder the app can write to. Files saved in a container are
lost when it is replaced, so mount a volume at `/app/uploads`, or store files somewhere else, such as
object storage, in production.
