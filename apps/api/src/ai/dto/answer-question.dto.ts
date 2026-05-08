import { IsNotEmpty, IsOptional, IsString, MaxLength } from "class-validator";

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
}
