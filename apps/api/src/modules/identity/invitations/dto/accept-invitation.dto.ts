import { IsOptional, IsString, MinLength } from "class-validator";

export class AcceptInvitationDto {
  /** 表示名（招待時に入れた名前を上書きしたい場合のみ） */
  @IsOptional()
  @IsString()
  name?: string;

  /** 設定するパスワード（8文字以上） */
  @IsString()
  @MinLength(8, { message: "パスワードは8文字以上で入力してください" })
  password!: string;
}
