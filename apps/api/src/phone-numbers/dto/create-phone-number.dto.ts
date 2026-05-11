import { IsBoolean, IsOptional, IsString, Matches } from "class-validator";
import { Transform } from "class-transformer";

function normalizePhoneNumber(value: unknown) {
  return typeof value === "string" ? value.replace(/[\s\-()]/g, "") : value;
}

/**
 * Twilio Console で取得済みの番号をアプリに登録する DTO。
 * 番号の購入や本人確認は Twilio 側で手動対応し、ここでは DB への紐づけだけを行う。
 */
export class CreatePhoneNumberDto {
  /** 登録先の会社ID */
  @IsString()
  companyId: string;

  /** Twilio の電話番号。Webhook 照合のため E.164 形式（例: +815012345678）で保存する */
  @Transform(({ value }) => normalizePhoneNumber(value))
  @Matches(/^\+[1-9]\d{1,14}$/, {
    message: "number must be in E.164 format, e.g. +15717175671",
  })
  number: string;

  /** 表示名（例: "代表回線", "予約専用"） */
  @IsOptional()
  @IsString()
  displayName?: string;

  /** Twilio Console の IncomingPhoneNumber SID（任意だが運用上は保存推奨） */
  @IsOptional()
  @IsString()
  twilioSid?: string;

  /** 転送先電話番号。Twilio が発信できる形式（E.164推奨）で保存する */
  @IsOptional()
  @Transform(({ value }) => normalizePhoneNumber(value))
  @IsString()
  transferTo?: string;

  /** 最初から着信受付を有効にするか */
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  /** 割り当てるコールフローID */
  @IsOptional()
  @IsString()
  callFlowId?: string;
}
