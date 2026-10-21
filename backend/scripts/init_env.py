"""Generate local credentials without displaying or committing them."""

import secrets
from pathlib import Path

root = Path(__file__).resolve().parents[2]
destination = root / ".env"
if destination.exists():
    raise SystemExit(".env ya existe; no se modificó")
password = secrets.token_urlsafe(32)
content = (root / ".env.example").read_text(encoding="utf-8")
content = content.replace("CHANGE_ME", password)
content = content.replace("ADMIN_TOKEN=\n", f"ADMIN_TOKEN={secrets.token_urlsafe(40)}\n")
destination.write_text(content, encoding="utf-8")
print(".env creado con credenciales locales; completar USER_AGENT antes de habilitar fuentes")
