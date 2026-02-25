from pathlib import Path
import sys


PROJECT_ROOT = Path(__file__).resolve().parents[1]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from app.db import engine  # noqa: E402


def main() -> None:
    print(f"engine.url={engine.url}")
    print(f"engine.dialect.name={engine.dialect.name}")


if __name__ == "__main__":
    main()
