import { IsIn, IsOptional, IsString } from "class-validator";

export class UpdatePhoneNumberRequestDto {
  @IsOptional()
  @IsIn(["PENDING", "APPROVED", "REJECTED", "CANCELED"])
  status?: "PENDING" | "APPROVED" | "REJECTED" | "CANCELED";

  @IsOptional()
  @IsString()
  adminNote?: string;
}

