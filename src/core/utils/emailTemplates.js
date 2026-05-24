const escapeHtml = (value = '') => String(value)
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;')
  .replaceAll("'", '&#039;');

const paragraphs = (body = '') => String(body)
  .split(/\n{2,}/)
  .map((part) => part.trim())
  .filter(Boolean)
  .map((part) => `<p style="margin:0 0 16px;color:#334155;font-size:15px;line-height:1.7;">${escapeHtml(part).replaceAll('\n', '<br>')}</p>`)
  .join('');

export const renderSkillUpEmail = ({
  preheader = '',
  heading,
  body,
  ctaLabel,
  ctaUrl,
  footerNote = 'You are receiving this email because you have a SkillUp account.',
}) => {
  const safeHeading = escapeHtml(heading);
  const safeCtaLabel = escapeHtml(ctaLabel);
  const safeCtaUrl = escapeHtml(ctaUrl);
  const currentYear = new Date().getFullYear();

  return `
<!doctype html>
<html>
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${safeHeading}</title>
  </head>
  <body style="margin:0;background:#f4f7f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;color:#1f2937;">
    <div style="display:none;max-height:0;overflow:hidden;">${escapeHtml(preheader)}</div>
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f4f7f6;padding:32px 12px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:640px;background:#ffffff;border:1px solid #dbe7e2;border-radius:18px;overflow:hidden;">
            <tr>
              <td style="background:#2f4f46;padding:28px 32px;">
                <div style="color:#ffffff;font-size:24px;font-weight:800;letter-spacing:.2px;">SkillUp</div>
                <div style="color:#cadbd4;font-size:13px;margin-top:6px;">Pakistan's smart freelancing platform</div>
              </td>
            </tr>
            <tr>
              <td style="padding:34px 32px 28px;">
                <h1 style="margin:0 0 18px;color:#20352f;font-size:26px;line-height:1.25;font-weight:800;">${safeHeading}</h1>
                ${paragraphs(body)}
                ${ctaLabel && ctaUrl ? `
                  <div style="margin:28px 0 8px;">
                    <a href="${safeCtaUrl}" style="display:inline-block;background:#52796f;color:#ffffff;text-decoration:none;font-weight:800;font-size:15px;padding:13px 22px;border-radius:10px;">${safeCtaLabel}</a>
                  </div>
                ` : ''}
              </td>
            </tr>
            <tr>
              <td style="border-top:1px solid #e5eee9;padding:22px 32px;background:#fbfdfc;">
                <p style="margin:0;color:#64748b;font-size:12px;line-height:1.6;">${escapeHtml(footerNote)}</p>
                <p style="margin:10px 0 0;color:#94a3b8;font-size:12px;">© ${currentYear} SkillUp. All rights reserved.</p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
};

export const renderTextEmail = ({ heading, body, ctaLabel, ctaUrl }) => {
  const parts = [heading, '', body];
  if (ctaLabel && ctaUrl) parts.push('', `${ctaLabel}: ${ctaUrl}`);
  parts.push('', 'SkillUp');
  return parts.filter((part) => part !== undefined && part !== null).join('\n');
};

export const renderCampaignEmail = (campaign) => {
  const content = campaign.content || {};
  const isCleanup = campaign.templateKey === 'account_cleanup_notice';
  const footerNote = isCleanup
    ? 'This account notice was sent by the SkillUp administration team.'
    : 'You are receiving this update because you have a SkillUp account.';

  return {
    subject: campaign.subject,
    html: renderSkillUpEmail({
      preheader: content.heading,
      heading: content.heading,
      body: content.body,
      ctaLabel: content.ctaLabel,
      ctaUrl: content.ctaUrl,
      footerNote,
    }),
    text: renderTextEmail({
      heading: content.heading,
      body: content.body,
      ctaLabel: content.ctaLabel,
      ctaUrl: content.ctaUrl,
    }),
  };
};
