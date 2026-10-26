"""The HTML templates of the frontend join their lines when they run.

html`…` (frontend/js/html.js) and markup`…` (frontend/demo/store.js) drop each
line break and the indentation after it, so a template can be written one
element per line and still produce the same page. That only works if no line
breaks inside a tag (two attributes would stick together) or between two words
(they would become one). This test reads every template and says where.
"""

import re
from pathlib import Path

FRONTEND = Path(__file__).resolve().parents[2] / "frontend"
START = re.compile(r"\b(?:html|markup)`")


def template_texts(source: str):
    """The literal pieces of every html`…`/markup`…` template, with their line numbers."""
    for match in START.finditer(source):
        line_start = source.rfind("\n", 0, match.start()) + 1
        if source[line_start : match.start()].lstrip().startswith("//"):
            continue  # A comment that mentions html`…`, not a template.
        index, depth, piece = match.end(), 0, []
        pieces = []
        while index < len(source):
            char = source[index]
            if depth == 0 and char == "`":
                break
            if depth == 0 and source.startswith("${", index):
                pieces.append(("".join(piece), index))
                piece, depth, index = [], 1, index + 2
                continue
            if depth:
                depth += {"{": 1, "}": -1}.get(char, 0)
                if char == "`":  # A nested template inside a value: skip it whole.
                    index = source.index("`", index + 1)
            else:
                piece.append(char)
            index += 1
        pieces.append(("".join(piece), index))
        yield source.count("\n", 0, match.start()) + 1, pieces


def problems(path: Path):
    found = []
    for line, pieces in template_texts(path.read_text(encoding="utf-8")):
        open_tag = False
        for number, (text, _) in enumerate(pieces):
            for position, char in enumerate(text):
                if char == "<":
                    open_tag = True
                elif char == ">":
                    open_tag = False
                elif char == "\n":
                    after = text[position:].lstrip()
                    before = text[:position].rstrip(" ")
                    if not after:
                        continue
                    # Text right after a closing tag or a value loses the space it needed.
                    after_closing = re.search(r"</\w+>$", before) or (not before and number > 0)
                    joins_words = after[0] not in "<$" and (
                        (before and before[-1].isalnum()) or after_closing
                    )
                    if open_tag or joins_words:
                        found.append(f"{path.name}:{line}")
    return found


def test_no_template_breaks_a_line_inside_a_tag_or_a_word():
    files = [*FRONTEND.glob("js/*.js"), FRONTEND / "demo/store.js"]
    assert all(path.exists() for path in files)
    assert [problem for path in files for problem in problems(path)] == []


def test_the_check_finds_both_mistakes(tmp_path):
    sample = tmp_path / "sample.js"
    sample.write_text(
        'const a = html`<img src="x"\n    alt="">`;\nconst b = html`<b>${name}</b>\n    texto`;\n'
    )
    assert problems(sample) == ["sample.js:1", "sample.js:3"]
    sample.write_text('const c = html`\n    <p>${t("Hola")}</p>\n    <p>${x}</p>`;\n')
    assert problems(sample) == []
