#!/usr/bin/env python3
"""Flags code swallowed by an end-of-line comment in src/game/*.js: a line with code before its `//` comment whose
comment holds code after it (after a closing `(...)` note: anything like code; in a plain note: a statement or a call
after a `;`, or a block opened). Strings, template literals (across lines), regex literals and /* */ blocks are skipped.
The build runs it first (tools/build.py); exits 1 on a finding, or if it finds no files."""
import pathlib, re, sys
SRC = pathlib.Path(__file__).resolve().parent.parent / 'src' / 'game'
# (code-shaped: a call (its '(' right after the name: not prose's 'word (aside);') or an assignment ending in ';', a block opened, an else, a declaration; not prose with a ';')
CODE_IN_NOTE = re.compile(r'[\w$\]](\([^()]*\)|\s+=\s*[^=;][^;]*);|\)\s*\{|\}\s*else\b|\b(const|let|var)\s+[\w$]+\s*=[^=]')
REGEX_BEFORE = set('(,=:[!&|?;{}*%<>~^')   # (not '+'/'-': 'i++ / 2' is a division)
KW_BEFORE = re.compile(r'\b(return|typeof|case|void|delete|in|of|yield|await)\s*$')   # (a regex after these too)
files = sorted(SRC.glob('*.js'))
if not files: sys.exit(f'no files under {SRC}')
bad = 0
for f in files:
    tmpl = False; block = False   # (a template literal or a /* */ block still open from an earlier line)
    for n, line in enumerate(f.read_text(encoding='utf8').split('\n'), 1):
        i, q = 0, '`' if tmpl else None; prev = ''
        while i < len(line):
            ch = line[i]
            if block:
                if line.startswith('*/', i): block = False; i += 2; continue
                i += 1; continue
            if q:
                if ch == '\\': i += 2; continue
                if ch == q: q = None
                i += 1; continue
            if line.startswith('/*', i): block = True; i += 2; continue
            if line.startswith('//', i):
                rest = line[i + 2:].strip()
                if line[:i].strip():
                    if rest.startswith('('):
                        depth = 0; j = 0
                        for j, c in enumerate(rest):
                            depth += c == '('; depth -= c == ')'
                            if depth == 0: break
                        tail = rest[j + 1:].strip()
                        hit = tail and not tail.startswith('//') and CODE_IN_NOTE.search(tail)
                    else: tail = rest; hit = CODE_IN_NOTE.search(rest)
                    if hit: print(f'{f.relative_to(SRC.parent.parent)}:{n}: code after a comment: {tail[:80]}'); bad += 1
                break
            if ch == '/' and (not prev or prev in REGEX_BEFORE or KW_BEFORE.search(line[:i])):   # (a regex literal: to its closing unescaped '/')
                j, cls = i + 1, False
                while j < len(line):
                    c = line[j]
                    if c == '\\': j += 2; continue
                    if c == '[': cls = True
                    elif c == ']': cls = False
                    elif c == '/' and not cls: break
                    j += 1
                i = j + 1; prev = '/'; continue
            if ch in '\'"`': q = ch
            if not ch.isspace(): prev = ch
            i += 1
        tmpl = q == '`'
sys.exit(1 if bad else 0)
