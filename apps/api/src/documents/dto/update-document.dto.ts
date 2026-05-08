import { DocumentType } from "@prisma/client";
import { IsEnum, IsOptional, IsString, IsUrl } from "class-validator";

export class UpdateDocumentDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsEnum(DocumentType)
  type?: DocumentType;

  @IsOptional()
  @IsUrl({ require_protocol: true })
  url?: string;

  @IsOptional()
  @IsString()
  content?: string;
}
