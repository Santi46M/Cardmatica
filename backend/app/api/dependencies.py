import secrets
from typing import Annotated

from fastapi import Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.db.session import get_session

SessionDep = Annotated[Session, Depends(get_session)]
bearer = HTTPBearer(auto_error=False)


def require_admin(credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(bearer)]):
    token = get_settings().admin_token
    if len(token) < 32:
        raise HTTPException(
            503, "Administración deshabilitada: configurar ADMIN_TOKEN de al menos 32 caracteres"
        )
    if not credentials or not secrets.compare_digest(credentials.credentials, token):
        raise HTTPException(
            401, "Credencial administrativa inválida", headers={"WWW-Authenticate": "Bearer"}
        )
