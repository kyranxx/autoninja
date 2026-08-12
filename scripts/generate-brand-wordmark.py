"""Generate locked AutoNinja SVG wordmarks from the official Barlow Black font.

Tooling only: install `fonttools` and `uharfbuzz`, then run this script. The
result contains paths, not live text, so production rendering cannot drift with
font loading or browser synthesis.
"""

from __future__ import annotations

import tempfile
import urllib.request
from pathlib import Path

import uharfbuzz as hb
from fontTools.pens.boundsPen import BoundsPen
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen
from fontTools.ttLib import TTFont


ROOT = Path(__file__).resolve().parents[1]
OUTPUT_DIR = ROOT / "public" / "brand" / "autoninja"
FONT_URL = (
    "https://raw.githubusercontent.com/google/fonts/main/ofl/barlow/"
    "Barlow-Black.ttf"
)
WORDMARK = "AutoNinja"
ORANGE = "#F45B00"
BLACK = "#111317"
WHITE = "#FFFFFF"
LETTER_SPACING_EM = -0.055


def shape(font_bytes: bytes, upem: int):
    face = hb.Face(font_bytes)
    font = hb.Font(face)
    font.scale = (upem, upem)
    buffer = hb.Buffer()
    buffer.add_str(WORDMARK)
    buffer.guess_segment_properties()
    hb.shape(font, buffer, {"kern": True})
    return zip(buffer.glyph_infos, buffer.glyph_positions, strict=True)


def build_svg(font_path: Path, auto_color: str) -> str:
    font_bytes = font_path.read_bytes()
    font = TTFont(font_path)
    glyph_set = font.getGlyphSet()
    glyph_order = font.getGlyphOrder()
    upem = font["head"].unitsPerEm
    tracking = round(upem * LETTER_SPACING_EM)
    shaped = list(shape(font_bytes, upem))

    glyphs: list[tuple[str, int, int, str]] = []
    cursor_x = 0
    bounds: list[tuple[float, float, float, float]] = []

    for index, (info, position) in enumerate(shaped):
        glyph_name = glyph_order[info.codepoint]
        glyph_x = cursor_x + position.x_offset
        glyph_y = position.y_offset
        color = auto_color if info.cluster < len("Auto") else ORANGE
        glyphs.append((glyph_name, glyph_x, glyph_y, color))

        bounds_pen = BoundsPen(glyph_set)
        glyph_set[glyph_name].draw(bounds_pen)
        if bounds_pen.bounds:
            x_min, y_min, x_max, y_max = bounds_pen.bounds
            bounds.append(
                (x_min + glyph_x, y_min + glyph_y, x_max + glyph_x, y_max + glyph_y)
            )

        cursor_x += position.x_advance
        if index < len(shaped) - 1:
            cursor_x += tracking

    min_x = min(item[0] for item in bounds)
    min_y = min(item[1] for item in bounds)
    max_x = max(item[2] for item in bounds)
    max_y = max(item[3] for item in bounds)
    width = max_x - min_x
    height = max_y - min_y

    paths: list[str] = []
    for glyph_name, glyph_x, glyph_y, color in glyphs:
        svg_pen = SVGPathPen(glyph_set)
        transform_pen = TransformPen(
            svg_pen,
            (1, 0, 0, -1, glyph_x - min_x, max_y - glyph_y),
        )
        glyph_set[glyph_name].draw(transform_pen)
        commands = svg_pen.getCommands()
        if commands:
            paths.append(f'  <path fill="{color}" d="{commands}"/>')

    return "\n".join(
        [
            '<svg xmlns="http://www.w3.org/2000/svg" '
            f'viewBox="0 0 {width:.2f} {height:.2f}" role="presentation">',
            *paths,
            "</svg>",
            "",
        ]
    )


def main() -> None:
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix="autoninja-wordmark-") as temp_dir:
        font_path = Path(temp_dir) / "Barlow-Black.ttf"
        urllib.request.urlretrieve(FONT_URL, font_path)
        (OUTPUT_DIR / "wordmark.svg").write_text(
            build_svg(font_path, BLACK), encoding="utf-8", newline="\n"
        )
        (OUTPUT_DIR / "wordmark-inverse.svg").write_text(
            build_svg(font_path, WHITE), encoding="utf-8", newline="\n"
        )


if __name__ == "__main__":
    main()
