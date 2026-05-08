import { IsEnum, IsOptional, IsString } from "class-validator";
import { FlowStatus } from "@prisma/client";

export class UpdateCallFlowDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  description?: string;

  /** PUBLISHED にすると Twilio コア側でこのフローが使用される */
  @IsOptional()
  @IsEnum(FlowStatus)
  status?: FlowStatus;

  /** ReactFlow の nodes/edges JSON */
  @IsOptional()
  flowJson?: object;
}
