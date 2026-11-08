#!/usr/bin/env python3
"""Flags code swallowed by an end-of-line comment in src/game/*.js: a line whose `//` comment (outside strings) ends
in a closed parenthesis followed by more text that looks like code (`;`, `=`, `(` calls, `{`). Run before a commit;
exits 1 on a finding."""
import glob, re, sys
bad = 0
for f in sorted(glob.glob('src/game/*.js')):
    for n, line in enumerate(open(f, encoding='utf8'), 1):
        i, q = 0, None
        while i < len(line):
            ch = line[i]
            if q:
                if ch == '\\': i += 2; continue
                if ch == q: q = None
            elif ch in '\'"`': q = ch
            elif line.startswith('//', i):
                rest = line[i + 2:].strip()
                if line[:i].strip() and rest.startswith('('):
                    depth, j = 0, 0
                    for j, c in enumerate(rest):
                        depth += c == '('; depth -= c == ')'
                        if depth == 0: break
                    tail = rest[j + 1:].strip()
                    if tail and re.search(r'[;={]|\w\(', tail) and not tail.startswith('//'):
                        print(f'{f}:{n}: code after a comment: {tail[:80]}'); bad += 1
                break
            i += 1
sys.exit(1 if bad else 0)
