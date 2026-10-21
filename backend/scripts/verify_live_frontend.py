"""Read-only checks against an already populated local application, without mocks."""

import argparse
import json
import os
from pathlib import Path
from urllib.parse import urlsplit

import httpx
from playwright.sync_api import expect, sync_playwright


def main(base_url, output):
    if urlsplit(base_url).hostname not in {"localhost", "127.0.0.1", "::1"}:
        raise ValueError("Esta validación de imágenes es exclusivamente local")
    output.mkdir(parents=True, exist_ok=True)
    with httpx.Client(base_url=base_url, timeout=30) as api:
        response = api.get("/api/v1/cards", params={"page_size": 100, "market": "TCG"})
        response.raise_for_status()
        catalog = response.json()
        assert catalog["total"] > 0, "El catálogo real sigue vacío"
        with sync_playwright() as playwright:
            browser = playwright.chromium.launch(channel="chrome" if os.name == "nt" else None)
            page = browser.new_page(viewport={"width": 1440, "height": 1100})
            errors, external = [], []
            page.on("pageerror", lambda error: errors.append(str(error)))
            page.on(
                "request",
                lambda request: (
                    external.append(request.url)
                    if "ygoprodeck.com" in request.url or "yugipedia.com" in request.url
                    else None
                ),
            )
            page.goto(base_url)
            expect(page.locator("#home")).to_contain_text(catalog["items"][0]["name"])
            page.locator('[data-go="Todas"]').click()
            expect(page.locator("#list tr[data-catalog-card]")).to_have_count(len(catalog["items"]))
            checked = []
            for card in catalog["items"]:
                identifier = card["id"]
                detail = api.get(f"/api/v1/cards/{identifier}").json()
                prints = api.get(
                    f"/api/v1/cards/{identifier}/printings",
                    params={"page_size": 24, "market": "TCG"},
                ).json()
                assert prints["total"] > 0 and detail["archetypes"]
                assert any(text["is_current"] for text in detail["texts"])
                page.locator(f'#list tr[data-catalog-card="{identifier}"]').click()
                expect(page.locator("#mb")).to_contain_text(card["name"])
                expect(page.locator("#mb")).to_contain_text("Texto de catálogo")
                for group in detail["archetypes"]:
                    expect(page.locator("#mb")).to_contain_text(group["name"])
                image = page.locator("#mb img.catalog-image")
                expect(image).to_be_visible()
                page.wait_for_function(
                    "document.querySelector('#mb img.catalog-image')?.naturalWidth > 0"
                )
                expect(page.locator("#mb")).to_contain_text("Ilustración general")
                select = page.locator("#catalog-printing")
                first = select.input_value()
                second = next(
                    (printing for printing in prints["items"] if printing["id"] != first), None
                )
                if second:
                    select.select_option(second["id"])
                    for value in (second["code"], second["set_name"], second["rarity"]):
                        expect(page.locator("#mb .facts")).to_contain_text(value)
                checked.append(
                    {
                        "name": card["name"],
                        "printings": prints["total"],
                        "archetypes": [group["name"] for group in detail["archetypes"]],
                        "image": image.get_attribute("src"),
                        "printing_switch": bool(second),
                    }
                )
                page.keyboard.press("Escape")
            # Search all supported text dimensions against persisted data.
            sample = catalog["items"][0]
            detail = api.get(f"/api/v1/cards/{sample['id']}").json()
            printing = api.get(f"/api/v1/cards/{sample['id']}/printings").json()["items"][0]
            for query in (
                sample["name"],
                printing["code"],
                printing["set_name"],
                printing["rarity"],
                detail["archetypes"][0]["name"],
            ):
                page.locator("#q").fill(query)
                expect(page.locator("#list")).to_contain_text(sample["name"])
                page.wait_for_timeout(350)
                expected = api.get("/api/v1/cards", params={"q": query, "market": "TCG"}).json()[
                    "total"
                ]
                expect(page.locator("#cnt")).to_have_text(f"{expected} cartas")
            page.locator("#q").fill("")
            page.locator("#rar").select_option(printing["rarity"])
            expect(page.locator("#list")).to_contain_text(sample["name"])
            page.locator("#rar").select_option("")
            page.locator('[data-mk="OCG"]').click()
            ocg = api.get("/api/v1/cards", params={"market": "OCG"}).json()["total"]
            expect(page.locator("#cnt")).to_have_text(f"{ocg} cartas")
            page.reload()
            expect(page.locator('[data-mk="OCG"]')).to_have_attribute("aria-pressed", "true")
            page.locator('[data-mk="TCG"]').click()
            page.locator('[data-g="Todas"]').click()
            expect(page.locator("#cnt")).to_have_text(f"{catalog['total']} cartas")
            page.screenshot(path=str(output / "catalog.png"), full_page=True)
            page.locator("#list tr[data-catalog-card]").first.click()
            expect(page.locator("#mb img.catalog-image")).to_be_visible()
            page.wait_for_function(
                "document.querySelector('#mb img.catalog-image')?.naturalWidth > 0"
            )
            page.screenshot(path=str(output / "card.png"), full_page=True)
            assert not errors, errors
            assert not external, external
            browser.close()
    report = {
        "catalog_total": catalog["total"],
        "checked": checked,
        "search_dimensions": ["name", "code", "set", "rarity", "archetype"],
        "tcg_ocg": True,
        "javascript_errors": errors,
        "browser_source_requests": external,
    }
    (output / "report.json").write_text(
        json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    print(json.dumps(report, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--url", default="http://localhost:8000")
    parser.add_argument("--output", type=Path, default=Path(".cache/live-frontend"))
    args = parser.parse_args()
    main(args.url, args.output)
