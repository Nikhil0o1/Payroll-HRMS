"""Company-domain allow-list for email addresses.

When ``ALLOWED_EMAIL_DOMAINS`` is configured, the platform restricts every
email-introducing entry point — public signup, admin-invite, admin-create-
employee, and login — to that allow-list. An empty list disables the check
(useful for dev / demo).

Why a tiny dedicated module: the rule is dead simple but it is invoked from
four different callers, so keeping a single source of truth avoids subtle
divergence (case sensitivity, leading ``@``, formatting of the user-facing
message, …).
"""
from __future__ import annotations

from typing import Iterable, Optional


def normalize_domains(domains: Optional[Iterable[str]]) -> list[str]:
    """Lower-case, strip whitespace, drop a leading ``@``, drop empties."""
    if not domains:
        return []
    out: list[str] = []
    seen: set[str] = set()
    for raw in domains:
        d = (raw or "").strip().lower()
        if d.startswith("@"):
            d = d[1:]
        if d and d not in seen:
            out.append(d)
            seen.add(d)
    return out


def domain_of(email: str) -> str:
    """Return the lower-cased domain part of *email*, or ``""`` if malformed."""
    e = (email or "").strip().lower()
    if "@" not in e:
        return ""
    return e.rsplit("@", 1)[-1]


def is_email_domain_allowed(email: str, allowed: Optional[Iterable[str]]) -> bool:
    """True when *email*'s domain is allowed (or no policy is configured)."""
    domains = normalize_domains(allowed)
    if not domains:
        return True
    return domain_of(email) in domains


def format_allowed_domains(allowed: Optional[Iterable[str]]) -> str:
    """Human-readable joiner: ``@a.com`` · ``@a.com or @b.com`` · ``@a.com, @b.com, or @c.com``."""
    domains = normalize_domains(allowed)
    if not domains:
        return ""
    if len(domains) == 1:
        return f"@{domains[0]}"
    if len(domains) == 2:
        return f"@{domains[0]} or @{domains[1]}"
    head = ", ".join(f"@{d}" for d in domains[:-1])
    return f"{head}, or @{domains[-1]}"


def assert_email_domain_allowed(email: str) -> None:
    """Raise a 422 ``DomainError`` if the address violates the allow-list.

    No-op when ``ALLOWED_EMAIL_DOMAINS`` is empty, so existing dev/demo flows
    are untouched.
    """
    # Lazy imports — keep the module dependency-light and side-effect-free.
    from app.core.config import settings
    from app.core.exceptions import DomainError

    domains = settings.allowed_email_domains
    if is_email_domain_allowed(email, domains):
        return
    pretty = format_allowed_domains(domains)
    raise DomainError(
        f"Email must use your company domain ({pretty}).",
        status_code=422,
    )
