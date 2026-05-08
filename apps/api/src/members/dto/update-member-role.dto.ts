import { IsEnum } from "class-validator";
import { MemberRole } from "./create-member.dto";

export class UpdateMemberRoleDto {
  /** 変更後のロール */
  @IsEnum(MemberRole)
  role: MemberRole;
}
