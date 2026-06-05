"""HTML template for payslips. Rendered by WeasyPrint to PDF."""
from __future__ import annotations

from calendar import month_name
from html import escape

from app.core.config import settings
from app.models.payroll import PayrollDetail


def _fmt_money(amount: float) -> str:
    return f"{float(amount):,.2f}"


def render_payslip_html(detail: PayrollDetail) -> str:
    emp = detail.employee
    run = detail.run
    period_label = f"{month_name[run.period_month]} {run.period_year}"
    company = settings.APP_NAME

    earnings_rows = "".join(
        f"<tr><td>{escape(e.get('name') or e.get('code') or '')}</td><td class='num'>₹ {_fmt_money(e.get('amount', 0))}</td></tr>"
        for e in (detail.earnings or [])
    )
    deductions_rows = "".join(
        f"<tr><td>{escape(d.get('name') or d.get('code') or '')}</td><td class='num'>₹ {_fmt_money(d.get('amount', 0))}</td></tr>"
        for d in (detail.deductions or [])
    )
    # Pre-computed because Python <3.12 disallows backslashes inside f-string
    # expressions, and the empty-row fallback contains escaped quotes.
    no_deductions_row = "<tr><td colspan='2' class='muted'>No deductions</td></tr>"
    deductions_html = deductions_rows or no_deductions_row

    return f"""<!doctype html>
<html><head><meta charset='utf-8'/>
<title>Payslip — {escape(emp.full_name)} — {period_label}</title>
<style>
  body {{ font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
          color: #0f172a; margin: 0; padding: 40px; }}
  .card {{ border: 1px solid #e2e8f0; border-radius: 12px; padding: 32px; max-width: 800px; margin: auto; }}
  h1 {{ font-size: 22px; margin: 0 0 4px; }}
  h2 {{ font-size: 14px; margin: 24px 0 8px; color: #475569; text-transform: uppercase; letter-spacing: .04em; }}
  .muted {{ color: #64748b; font-size: 13px; }}
  .grid {{ display: grid; grid-template-columns: 1fr 1fr; gap: 24px; margin-top: 16px; }}
  .grid div {{ font-size: 13px; }}
  .grid div b {{ display: block; color: #94a3b8; font-weight: 500; text-transform: uppercase; font-size: 11px; letter-spacing: .04em; margin-bottom: 2px; }}
  table {{ width: 100%; border-collapse: collapse; font-size: 13px; }}
  th, td {{ text-align: left; padding: 10px 12px; border-bottom: 1px solid #f1f5f9; }}
  th {{ background: #f8fafc; color: #475569; font-weight: 600; }}
  td.num, th.num {{ text-align: right; font-variant-numeric: tabular-nums; }}
  .totals {{ margin-top: 12px; }}
  .totals tr td {{ font-weight: 600; border-bottom: none; }}
  .net {{ background: #0f172a; color: #fff; border-radius: 10px; padding: 16px 20px; margin-top: 18px;
          display: flex; justify-content: space-between; align-items: center; }}
  .net b {{ font-size: 20px; }}
  .footer {{ margin-top: 24px; font-size: 11px; color: #94a3b8; text-align: center; }}
</style></head>
<body><div class='card'>
  <div style='display:flex;justify-content:space-between;align-items:flex-start'>
    <div>
      <h1>{escape(company)}</h1>
      <div class='muted'>Payslip for {period_label}</div>
    </div>
    <div class='muted' style='text-align:right'>Run #{run.id}<br/>Status: {run.status.value}</div>
  </div>

  <div class='grid'>
    <div><b>Employee</b>{escape(emp.full_name)} ({escape(emp.employee_code)})</div>
    <div><b>Email</b>{escape(emp.work_email)}</div>
    <div><b>Department</b>{escape(emp.department or '—')}</div>
    <div><b>Designation</b>{escape(emp.designation or '—')}</div>
    <div><b>Working Days</b>{detail.working_days}</div>
    <div><b>Payable Days</b>{detail.payable_days}</div>
    <div><b>LOP Days</b>{detail.lop_days}</div>
    <div><b>Paid Leave</b>{detail.paid_leave_days}</div>
  </div>

  <div style='display:grid;grid-template-columns:1fr 1fr;gap:32px;margin-top:24px'>
    <div>
      <h2>Earnings</h2>
      <table>
        <thead><tr><th>Component</th><th class='num'>Amount</th></tr></thead>
        <tbody>{earnings_rows}</tbody>
        <tfoot class='totals'><tr><td>Gross Earnings</td><td class='num'>₹ {_fmt_money(detail.gross)}</td></tr></tfoot>
      </table>
    </div>
    <div>
      <h2>Deductions</h2>
      <table>
        <thead><tr><th>Component</th><th class='num'>Amount</th></tr></thead>
        <tbody>{deductions_html}</tbody>
        <tfoot class='totals'><tr><td>Total Deductions</td><td class='num'>₹ {_fmt_money(detail.total_deductions)}</td></tr></tfoot>
      </table>
    </div>
  </div>

  <div class='net'><span>Net Pay</span><b>₹ {_fmt_money(detail.net_pay)}</b></div>

  <div class='footer'>This is a system-generated payslip and does not require a signature.</div>
</div></body></html>
"""
