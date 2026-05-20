import { IsEmail, IsEnum, IsNotEmpty, IsString } from "class-validator";

// メンバーに設定可能なロール
export enum MemberRole {
  ADMIN = "ADMIN",
  GENERAL = "GENERAL",
}

export class CreateMemberDto {
  /** 招待先の会社ID */
  @IsString()
  @IsNotEmpty()
  companyId: string;

  /** 招待するユーザーの表示名 */
  @IsString()
  @IsNotEmpty()
  name: string;

  /** 招待するユーザーのメールアドレス */
  @IsEmail()
  email: string;

  /** 付与するロール */
  @IsEnum(MemberRole)
  role: MemberRole;
}
