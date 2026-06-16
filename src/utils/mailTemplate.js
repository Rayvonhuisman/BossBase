export function mailTemplate({
  title,
  preheader,
  body,
  buttonText,
  buttonUrl,
  footerText,
  companyName = 'BossBase',
}) {
  const isSystem = companyName === 'BossBase'
  const footerLine = isSystem
    ? `BossBase &middot; <a href="https://www.bossbase.nl" style="color:#9ca3af;">bossbase.nl</a>`
    : `Verstuurd door ${companyName} via BossBase &middot; <a href="https://www.bossbase.nl" style="color:#9ca3af;">bossbase.nl</a>`

  const buttonHtml = buttonText && buttonUrl ? `
              <table cellpadding="0" cellspacing="0" role="presentation" style="margin:28px 0 0;">
                <tr>
                  <td style="border-radius:8px;background:#1DDB62;">
                    <a href="${buttonUrl}"
                       style="display:inline-block;padding:14px 28px;font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:8px;">
                      ${buttonText}
                    </a>
                  </td>
                </tr>
              </table>` : ''

  const footerTextHtml = footerText
    ? `<p style="margin:24px 0 0;font-size:13px;color:#6b7280;">${footerText}</p>`
    : ''

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
</head>
<body style="margin:0;padding:0;background:#f9fafb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <div style="display:none;max-height:0;overflow:hidden;">${preheader || title}</div>
  <table width="100%" cellpadding="0" cellspacing="0" role="presentation">
    <tr>
      <td align="center" style="padding:40px 16px;">
        <table width="560" cellpadding="0" cellspacing="0" role="presentation"
               style="max-width:560px;width:100%;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.08);">
          <tr>
            <td style="padding:32px 40px 24px;border-bottom:1px solid #f3f4f6;">
              <div style="font-size:20px;font-weight:700;color:#0a0a0a;letter-spacing:-0.5px;">
                <span style="color:#1DDB62;">&#9679;</span> ${companyName}
              </div>
            </td>
          </tr>
          <tr>
            <td style="padding:32px 40px;">
              <h1 style="margin:0 0 16px;font-size:22px;font-weight:700;color:#0a0a0a;line-height:1.3;">${title}</h1>
              <div style="font-size:15px;color:#374151;line-height:1.6;">
                ${body}
              </div>
              ${buttonHtml}
              ${footerTextHtml}
            </td>
          </tr>
          <tr>
            <td style="padding:20px 40px;background:#f9fafb;border-top:1px solid #f3f4f6;">
              <p style="margin:0;font-size:12px;color:#9ca3af;text-align:center;">
                ${footerLine}
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`
}
