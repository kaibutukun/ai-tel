import { IsBoolean, IsOptional, IsString, Matches } from "class-validator";
import { Transform } from "class-transformer";

function normalizePhoneNumber(value: unknown) {
  return typeof value === "string" ? value.replace(/[\s\-()]/g, "") : value;
}

/**
 * NTT CPaaS で取得済みの番号をアプリに登録する DTO。
 * 番号の取得や本人確認は NTT CPaaS 側で対応し、ここでは DB への紐づけだけを行う。
 */
export class CreatePhoneNumberDto {
  /** 割当先の会社ID。未指定の場合は運営管理の番号在庫として登録する */
  @IsOptional()
  @IsString()
  companyId?: string;

  /** NTT CPaaS の電話番号。Webhook 照合のため E.164 形式（例: +815012345678）で保存する */
  @Transform(({ value }) => normalizePhoneNumber(value))
  @Matches(/^\+[1-9]\d{1,14}$/, {
    message: "number must be in E.164 format, e.g. +15717175671",
  })
  number: string;

  /** 表示名（例: "代表回線", "予約専用"） */
  @IsOptional()
  @IsString()
  displayName?: string;

  /** NTT CPaaS / Infobip 側で照合できる番号ID（任意） */
  @IsOptional()
  @IsString()
  providerNumberId?: string;

  /** 転送先電話番号。NTT CPaaS が発信できる形式（E.164推奨）で保存する */
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
