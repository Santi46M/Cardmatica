import re

from app.ingestion.normalizers import rarity_name
from app.schemas.ingestion import ImageInput
from app.services import rarities

# Only filenames with explicit set/language/rarity (and edition, for the TCG) can
# establish a candidate. The caller supplies a verified card page, so a set-prefix
# match must still be unique. OCG products have no editions, so their scans omit it.
SCAN = re.compile(
    r"^.+-(?P<set>[A-Z0-9]+)-(?P<language>EN|ES|SP|FR|DE|IT|PT|JP|KR|SC|TC|AE)-"
    r"(?P<rarity>[A-Za-z0-9]+?)(?:-(?P<edition>1E|UE|LE))?"
    r"(?P<variant>(?:-[A-Za-z0-9]+)*)\.(?:png|jpg|jpeg|webp)$",
    re.IGNORECASE,
)
LANGUAGE = {
    "EN": "en",
    "ES": "es",
    "SP": "es",
    "FR": "fr",
    "DE": "de",
    "IT": "it",
    "PT": "pt",
    "JP": "ja",
    "KR": "ko",
    "SC": "zh",
    "TC": "zh-tw",
    "AE": "ae",
}
EDITION = {"1E": "1st", "UE": "unlimited", "LE": "limited"}
# Edition of an OCG printing, whose products are not split by edition.
NO_EDITION = "not_applicable"


def known_rarity(code: str) -> bool:
    """Only rarities of the table (app/services/rarities.py) identify a scan."""
    return rarities.info(code).family != "other"


def match_scan(record, file_title, info):
    """Return an enriched printing only when all scan dimensions have one match."""
    match = SCAN.fullmatch(file_title.removeprefix("File:"))
    if not match:
        return None
    fields = match.groupdict()
    if not known_rarity(fields["rarity"]):
        return None
    edition = fields["edition"].upper() if fields["edition"] else None
    candidates = [
        printing
        for printing in record.printings
        if printing.code.split("-")[0] == fields["set"].upper()
        and printing.language == LANGUAGE[fields["language"].upper()]
        and rarity_name(printing.rarity).casefold() == rarity_name(fields["rarity"]).casefold()
        and (
            printing.edition in ("unknown", EDITION[edition])
            if edition
            else printing.market == "OCG" and printing.edition in ("unknown", NO_EDITION)
        )
    ]
    if len(candidates) != 1 or not info.get("url"):
        return None
    metadata = info.get("extmetadata", {})

    def value(key):
        entry = metadata.get(key)
        return entry.get("value") if entry else None

    printing = candidates[0].model_copy(deep=True)
    printing.edition = EDITION[edition] if edition else NO_EDITION
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
