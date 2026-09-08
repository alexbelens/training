// Почта для восстановления пароля — опционально. Если SMTP_URL не задан, письма не уходят,
// а ссылку сброса выдаёт админ из панели.
let transport = null;
export const MAIL_ENABLED = !!process.env.SMTP_URL;

export async function sendMail({ to, subject, text }) {
  if (!MAIL_ENABLED) return false;
  if (!transport) {
    const nodemailer = (await import('nodemailer')).default;
    transport = nodemailer.createTransport(process.env.SMTP_URL);
  }
  await transport.sendMail({ from: process.env.SMTP_FROM || 'training@localhost', to, subject, text });
  return true;
}
