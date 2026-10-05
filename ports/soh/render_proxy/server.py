"""Chromebook front for the published site, for Render (or any host that runs Python).

Serves the public site (UPSTREAM) unchanged, except index.html gets ports/soh/chromebook.js
injected. Everything else (soh.js, soh.wasm, *.o2r) is streamed through, Range requests
included. Standard library only. No ROM, no copies of the game files are stored.

    UPSTREAM=https://andrewnakas.github.io/oot-cleanroom PORT=8080 python server.py
"""
import http.client
import os
import sys
import threading
import urllib.parse
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

HERE = os.path.dirname(os.path.abspath(__file__))
UPSTREAM = os.environ.get("UPSTREAM", "https://andrewnakas.github.io/oot-cleanroom").rstrip("/")
MARK = "/* cr-chromebook */"
CB_JS = open(os.path.join(HERE, "..", "chromebook.js"), encoding="utf-8").read()
HOP = {"connection", "keep-alive", "transfer-encoding", "te", "trailer", "upgrade",
       "proxy-authenticate", "proxy-authorization", "content-length", "content-encoding",
       "content-security-policy", "strict-transport-security", "set-cookie"}
U = urllib.parse.urlsplit(UPSTREAM)
_local = threading.local()


def conn():
    c = getattr(_local, "c", None)
    if c is None:
        cls = http.client.HTTPSConnection if U.scheme == "https" else http.client.HTTPConnection
        c = _local.c = cls(U.netloc, timeout=60)
    return c


def patch_html(b):
    s = b.decode("utf-8", "replace")
    if MARK in s or "</head>" not in s:
        return s.encode("utf-8")
    s = s.replace("</head>", "<script>" + MARK + "\n" + CB_JS + "</script></head>", 1)
    if '<meta name="viewport"' not in s:
        s = s.replace("<head>", '<head><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">', 1)
    return s.encode("utf-8")


class H(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"
    server_version = "cr-front"

    def log_message(self, fmt, *a):
        sys.stderr.write("%s %s\n" % (self.command, self.path))

    def do_HEAD(self):
        self.go(head=True)

    def do_GET(self):
        self.go()

    def go(self, head=False):
        if self.path == "/healthz":
            return self.out(200, [("Content-Type", "text/plain")], b"ok", head)
        path = self.path if self.path.startswith("/") else "/" + self.path
        path = path.split("#")[0]
        hdr = {"Accept-Encoding": "identity", "User-Agent": "cr-front"}
        for k in ("Range", "If-None-Match", "If-Modified-Since"):
            if self.headers.get(k):
                hdr[k] = self.headers[k]
        for attempt in (0, 1):
            try:
                c = conn()
                c.request("HEAD" if head else "GET", U.path + path, headers=hdr)
                r = c.getresponse()
                break
            except (http.client.HTTPException, OSError):
                _local.c = None
                if attempt:
                    return self.out(502, [("Content-Type", "text/plain")], b"upstream unreachable", head)
        heads = [(k, v) for k, v in r.getheaders() if k.lower() not in HOP]
        ctype = (r.getheader("Content-Type") or "").lower()
        is_index = r.status == 200 and "text/html" in ctype and path.split("?")[0].rstrip("/").split("/")[-1] in ("", "index.html")
        if is_index and not head:
            body = patch_html(r.read())
            heads = [(k, v) for k, v in heads if k.lower() not in ("etag", "last-modified", "cache-control")]
            heads.append(("Cache-Control", "no-cache"))
            return self.out(200, heads, body, False)
        length = r.getheader("Content-Length")
        self.send_response(r.status)
        for k, v in heads:
            self.send_header(k, v)
        if length is not None:
            self.send_header("Content-Length", length)
        self.send_header("Connection", "keep-alive")
        self.end_headers()
        if head or r.status in (204, 304):
            r.read()
            return
        while True:
            chunk = r.read(64 * 1024)
            if not chunk:
                break
            try:
                self.wfile.write(chunk)
            except OSError:
                _local.c = None
                r.close()
                self.close_connection = True
                return

    def out(self, status, heads, body, head):
        self.send_response(status)
        for k, v in heads:
            self.send_header(k, v)
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        if not head:
            self.wfile.write(body)


if __name__ == "__main__":
    port = int(os.environ.get("PORT", "8080"))
    print("front for", UPSTREAM, "on", port, flush=True)
    ThreadingHTTPServer(("0.0.0.0", port), H).serve_forever()
