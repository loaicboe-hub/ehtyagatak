import net from 'node:net';
import tls from 'node:tls';
import { checkSmtpConfiguration } from '../../foundation/mail/email-templates.mjs';

export function getSmtpStatus() {
  return checkSmtpConfiguration(process.env);
}

/**
 * Lightweight zero-dependency SMTP sender supporting STARTTLS (port 587) and implicit TLS (port 465).
 * Never fakes success when SMTP_ENABLED !== 'true' or credentials are incomplete.
 */
export async function sendSmtpEmail({ to, subject, text, html }) {
  const status = getSmtpStatus();
  if (!status.configured) {
    const err = new Error(status.reason);
    err.code = 'SMTP_UNCONFIGURED';
    throw err;
  }

  const host = process.env.SMTP_HOST;
  const port = Number.parseInt(process.env.SMTP_PORT || '587', 10);
  const secure = String(process.env.SMTP_SECURE).toLowerCase() === 'true' || port === 465;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASSWORD;
  const fromAddr = process.env.MAIL_FROM_ADDRESS;
  const fromName = process.env.MAIL_FROM_NAME || 'Ehtyajatak';

  const boundary = `b_${Date.now().toString(16)}`;
  const rawMessage = [
    `From: "${fromName.replace(/"/g, '')}" <${fromAddr}>`,
    `To: <${to}>`,
    `Subject: =?UTF-8?B?${Buffer.from(subject, 'utf8').toString('base64')}?=`,
    'MIME-Version: 1.0',
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    '',
    `--${boundary}`,
    'Content-Type: text/plain; charset=UTF-8',
    'Content-Transfer-Encoding: base64',
    '',
    Buffer.from(text, 'utf8').toString('base64'),
    `--${boundary}`,
    'Content-Type: text/html; charset=UTF-8',
    'Content-Transfer-Encoding: base64',
    '',
    Buffer.from(html, 'utf8').toString('base64'),
    `--${boundary}--`,
    '.'
  ].join('\r\n');

  return new Promise((resolve, reject) => {
    let socket = secure
      ? tls.connect({ host, port, rejectUnauthorized: true })
      : net.connect({ host, port });

    socket.setTimeout(15000);
    let buffer = '';
    let step = 'GREETING';

    const sendLine = (line) => socket.write(`${line}\r\n`);

    const onData = (chunk) => {
      buffer += chunk.toString('utf8');
      const lines = buffer.split('\r\n');
      buffer = lines.pop() || '';
      for (const line of lines) {
        if (!line || /^\d{3}-/.test(line)) continue;
        const code = Number.parseInt(line.slice(0, 3), 10);
        if (code >= 400) {
          socket.destroy();
          return reject(new Error(`SMTP error at ${step}: ${line}`));
        }
        if (step === 'GREETING') {
          step = secure ? 'AUTH_LOGIN' : 'STARTTLS';
          sendLine(`EHLO ${host}`);
        } else if (step === 'STARTTLS') {
          step = 'UPGRADING';
          sendLine('STARTTLS');
        } else if (step === 'UPGRADING') {
          socket.removeListener('data', onData);
          socket = tls.connect({ socket, host, rejectUnauthorized: true }, () => {
            step = 'EHLO_TLS';
            socket.on('data', onData);
            sendLine(`EHLO ${host}`);
          });
          socket.on('error', reject);
        } else if (step === 'EHLO_TLS' || step === 'AUTH_LOGIN') {
          step = 'AUTH_USER';
          sendLine('AUTH LOGIN');
        } else if (step === 'AUTH_USER') {
          step = 'AUTH_PASS';
          sendLine(Buffer.from(user, 'utf8').toString('base64'));
        } else if (step === 'AUTH_PASS') {
          step = 'MAIL_FROM';
          sendLine(Buffer.from(pass, 'utf8').toString('base64'));
        } else if (step === 'MAIL_FROM') {
          step = 'RCPT_TO';
          sendLine(`MAIL FROM:<${fromAddr}>`);
        } else if (step === 'RCPT_TO') {
          step = 'DATA';
          sendLine(`RCPT TO:<${to}>`);
        } else if (step === 'DATA') {
          step = 'BODY';
          sendLine('DATA');
        } else if (step === 'BODY') {
          step = 'QUIT';
          sendLine(rawMessage);
        } else if (step === 'QUIT') {
          sendLine('QUIT');
          socket.end();
          resolve({ sent: true });
        }
      }
    };

    socket.on('data', onData);
    socket.on('timeout', () => {
      socket.destroy();
      reject(new Error('SMTP connection timed out.'));
    });
    socket.on('error', reject);
  });
}
