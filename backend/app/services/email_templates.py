"""Transactional email content (HTML + text)."""
from __future__ import annotations

from app.core.config import settings


def welcome_employee(
    *,
    first_name: str,
    work_email: str,
    initial_password: str,
    employee_code: str,
) -> tuple[str, str, str]:
    """Returns (subject, html, text) for a new-employee welcome email."""
    login_url = f"{settings.APP_PUBLIC_URL.rstrip('/')}/login"
    subject = f"Welcome to {settings.EMAIL_FROM_NAME} — your login details"

    html = f"""\
<!doctype html>
<html>
  <body style="font-family: -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif; background:#f5f5f7; margin:0; padding:32px;">
    <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="max-width:560px; margin:0 auto; background:#ffffff; border-radius:12px; overflow:hidden; border:1px solid #e5e7eb;">
      <tr>
        <td style="background:#0f172a; color:#ffffff; padding:28px 32px;">
          <div style="font-weight:600; font-size:14px; letter-spacing:0.04em; text-transform:uppercase; opacity:0.7;">
            {settings.EMAIL_FROM_NAME}
          </div>
          <div style="font-size:22px; font-weight:600; margin-top:6px;">
            Welcome aboard, {first_name}.
          </div>
        </td>
      </tr>
      <tr>
        <td style="padding:28px 32px; color:#0f172a; font-size:14px; line-height:1.65;">
          <p style="margin:0 0 16px 0;">
            Your employee account has been created. You can sign in any time at
            <a href="{login_url}" style="color:#2563eb; text-decoration:none;">{login_url}</a>.
          </p>

          <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background:#f8fafc; border:1px solid #e5e7eb; border-radius:8px; margin:18px 0;">
            <tr>
              <td style="padding:16px 18px;">
                <div style="font-size:12px; color:#64748b; text-transform:uppercase; letter-spacing:0.06em;">Employee code</div>
                <div style="font-size:15px; font-weight:600; margin:4px 0 14px 0;">{employee_code}</div>

                <div style="font-size:12px; color:#64748b; text-transform:uppercase; letter-spacing:0.06em;">Login email</div>
                <div style="font-size:15px; font-weight:600; margin:4px 0 14px 0;">{work_email}</div>

                <div style="font-size:12px; color:#64748b; text-transform:uppercase; letter-spacing:0.06em;">Temporary password</div>
                <div style="font-size:15px; font-weight:600; font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; margin:4px 0 0 0;">{initial_password}</div>
              </td>
            </tr>
          </table>

          <p style="margin:0 0 18px 0;">
            <strong>Please change your password immediately</strong> after your first sign-in
            (Profile → Change password).
          </p>

          <div style="margin:24px 0;">
            <a href="{login_url}"
               style="display:inline-block; background:#0f172a; color:#ffffff; padding:11px 22px; border-radius:8px; font-weight:600; text-decoration:none; font-size:14px;">
              Sign in now
            </a>
          </div>

          <p style="margin:24px 0 0 0; color:#64748b; font-size:12.5px;">
            If you didn't expect this email, please contact your HR administrator.
          </p>
        </td>
      </tr>
    </table>
    <div style="text-align:center; color:#94a3b8; font-size:11.5px; margin-top:18px;">
      This is an automated message from {settings.EMAIL_FROM_NAME}. Do not reply.
    </div>
  </body>
</html>
"""

    text = f"""\
Welcome aboard, {first_name}.

Your employee account has been created. Sign in at:
  {login_url}

Employee code:      {employee_code}
Login email:        {work_email}
Temporary password: {initial_password}

Please change your password immediately after your first sign-in
(Profile -> Change password).

If you didn't expect this email, please contact your HR administrator.

— {settings.EMAIL_FROM_NAME}
"""

    return subject, html, text


def birthday_wish(*, first_name: str, org_name: str) -> tuple[str, str, str]:
    """Returns (subject, html, text) for an employee birthday-wish email."""
    subject = f"Happy Birthday, {first_name}! 🎉"

    html = f"""\
<!doctype html>
<html>
  <body style="font-family: -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif; background:#f5f5f7; margin:0; padding:32px;">
    <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="max-width:560px; margin:0 auto; background:#ffffff; border-radius:16px; overflow:hidden; border:1px solid #e5e7eb;">
      <tr>
        <td style="background:linear-gradient(135deg,#ff6a3d,#e23744); color:#ffffff; padding:40px 32px; text-align:center;">
          <div style="font-size:44px; line-height:1;">🎂</div>
          <div style="font-size:26px; font-weight:700; margin-top:12px;">
            Happy Birthday, {first_name}!
          </div>
        </td>
      </tr>
      <tr>
        <td style="padding:30px 32px; color:#0f172a; font-size:15px; line-height:1.7; text-align:center;">
          <p style="margin:0 0 14px 0;">
            Wishing you a wonderful day filled with happiness and a year ahead full of
            success. Thank you for being a valued part of the team. 🎈
          </p>
          <p style="margin:18px 0 0 0; font-weight:600;">
            — The team at {org_name}
          </p>
        </td>
      </tr>
    </table>
    <div style="text-align:center; color:#94a3b8; font-size:11.5px; margin-top:18px;">
      This is an automated message from {org_name}. Do not reply.
    </div>
  </body>
</html>
"""

    text = f"""\
Happy Birthday, {first_name}!

Wishing you a wonderful day filled with happiness and a year ahead full of
success. Thank you for being a valued part of the team.

— The team at {org_name}
"""

    return subject, html, text
