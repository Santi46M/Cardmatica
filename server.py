"""Where Vercel starts the test site (vercel.json, docs/version-de-prueba.md).

Vercel runs this file's `app`. The site itself lives in backend/app: this only
puts it on the import path and says where its pages are.
"""

import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent
os.environ.setdefault("CARDMATICA_ROOT", str(ROOT))
sys.path.insert(0, str(ROOT / "backend"))

from app.main import app  # noqa: E402, F401
