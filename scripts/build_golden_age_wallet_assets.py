"""Fit the approved original mark into Google's logo/hero canvases, without redrawing it."""

from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
BACKGROUND = "#3A0015"


def compose(size: tuple[int, int], mark_width: int, destination: str) -> None:
    with Image.open(ROOT / "app/static/card-logos/golden-age-20260921.png") as source:
        mark = source.convert("RGBA")
        height = round(mark.height * mark_width / mark.width)
        mark = mark.resize((mark_width, height), Image.Resampling.LANCZOS)
        canvas = Image.new("RGBA", size, BACKGROUND)
        canvas.alpha_composite(mark, ((size[0] - mark.width) // 2, (size[1] - mark.height) // 2))
        canvas.convert("RGB").save(ROOT / destination, optimize=True)


if __name__ == "__main__":
    # A square, unmasked logo with 15% side margins keeps the full mark inside
    # Google's circular mask. The hero follows the current 1032x812 guidance.
    compose((660, 660), 462, "app/static/card-logos/golden-age-wallet-20260921.png")
    compose((1032, 812), 872, "app/static/wallet-heroes/golden-age-20260921.png")
