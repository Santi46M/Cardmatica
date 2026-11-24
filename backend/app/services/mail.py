"""Sending email: the console in development, SMTP in production.

Messages are plain text in Spanish. With EMAIL_BACKEND=console nothing is
sent. With DEPLOYMENT_MODE=local the whole message, link included, is written
to the log, to try every flow on your own computer. Anywhere else only a
notice is: a link in a hosting provider's log would open the account to
anyone who can read that log.
"""

import logging
import smtplib
from email.message import EmailMessage

from app.core.config import get_settings

logger = logging.getLogger("cardmatica.mail")
SMTP_TIMEOUT_SECONDS = 15


def masked(address: str) -> str:
    """m•••@example.com: enough to tell messages apart, not to read the address."""
    name, _, domain = address.partition("@")
    return f"{name[:1]}•••@{domain}"


def send(to: str, subject: str, body: str) -> None:
    settings = get_settings()
    message = EmailMessage()
    message["From"] = settings.email_from
    message["To"] = to
    message["Subject"] = subject
    message.set_content(body)
    if settings.email_backend == "console":
        if settings.deployment_mode == "local":
            logger.info("Correo para %s — %s\n%s", to, subject, body)
        else:
            logger.warning(
                "Correo para %s — %s — no enviado (sin servicio de correo)", masked(to), subject
            )
        return
    with smtplib.SMTP(settings.smtp_host, settings.smtp_port, timeout=SMTP_TIMEOUT_SECONDS) as smtp:
        if settings.smtp_starttls:
            smtp.starttls()
        if settings.smtp_user:
            smtp.login(settings.smtp_user, settings.smtp_password)
        smtp.send_message(message)
