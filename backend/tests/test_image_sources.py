"""Printing photos by source: Yugipedia scans, seller uploads under review, our own."""

import io

import pytest
from PIL import Image
from sqlalchemy import select

from app.integrations.yugipedia.images import match_scan
from app.models import CardImage, CardPrinting, User
from app.schemas.ingestion import ImageInput, PrintingInput
from app.services import accounts, passwords
from app.services.catalog import printing_view
from app.services.images import UploadService, displayable, ranked_images
from app.services.ingestion import IngestionService

PASSWORD = "dragon blanco de ojos azules"
SELLER = {
    "role": "seller",
    "name": "Ana Pérez",
    "store": "Duelos del Sur",
    "country": "Uruguay",
    "payments": ["Mercado Pago"],
}


def png(color="red"):
    output = io.BytesIO()
    Image.new("RGB", (400, 580), color).save(output, "PNG")
    return output.getvalue()


def with_scan(wiki_record):
    """The synthetic printing with an approved Yugipedia scan."""
    wiki_record.printings[0].images = [
        ImageInput(
            file_title="File:SyntheticTestDragon-TST-EN-UR-1E.png",
            source_url="https://ms.yugipedia.com/synthetic.png",
            rights_status="approved",
            authorization_reference="Synthetic test permission",
        )
    ]
    return wiki_record


def test_scans_with_modern_rarities_and_ocg_scans_without_edition(wiki_record):
    wiki_record.printings = [
        PrintingInput(
            code="TST-JP001",
            set_key="Synthetic OCG Set",
            set_name="Synthetic OCG Set",
            rarity="QCScR",
            language="ja",
            market="OCG",
        ),
        PrintingInput(
            code="TST-EN001",
            set_key="Synthetic Test Set",
            set_name="Synthetic Test Set",
            rarity="Quarter Century Secret Rare",
            language="en",
            market="TCG",
        ),
    ]
    info = {"url": "https://ms.yugipedia.com/synthetic.png"}
    ocg = match_scan(wiki_record, "File:SyntheticTestDragon-TST-JP-QCScR.png", info)
    assert ocg and ocg.code == "TST-JP001" and ocg.edition == "not_applicable"
    tcg = match_scan(wiki_record, "File:SyntheticTestDragon-TST-EN-QCScR-1E.png", info)
    assert tcg and tcg.code == "TST-EN001" and tcg.edition == "1st"
    # A TCG scan still needs its edition, and an unknown rarity never matches.
    assert match_scan(wiki_record, "File:SyntheticTestDragon-TST-EN-QCScR.png", info) is None
    assert match_scan(wiki_record, "File:SyntheticTestDragon-TST-EN-ZZZ-1E.png", info) is None


def test_upload_waits_for_review_and_shows_after_yugipedia(session, settings, wiki_record):
    IngestionService(session).ingest(with_scan(wiki_record))
    printing = session.scalar(select(CardPrinting))
    service = UploadService(settings, session)
    photo, created = service.upload(printing.id, png())
    assert created and photo.review_status == "pending" and photo.source_slug == "seller"
    assert not displayable(photo)
    assert (settings.image_directory / photo.local_path).is_file()
    # The same photo again: no second copy.
    assert service.upload(printing.id, png()) == (photo, False)
    session.refresh(printing)
    # Not approved yet: the public view does not even list it.
    assert [image.source for image in printing_view(printing).images] == ["yugipedia"]

    with pytest.raises(ValueError):
        service.review(photo.id, "approved", reviewer="mod")  # no permission given
    service.review(photo.id, "approved", reviewer="mod", authorization_reference="Terms v1")
    assert displayable(photo)
    session.refresh(printing)
    assert [image.source_slug for image in ranked_images(printing.images)] == [
        "yugipedia",
        "seller",
    ]
    assert [image.source for image in printing_view(printing).images] == ["yugipedia", "seller"]

    service.review(photo.id, "rejected", reviewer="mod", note="Foto borrosa")
    assert not displayable(photo) and photo.rights_status == "denied"
    assert photo.authorization_reference is None and photo.review_note == "Foto borrosa"


def test_our_own_photo_comes_first(session, settings, wiki_record):
    IngestionService(session).ingest(with_scan(wiki_record))
    printing = session.scalar(select(CardPrinting))
    service = UploadService(settings, session)
    own, _ = service.upload(printing.id, png("green"), source="staff")
    service.review(own.id, "approved", reviewer="mod", authorization_reference="Own scan")
    session.refresh(printing)
    assert ranked_images(printing.images)[0].source_slug == "staff"


def test_only_real_pictures_are_kept(session, settings, wiki_record):
    IngestionService(session).ingest(wiki_record)
    printing = session.scalar(select(CardPrinting))
    service = UploadService(settings, session)
    with pytest.raises(ValueError):
        service.upload(printing.id, b"<svg onload=alert(1)>")
    with pytest.raises(ValueError):
        service.upload(printing.id, png(), source="yugipedia")
    with pytest.raises(LookupError):
        service.upload(printing.id.__class__(int=0), png())
    assert session.scalar(select(CardImage)) is None


@pytest.fixture
def people(client, settings, monkeypatch, factory, wiki_record):
    monkeypatch.setattr(settings, "deployment_mode", "local")
    monkeypatch.setattr(passwords, "SCRYPT_N", 2**10)
    monkeypatch.setattr(passwords, "SCRYPT_P", 1)
    accounts.limiter.clear()
    with factory.begin() as session:
        IngestionService(session).ingest(wiki_record)
    for email in ["mod@example.com", "ana@example.com", "leo@example.com"]:
        client.post(
            "/api/v1/auth/register",
            json={
                "email": email,
                "password": PASSWORD,
                "display_name": email[:3],
                "accept_terms": True,
                "confirm_adult": True,
            },
        )
    with factory.begin() as session:
        session.scalar(select(User).where(User.email == "mod@example.com")).role = "moderator"
        printing_id = session.scalar(select(CardPrinting.id))
    return client, printing_id


def sign_in(client, email):
    client.cookies.clear()
    client.post("/api/v1/auth/login", json={"email": email, "password": PASSWORD})
    client.headers["X-CSRF-Token"] = client.cookies.get("cm_csrf")


def test_seller_sends_a_photo_and_a_moderator_approves_it(people):
    client, printing_id = people
    url = f"/api/v1/account/photos/{printing_id}"
    picture = {"content": png(), "headers": {"Content-Type": "image/png"}}

    # Only a seller's account can send one.
    sign_in(client, "leo@example.com")
    assert client.post(url, **picture).status_code == 403
    sign_in(client, "ana@example.com")
    assert client.put("/api/v1/account/profile", json=SELLER).status_code == 204
    wrong = client.post(url, content=b"text", headers={"Content-Type": "text/plain"})
    assert wrong.status_code == 415
    sent = client.post(url, **picture)
    assert sent.status_code == 201, sent.text
    photo = sent.json()
    assert photo["review_status"] == "pending" and photo["created"]
    assert client.get("/api/v1/account/photos").json()[0]["id"] == photo["id"]
    assert client.get(f"/api/v1/images/{photo['id']}").status_code == 404
    # A seller cannot review.
    assert client.get("/api/v1/admin/images/pending").status_code == 403

    sign_in(client, "mod@example.com")
    pending = client.get("/api/v1/admin/images/pending").json()
    assert [item["id"] for item in pending] == [photo["id"]]
    assert pending[0]["uploaded_by"] == "ana" and pending[0]["code"] == "TST-EN001"
    assert client.get(f"/api/v1/admin/images/{photo['id']}/file").status_code == 200
    # The rest of the administration stays with admins.
    assert client.get("/api/v1/admin/overview").status_code == 403
    review = f"/api/v1/admin/images/{photo['id']}/review"
    assert client.post(review, json={"decision": "approved"}).status_code == 422
    approved = client.post(
        review, json={"decision": "approved", "authorization_reference": "Terms v1"}
    )
    assert approved.status_code == 200, approved.text
    assert client.get(f"/api/v1/images/{photo['id']}").status_code == 200
    assert client.get("/api/v1/admin/images/pending").json() == []

    sign_in(client, "ana@example.com")
    assert client.get("/api/v1/account/photos").json()[0]["review_status"] == "approved"
    exported = client.get("/api/v1/account/export").json()
    assert exported["photos"][0]["review_status"] == "approved"


def test_token_can_moderate_and_send_our_own_photos(people, settings):
    client, printing_id = people
    client.cookies.clear()
    headers = {"Authorization": "Bearer " + settings.admin_token}
    sent = client.post(
        f"/api/v1/admin/images/printings/{printing_id}",
        content=png("blue"),
        headers={**headers, "Content-Type": "image/png"},
    )
    assert sent.status_code == 201, sent.text
    assert sent.json()["source"] == "staff"
    rejected = client.post(
        f"/api/v1/admin/images/{sent.json()['id']}/review",
        json={"decision": "rejected", "note": "Prueba"},
        headers=headers,
    )
    assert rejected.json()["review_status"] == "rejected"
