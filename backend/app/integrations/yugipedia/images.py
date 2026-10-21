import re

from app.ingestion.normalizers import rarity_name
from app.schemas.ingestion import ImageInput

# Only filenames with explicit set/language/rarity/edition can establish a candidate.
# The caller supplies a verified card page, so a set-prefix match must still be unique.
SCAN = re.compile(
    r"^.+-(?P<set>[A-Z0-9]+)-(?P<language>EN|ES|FR|DE|IT|PT|JP|KR|SC|AE)-"
    r"(?P<rarity>StR|ScR|UtR|UR|SR|GR|CR|R|C)-(?P<edition>1E|UE|LE)"
    r"(?P<variant>(?:-[A-Za-z0-9]+)*)\.(?:png|jpg|jpeg|webp)$",
    re.IGNORECASE,
)
LANGUAGE = {
    "EN": "en",
    "ES": "es",
    "FR": "fr",
    "DE": "de",
    "IT": "it",
    "PT": "pt",
    "JP": "ja",
    "KR": "ko",
    "SC": "zh",
    "AE": "ae",
}
EDITION = {"1E": "1st", "UE": "unlimited", "LE": "limited"}


def match_scan(record, file_title, info):
    """Return an enriched printing only when all scan dimensions have one match."""
    match = SCAN.fullmatch(file_title.removeprefix("File:"))
    if not match:
        return None
    fields = match.groupdict()
    candidates = [
        printing
        for printing in record.printings
        if printing.code.split("-")[0] == fields["set"].upper()
        and printing.language == LANGUAGE[fields["language"].upper()]
        and rarity_name(printing.rarity).casefold() == rarity_name(fields["rarity"]).casefold()
        and printing.edition in ("unknown", EDITION[fields["edition"].upper()])
    ]
    if len(candidates) != 1 or not info.get("url"):
        return None
    metadata = info.get("extmetadata", {})

    def value(key):
        entry = metadata.get(key)
        return entry.get("value") if entry else None

    printing = candidates[0].model_copy(deep=True)
    printing.edition = EDITION[fields["edition"].upper()]
    printing.artwork = "scan:" + file_title
    # Metadata is attribution evidence, never an automatic permission grant.
    printing.images = [
        ImageInput(
            file_title=file_title,
            source_url=info["url"],
            author=value("Artist"),
            license=value("LicenseShortName"),
            license_url=value("LicenseUrl"),
        )
    ]
    return printing
