import { IsBoolean, IsOptional, IsString } from "class-validator";

/**
 * 電話番号の表示設定を更新する DTO
 * CPaaS 側の番号自体の変更はコアロジック側で行うためここでは扱わない
 */
export class UpdatePhoneNumberDto {
  /** 表示名（例: "代表回線", "予約専用"） */
  @IsOptional()
  @IsString()
  displayName?: string | null;

  /** 転送先電話番号 */
  @IsOptional()
  @IsString()
  transferTo?: string | null;

  /** 有効/無効フラグ */
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  /** 割り当てるコールフローID */
  @IsOptional()
  @IsString()
  callFlowId?: string | null;
}
