import { IsBoolean, IsOptional, IsString } from "class-validator";

export class UpdateCompanyDto {
  /** 会社の有効/無効フラグ */
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  /** 管理者メモ（サポート担当者用） */
  @IsOptional()
  @IsString()
  adminNotes?: string;
}
