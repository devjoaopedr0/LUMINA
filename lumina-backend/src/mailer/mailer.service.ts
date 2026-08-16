import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/** Envio de e-mail transacional via Resend (REST API, sem dependência extra).
 * Sem RESEND_API_KEY configurada (dev), simula o envio no console — o link
 * de redefinição aparece no log pra permitir testar o fluxo localmente. */
@Injectable()
export class MailerService {
  private readonly logger = new Logger(MailerService.name);

  private readonly apiKey: string | undefined;
  private readonly fromEmail: string;

  constructor(private readonly configService: ConfigService) {
    this.apiKey = this.configService.get<string>('RESEND_API_KEY') || undefined;
    this.fromEmail =
      this.configService.get<string>('RESEND_FROM_EMAIL') ?? 'Lumina <onboarding@resend.dev>';
  }

  private async send(
    to: string,
    subject: string,
    html: string,
  ): Promise<void> {
    if (!this.apiKey) {
      this.logger.warn('RESEND_API_KEY não configurada — simulando envio no console.');
      this.logger.log(`Para: ${to}`);
      this.logger.log(`Assunto: ${subject}`);
      this.logger.log(html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim());
      return;
    }

    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ from: this.fromEmail, to: [to], subject, html }),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`Resend falhou (${res.status}): ${body}`);
    }
  }

  sendPasswordResetEmail(to: string, resetUrl: string): Promise<void> {
    const subject = 'Redefinição de senha — Lumina';
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 480px; margin: 0 auto; color: #111827;">
        <h2 style="margin-bottom: 16px;">Redefinição de senha</h2>
        <p style="font-size: 14px; line-height: 1.6;">
          Recebemos um pedido para redefinir a senha da sua conta na Lumina.
        </p>
        <p style="font-size: 14px; line-height: 1.6;">
          <a href="${resetUrl}"
             style="display: inline-block; background: #6f42c1; color: #fff; padding: 12px 24px; border-radius: 9999px; text-decoration: none; font-weight: 600;">
            Redefinir minha senha
          </a>
        </p>
        <p style="font-size: 13px; line-height: 1.6; color: #6b7280;">
          Se você não pediu isso, pode ignorar este e-mail — o link expira em 30 minutos.
        </p>
      </div>
    `;
    return this.send(to, subject, html);
  }

  sendVerificationCodeEmail(to: string, code: string): Promise<void> {
    const subject = 'Confirme seu e-mail — Lumina';
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 480px; margin: 0 auto; color: #111827;">
        <h2 style="margin-bottom: 16px;">Confirme seu e-mail</h2>
        <p style="font-size: 14px; line-height: 1.6;">
          Para concluir seu cadastro na Lumina, use o código abaixo:
        </p>
        <p style="font-size: 32px; font-weight: 700; letter-spacing: 12px; text-align: center; margin: 24px 0; color: #6f42c1;">
          ${code}
        </p>
        <p style="font-size: 13px; line-height: 1.6; color: #6b7280;">
          O código expira em 15 minutos. Se você não criou uma conta na Lumina, pode ignorar este e-mail.
        </p>
      </div>
    `;
    return this.send(to, subject, html);
  }
}
