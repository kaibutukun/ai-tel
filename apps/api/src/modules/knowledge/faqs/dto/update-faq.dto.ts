import { IsBoolean, IsIn, IsOptional, IsString } from "class-validator";
import { FAQ_CATEGORIES } from "./create-faq.dto";

export class UpdateFaqDto {
  @IsOptional()
  @IsString()
  @IsIn(FAQ_CATEGORIES)
  category?: string;

  @IsOptional()
  @IsString()
  question?: string;

  @IsOptional()
  @IsString()
  answer?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
