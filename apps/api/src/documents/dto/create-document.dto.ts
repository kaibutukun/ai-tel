import { DocumentType } from "@prisma/client";
import { IsEnum, IsNotEmpty, IsOptional, IsString, IsUrl } from "class-validator";

export class CreateDocumentDto {
  @IsString()
  @IsNotEmpty()
  companyId: string;

  @IsString()
  @IsNotEmpty()
  name: string;

  @IsEnum(DocumentType)
  type: DocumentType;

  @IsOptional()
  @IsUrl({ require_protocol: true })
  url?: string;

  @IsOptional()
  @IsString()
  content?: string;
}
