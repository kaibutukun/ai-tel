import { IsNotEmpty, IsOptional, IsString } from "class-validator";

export class CreateCallFlowDto {
  @IsString()
  @IsNotEmpty()
  companyId: string;

  @IsString()
  @IsNotEmpty()
  name: string;

  @IsOptional()
  @IsString()
  description?: string;

  /**
   * ReactFlow の nodes/edges を JSON で保存
   * コール実行時はこの JSON をコアロジックが解釈する
   */
  @IsOptional()
  flowJson?: object;
}
