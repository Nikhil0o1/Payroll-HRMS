"""Transactional email delivery.

Two backends are supported:
    - ``console`` (default): logs the rendered email to stdout. Zero setup.
    - ``smtp``:               delivers via SMTP using the SMTP_* env vars.

Email failures are intentionally swallowed at the call site so a failed delivery
never rolls back a business transaction (e.g. employee creation must succeed
even if SMTP is misconfigured). Failures are logged with full context.
"""
from __future__ import annotations

import logging
import smtplib
import ssl
from email.message import EmailMessage
from email.utils import formataddr
from typing import Optional

from app.core.config import settings

log = logging.getLogger("hrms.email")


def _format_from() -> str:
    return formataddr((settings.EMAIL_FROM_NAME, settings.EMAIL_FROM_ADDRESS))


def _send_console(*, to: str, subject: str, html: str, text: str) -> None:
    log.info(
        "\n%s\n  EMAIL [console backend]\n  From:    %s\n  To:      %s\n  Subject: %s\n%s\n  Text body:\n%s\n%s\n",
        "=" * 78,
        _format_from(),
        to,
        subject,
        "-" * 78,
        text,
        "=" * 78,
    )


def _send_smtp(*, to: str, subject: str, html: str, text: str) -> None:
    if not settings.SMTP_HOST:
        raise RuntimeError(
            "EMAIL_BACKEND=smtp but SMTP_HOST is not configured. "
            "Set SMTP_HOST/SMTP_USERNAME/SMTP_PASSWORD in your .env."
        )

    msg = EmailMessage()
    msg["From"] = _format_from()
    msg["To"] = to
    msg["Subject"] = subject
    msg.set_content(text)
    msg.add_alternative(html, subtype="html")

    if settings.SMTP_USE_SSL:
        ctx = ssl.create_default_context()
        with smtplib.SMTP_SSL(settings.SMTP_HOST, settings.SMTP_PORT, context=ctx, timeout=15) as server:
            if settings.SMTP_USERNAME:
                server.login(settings.SMTP_USERNAME, settings.SMTP_PASSWORD)
            server.send_message(msg)
        return

    with smtplib.SMTP(settings.SMTP_HOST, settings.SMTP_PORT, timeout=15) as server:
        server.ehlo()
        if settings.SMTP_USE_TLS:
            ctx = ssl.create_default_context()
            server.starttls(context=ctx)
            server.ehlo()
        if settings.SMTP_USERNAME:
            server.login(settings.SMTP_USERNAME, settings.SMTP_PASSWORD)
        server.send_message(msg)


def send_email(
    *,
    to: str,
    subject: str,
    html: str,
    text: Optional[str] = None,
) -> bool:
    """Deliver an email via the configured backend. Returns True on success.

    Never raises — caller code path must not be coupled to email reliability.
    """
    if not to:
        log.warning("send_email: empty recipient; skipping")
        return False

    text_body = text or _strip_html(html)

    try:
        backend = (settings.EMAIL_BACKEND or "console").lower()
        if backend == "console":
            _send_console(to=to, subject=subject, html=html, text=text_body)
        elif backend == "smtp":
            _send_smtp(to=to, subject=subject, html=html, text=text_body)
        else:
            log.error("Unknown EMAIL_BACKEND %r; falling back to console", backend)
            _send_console(to=to, subject=subject, html=html, text=text_body)
        log.info("Email delivered: to=%s subject=%r backend=%s", to, subject, backend)
        return True
    except Exception as exc:  # noqa: BLE001 — we deliberately catch everything
        log.exception("Email delivery failed: to=%s subject=%r err=%s", to, subject, exc)
        return False


def _strip_html(html: str) -> str:
    """Cheap HTML→text fallback used when caller doesn't supply a text body."""
    import re

    text = re.sub(r"<br\s*/?>", "\n", html, flags=re.IGNORECASE)
    text = re.sub(r"</p>", "\n\n", text, flags=re.IGNORECASE)
    text = re.sub(r"<[^>]+>", "", text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()
