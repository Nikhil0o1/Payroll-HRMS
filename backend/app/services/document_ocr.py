"""Best-effort OCR extraction of identity fields from KYC document images.

Uses Tesseract (via ``pytesseract``) when it is installed on the host, so
sensitive ID images are processed **on-premise** — nothing is sent to a third
party. When the engine isn't available it degrades gracefully to "no fields
extracted", so document uploads always succeed regardless.

Parsing is intentionally conservative: we only surface a field when a clear
pattern matches (PAN format, dd/mm/yyyy DOB, explicit Male/Female, a plausible
all-caps name line, an address block ending in a 6-digit PIN). Accuracy depends
on image quality — the admin always reviews the pre-filled values before saving.
"""
from __future__ import annotations

import io
import os
import re
import shutil
from typing import Optional

# Words that appear on ID cards but are never a person's name.
_NAME_STOPWORDS = {
    "INCOME",
    "TAX",
    "DEPARTMENT",
    "GOVT",
    "GOVERNMENT",
    "OF",
    "INDIA",
    "PERMANENT",
    "ACCOUNT",
    "NUMBER",
    "FATHER",
    "FATHERS",
    "NAME",
    "DATE",
    "BIRTH",
    "DOB",
    "SIGNATURE",
    "MALE",
    "FEMALE",
    "UNIQUE",
    "IDENTIFICATION",
    "AUTHORITY",
    "AADHAAR",
    "ENROLMENT",
    "YEAR",
    "ADDRESS",
}

_PAN_RE = re.compile(r"\b([A-Z]{5}[0-9]{4}[A-Z])\b")
_DOB_RE = re.compile(r"\b(\d{2})[/\-.](\d{2})[/\-.](\d{4})\b")
_GENDER_RE = re.compile(r"\b(MALE|FEMALE|TRANSGENDER)\b", re.IGNORECASE)
_NAME_LINE_RE = re.compile(r"^[A-Za-z][A-Za-z .]{2,39}$")
_PIN_RE = re.compile(r"\b(\d{6})\b")


def _configure_tesseract() -> None:
    """Point pytesseract at the Tesseract binary. Honors ``TESSERACT_CMD``,
    then PATH, then the standard Windows install locations."""
    import pytesseract

    cmd = os.environ.get("TESSERACT_CMD")
    if cmd and os.path.exists(cmd):
        pytesseract.pytesseract.tesseract_cmd = cmd
        return
    if shutil.which("tesseract"):
        return
    for candidate in (
        r"C:\Program Files\Tesseract-OCR\tesseract.exe",
        r"C:\Program Files (x86)\Tesseract-OCR\tesseract.exe",
        "/usr/bin/tesseract",
        "/usr/local/bin/tesseract",
        "/opt/homebrew/bin/tesseract",
    ):
        if os.path.exists(candidate):
            pytesseract.pytesseract.tesseract_cmd = candidate
            return


def engine_available() -> bool:
    """True when Tesseract is installed and callable."""
    try:
        import pytesseract

        _configure_tesseract()
        pytesseract.get_tesseract_version()
        return True
    except Exception:
        return False


def _ocr_text(data: bytes) -> str:
    import pytesseract
    from PIL import Image, ImageOps

    _configure_tesseract()
    img = Image.open(io.BytesIO(data))
    # Grayscale + autocontrast nudges Tesseract accuracy on phone photos.
    img = ImageOps.autocontrast(ImageOps.grayscale(img))
    return pytesseract.image_to_string(img)


def _parse_dob(text: str) -> Optional[str]:
    m = _DOB_RE.search(text)
    if not m:
        return None
    dd, mm, yyyy = m.group(1), m.group(2), m.group(3)
    try:
        d, mo, y = int(dd), int(mm), int(yyyy)
        if 1 <= d <= 31 and 1 <= mo <= 12 and 1900 <= y <= 2100:
            return f"{y:04d}-{mo:02d}-{d:02d}"
    except ValueError:
        return None
    return None


def _parse_name(text: str) -> Optional[str]:
    for raw in text.splitlines():
        line = raw.strip()
        if not _NAME_LINE_RE.match(line):
            continue
        tokens = [t for t in line.split() if t]
        if not (2 <= len(tokens) <= 4):
            continue
        if any(tok.upper().strip(".") in _NAME_STOPWORDS for tok in tokens):
            continue
        return " ".join(t.capitalize() for t in tokens)
    return None


def _parse_address(text: str) -> Optional[str]:
    """Heuristic Aadhaar address: the block after an 'Address' label, up to and
    including the 6-digit PIN code."""
    lines = [ln.strip() for ln in text.splitlines() if ln.strip()]
    for i, ln in enumerate(lines):
        if not re.search(r"address", ln, re.IGNORECASE):
            continue
        chunk: list[str] = []
        head = re.sub(r".*address\s*[:\-]?\s*", "", ln, flags=re.IGNORECASE).strip()
        if head:
            chunk.append(head)
        for nxt in lines[i + 1 : i + 8]:
            chunk.append(nxt)
            if _PIN_RE.search(nxt):
                break
        addr = ", ".join(c.strip(" ,") for c in chunk if c.strip(" ,"))
        addr = re.sub(r"\s+", " ", addr).strip(" ,")
        return addr[:300] or None
    # Fallback: if there's a PIN, grab the 2-3 lines leading up to it.
    for i, ln in enumerate(lines):
        if _PIN_RE.search(ln):
            chunk = [c for c in lines[max(0, i - 2) : i + 1]]
            addr = re.sub(r"\s+", " ", ", ".join(chunk)).strip(" ,")
            if len(addr) > 12:
                return addr[:300]
    return None


def extract_fields(doc_type: str, data: bytes) -> dict:
    """Return ``{engine_available, fields}`` where ``fields`` holds whatever
    could be confidently parsed (any of name/first_name/last_name/
    date_of_birth/gender/pan/address)."""
    available = engine_available()
    out: dict = {"engine_available": available, "fields": {}}
    if not available:
        return out

    try:
        text = _ocr_text(data)
    except Exception:
        return out

    fields: dict = {}

    pan = _PAN_RE.search(text.upper())
    if pan:
        fields["pan"] = pan.group(1)

    dob = _parse_dob(text)
    if dob:
        fields["date_of_birth"] = dob

    gender = _GENDER_RE.search(text)
    if gender:
        fields["gender"] = gender.group(1).upper()

    name = _parse_name(text)
    if name:
        fields["name"] = name
        parts = name.split()
        fields["first_name"] = parts[0]
        if len(parts) > 1:
            fields["last_name"] = " ".join(parts[1:])

    # Address mostly comes off Aadhaar.
    if doc_type.upper() != "PAN":
        address = _parse_address(text)
        if address:
            fields["address"] = address

    out["fields"] = fields
    return out
