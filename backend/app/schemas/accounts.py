from datetime import datetime
from typing import Annotated
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

# A simple shape check. Proving the address needs confirmation emails (not built yet).
Email = Annotated[str, Field(max_length=254, pattern=r"^[^@\s]+@[^@\s]+\.[^@\s]+$")]


class RegisterInput(BaseModel):
    email: Email
    password: str = Field(min_length=1, max_length=200)
    display_name: str = Field(min_length=2, max_length=60)
    accept_terms: bool


class LoginInput(BaseModel):
    email: Email
    password: str = Field(min_length=1, max_length=200)
    remember: bool = False


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
