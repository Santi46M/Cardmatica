"""Sending email: the console in development, SMTP in production.

Messages are plain text in Spanish. With EMAIL_BACKEND=console nothing leaves
the machine: the message, including its link, is written to the log
(`docker compose logs api`), which is enough to try every flow in a Codespace.
"""

import logging
import smtplib
from email.message import EmailMessage

from app.core.config import get_settings

logger = logging.getLogger("cardmatica.mail")
SMTP_TIMEOUT_SECONDS = 15


def send(to: str, subject: str, body: str) -> None:
    settings = get_settings()
    message = EmailMessage()
    message["From"] = settings.email_from
    message["To"] = to
    message["Subject"] = subject
    message.set_content(body)
    if settings.email_backend == "console":
        logger.info("Correo para %s — %s\n%s", to, subject, body)
        return
    with smtplib.SMTP(settings.smtp_host, settings.smtp_port, timeout=SMTP_TIMEOUT_SECONDS) as smtp:
        if settings.smtp_starttls:
            smtp.starttls()
        if settings.smtp_user:
            smtp.login(settings.smtp_user, settings.smtp_password)
        smtp.send_message(message)
