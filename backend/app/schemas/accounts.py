from datetime import datetime
from decimal import Decimal
from typing import Annotated, Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, model_validator

# A simple shape check. Proving the address needs confirmation emails (not built yet).
Email = Annotated[str, Field(max_length=254, pattern=r"^[^@\s]+@[^@\s]+\.[^@\s]+$")]


class RegisterInput(BaseModel):
    email: Email
    password: str = Field(min_length=1, max_length=200)
    display_name: str = Field(min_length=2, max_length=60)
    accept_terms: bool
    # The person declares being 18 or older; both boxes start unticked.
    confirm_adult: bool = False


class LoginInput(BaseModel):
    email: Email
    password: str = Field(min_length=1, max_length=200)
    remember: bool = False


class TokenInput(BaseModel):
    token: str = Field(min_length=10, max_length=200)


class PasswordResetRequest(BaseModel):
    email: Email


class PasswordResetInput(TokenInput):
    new_password: str = Field(min_length=1, max_length=200)


class PasswordChangeInput(BaseModel):
    current_password: str = Field(min_length=1, max_length=200)
    new_password: str = Field(min_length=1, max_length=200)


class UserView(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    email: str
    display_name: str
    role: str
    email_verified: bool
    created_at: datetime


class SessionView(BaseModel):
    id: UUID
    created_at: datetime
    last_seen_at: datetime
    expires_at: datetime
    user_agent: str | None
    current: bool


# ---- Profile and preferences (what the page used to keep in the browser) ----

# Same options as the profile form (frontend/js/profile.js).
AccountRole = Literal["buyer", "seller", "both"]
Country = Literal["Argentina", "Bolivia", "Brasil", "Paraguay", "Uruguay"]
PAYMENT_METHODS = (
    "Transferencia bancaria",
    "Mercado Pago",
    "PIX",
    "Efectivo en mano",
    "PayPal",
    "Tarjeta de crédito o débito",
)


class ProfileData(BaseModel):
    role: AccountRole
    name: str = Field(min_length=2, max_length=120)
    store: str = Field(default="", max_length=80)
    country: Country
    # Only what is needed now: address and phone are for shipping, which does
    # not exist yet, so they are optional; payment methods only matter to sellers.
    address: str = Field(default="", max_length=200)
    phone: str = Field(default="", max_length=30)
    payments: list[str] = Field(default_factory=list, max_length=len(PAYMENT_METHODS))

    @model_validator(mode="after")
    def check(self):
        sells = self.role != "buyer"
        if sells and not self.store.strip():
            raise ValueError("Escribe el nombre de tu tienda.")
        if self.phone.strip() and sum(ch.isdigit() for ch in self.phone) < 6:
            raise ValueError("El teléfono debe tener al menos 6 dígitos.")
        if set(self.payments) - set(PAYMENT_METHODS):
            raise ValueError("Método de pago desconocido.")
        if sells and not self.payments:
            raise ValueError("Elige al menos un método de pago.")
        return self


class Preferences(BaseModel):
    currency: str | None = Field(default=None, pattern=r"^[A-Z]{3}$")
    market: Literal["TCG", "OCG"] | None = None
    view: Literal["list", "grid"] | None = None


class AccountData(BaseModel):
    profile: ProfileData | None
    preferences: Preferences


# ---- Wantlists: the same shape the page works with ----------------------------

ClientId = Annotated[str, Field(min_length=1, max_length=40, pattern=r"^[A-Za-z0-9_-]+$")]


class PriceAlert(BaseModel):
    amount: Decimal = Field(gt=0, max_digits=12, decimal_places=2)
    currency: str = Field(pattern=r"^[A-Z]{3}$")


class WantlistItemData(BaseModel):
    id: ClientId
    cardId: UUID
    printingId: UUID | None = None
    market: Literal["TCG", "OCG"]
    language: str = Field(default="", max_length=4)
    edition: str = Field(default="", max_length=20)
    quantity: int = Field(default=1, ge=1, le=99)
    alert: PriceAlert | None = None
    seenSaleAt: datetime | None = None
    addedAt: datetime | None = None
    # Filled in by the server from the catalogue; ignored when saving.
    name: str | None = None
    cardType: str | None = None
    subtypes: list[str] = []
    code: str | None = None
    setName: str | None = None
    rarity: str | None = None


class WantlistData(BaseModel):
    id: ClientId
    name: str = Field(min_length=1, max_length=60)
    createdAt: datetime | None = None
    items: list[WantlistItemData] = Field(default=[], max_length=500)


class WantlistsData(BaseModel):
    lists: list[WantlistData] = Field(default=[], max_length=50)
    active: str | None = None
