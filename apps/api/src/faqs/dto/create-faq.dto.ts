import {
  IsBoolean,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
} from "class-validator";

export const FAQ_CATEGORIES = [
  "予約",
  "営業時間",
  "キャンセル",
  "料金",
  "支払い",
  "アクセス",
  "サービス",
  "その他",
] as const;

export class CreateFaqDto {
  @IsString()
  @IsNotEmpty()
  companyId: string;

  @IsOptional()
  @IsString()
  @IsIn(FAQ_CATEGORIES)
  category?: string;

  @IsString()
  @IsNotEmpty()
  question: string;

  @IsString()
  @IsNotEmpty()
  answer: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
