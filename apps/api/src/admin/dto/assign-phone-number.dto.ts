import { IsOptional, IsString } from "class-validator";

/**
 * 運営管理者が番号在庫を会社へ割り当てるための DTO。
 * companyId を空にすると未割当在庫へ戻す。
 */
export class AssignPhoneNumberDto {
  @IsOptional()
  @IsString()
  companyId?: string | null;
}

