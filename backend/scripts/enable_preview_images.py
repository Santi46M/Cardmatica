"""Enable the provisional image preview in .env for a private development environment.

Artwork shown this way has no commercial licence: it is marked as provisional in
the interface and must never be enabled on a public deployment. In a Codespace,
keep port 8000 private (the default).
"""

from pathlib import Path

root = Path(__file__).resolve().parents[2]
destination = root / ".env"
if not destination.exists():
    raise SystemExit("Falta .env: ejecutar antes backend/scripts/init_env.py")
values = {
    "DEPLOYMENT_MODE": "local",
    "ALLOW_LOCAL_IMAGE_PREVIEW": "true",
    "LOCAL_PREVIEW_HOST_SUFFIXES": '[".app.github.dev"]',
}
lines = destination.read_text(encoding="utf-8").splitlines()
seen = set()
for index, line in enumerate(lines):
    key = line.split("=", 1)[0].strip()
    if key in values:
        lines[index] = f"{key}={values[key]}"
        seen.add(key)
lines += [f"{key}={value}" for key, value in values.items() if key not in seen]
destination.write_text("\n".join(lines) + "\n", encoding="utf-8")
print("Vista provisional de imágenes activada en .env; reiniciar la API para aplicarla")
