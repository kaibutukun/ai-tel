"use client";

import { useState } from "react";
import { UserPlus, Trash2, ChevronDown } from "lucide-react";
import { Header } from "@/components/layout/header";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { mockMembers } from "@/mock/data";

const roleConfig: Record<string, { label: string; variant: "default" | "secondary" | "outline" | "destructive" }> = {
  OWNER: { label: "オーナー", variant: "default" },
  ADMIN: { label: "管理者", variant: "secondary" },
  MEMBER: { label: "メンバー", variant: "outline" },
  VIEWER: { label: "閲覧者", variant: "outline" },
};

export default function MembersPage() {
  const [members, setMembers] = useState(mockMembers);

  const handleDelete = (id: string) => {
    setMembers((prev) => prev.filter((m) => m.id !== id));
  };

  return (
    <>
      <Header title="メンバー管理" />
      <main className="flex-1 p-6 space-y-6">
        <div className="flex items-center justify-between">
          <p className="text-sm text-gray-500">メンバー: {members.length} 名</p>
          <Button>
            <UserPlus className="w-4 h-4 mr-2" />
            メンバーを招待
          </Button>
        </div>

        <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                {["名前", "メールアドレス", "ロール", "参加日", "ステータス", "操作"].map((h) => (
                  <th
                    key={h}
                    className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider px-6 py-3"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {members.map((member) => {
                const role = roleConfig[member.role];
                return (
                  <tr key={member.id} className={`hover:bg-gray-50 ${!member.isActive ? "opacity-50" : ""}`}>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-full bg-blue-100 flex items-center justify-center text-sm font-medium text-blue-700">
                          {member.name[0]}
                        </div>
                        <span className="text-sm font-medium text-gray-900">{member.name}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-600">{member.email}</td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        <Badge variant={role.variant}>{role.label}</Badge>
                        {member.role !== "OWNER" && (
                          <button className="text-gray-400 hover:text-gray-600">
                            <ChevronDown className="w-3 h-3" />
                          </button>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-600">{member.joinedAt}</td>
                    <td className="px-6 py-4">
                      <Badge variant={member.isActive ? "success" : "secondary"}>
                        {member.isActive ? "アクティブ" : "非アクティブ"}
                      </Badge>
                    </td>
                    <td className="px-6 py-4">
                      {member.role !== "OWNER" && (
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleDelete(member.id)}
                        >
                          <Trash2 className="w-4 h-4 text-red-400" />
                        </Button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </main>
    </>
  );
}
