import { IsBoolean, IsNotEmpty, IsOptional, IsString, MaxLength } from "class-validator";

export class AnswerQuestionDto {
  @IsString()
  @IsNotEmpty()
  companyId: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(1000)
  question: string;

  @IsOptional()
  @IsString()
  callSessionId?: string;

  // true にすると参考資料（DOCUMENT）のみを検索し、FAQとBedrockは参照しない
  @IsOptional()
  @IsBoolean()
  documentOnly?: boolean;
}
