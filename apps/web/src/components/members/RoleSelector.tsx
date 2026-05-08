"use client";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { MemberRole } from "@/lib/api/members";

const ROLE_LABELS: Record<MemberRole, string> = {
  ADMIN: "管理者",
  GENERAL: "一般",
};

interface RoleSelectorProps {
  role: MemberRole;
  onChange: (role: MemberRole) => void;
  disabled?: boolean;
}

/**
 * メンバーのロールを変更するセレクトボックス
 * 管理者（ADMIN）と一般（GENERAL）の2択
 */
export function RoleSelector({ role, onChange, disabled }: RoleSelectorProps) {
  return (
    <Select
      value={role}
      onValueChange={(v) => onChange(v as MemberRole)}
      disabled={disabled}
    >
      <SelectTrigger className="w-28 h-8 text-xs">
        <SelectValue>{ROLE_LABELS[role]}</SelectValue>
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="ADMIN">管理者</SelectItem>
        <SelectItem value="GENERAL">一般</SelectItem>
      </SelectContent>
    </Select>
  );
}
