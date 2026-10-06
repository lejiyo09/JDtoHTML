"""Add the Chromebook layer to an already-built site's index.html (no engine rebuild).

    python ports/soh/patch_index.py <path/to/index.html>

Idempotent: running it twice changes nothing. Same injection as make_site.py.
"""
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
MARK = "/* cr-chromebook */"


def main(path):
    s = open(path, encoding="utf-8", newline="").read()
    if MARK in s:
        print("already patched")
        return
    cb = open(os.path.join(HERE, "chromebook.js"), encoding="utf-8").read()
    if "</head>" not in s:
        sys.exit("no </head> in " + path)
    s = s.replace("</head>", "<script>" + MARK + "\n" + cb + "</script></head>", 1)
    if '<meta name="viewport"' not in s:
        s = s.replace("<head>", '<head><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">', 1)
    open(path, "w", encoding="utf-8", newline="").write(s)
    print("patched", path)


if __name__ == "__main__":
    main(sys.argv[1])
