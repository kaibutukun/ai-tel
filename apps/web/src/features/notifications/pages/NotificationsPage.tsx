"use client";

import { useState } from "react";
import { Mail, Slack, Webhook, Plus } from "lucide-react";
import { Header } from "@/shared/layout/header";
import { Button } from "@/shared/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/ui/card";
import { Input } from "@/shared/ui/input";
import { Label } from "@/shared/ui/label";
import { Switch } from "@/shared/ui/switch";
import { Badge } from "@/shared/ui/badge";

const mockNotifications = [
  {
    id: "n_1",
    type: "EMAIL",
    target: "staff@example.com",
    conditions: ["TRANSFERRED", "CALLBACK_REQUESTED"],
    isActive: true,
  },
  {
    id: "n_2",
    type: "SLACK",
    target: "https://hooks.slack.com/services/xxx/yyy/zzz",
    conditions: ["TRANSFERRED"],
    isActive: true,
  },
  {
    id: "n_3",
    type: "WEBHOOK",
    target: "https://api.example.com/webhook",
    conditions: ["AI_RESOLVED", "CALLBACK_REQUESTED"],
    isActive: false,
  },
];

const typeConfig: Record<string, { label: string; icon: React.ReactNode; color: string }> = {
  EMAIL: { label: "メール", icon: <Mail className="w-5 h-5" />, color: "text-blue-600" },
  SLACK: { label: "Slack", icon: <Slack className="w-5 h-5" />, color: "text-purple-600" },
  WEBHOOK: { label: "Webhook", icon: <Webhook className="w-5 h-5" />, color: "text-green-600" },
};

const conditionLabels: Record<string, string> = {
  AI_RESOLVED: "AI解決",
  TRANSFERRED: "人間転送",
  CALLBACK_REQUESTED: "折り返し依頼",
  NO_ANSWER: "未応答",
};

export function NotificationsPage() {
  const [notifications, setNotifications] = useState(mockNotifications);

  const toggleActive = (id: string) => {
    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, isActive: !n.isActive } : n))
    );
  };

  return (
    <>
      <Header title="通知設定" />
      <main className="flex-1 p-6 space-y-6">
        <div className="flex items-center justify-between">
          <p className="text-sm text-gray-500">通知設定: {notifications.length} 件</p>
          <Button>
            <Plus className="w-4 h-4 mr-2" />
            通知を追加
          </Button>
        </div>

        <div className="grid gap-4">
          {notifications.map((n) => {
            const config = typeConfig[n.type];
            return (
              <Card key={n.id} className={!n.isActive ? "opacity-60" : ""}>
                <CardContent className="p-6">
                  <div className="flex items-start justify-between">
                    <div className="flex items-start gap-4">
                      <div
                        className={`w-10 h-10 rounded-lg bg-gray-50 flex items-center justify-center ${config.color}`}
                      >
                        {config.icon}
                      </div>
                      <div>
                        <div className="flex items-center gap-2 mb-1">
                          <span className="font-medium text-gray-900">{config.label}通知</span>
                          <Badge variant={n.isActive ? "success" : "secondary"}>
                            {n.isActive ? "有効" : "無効"}
                          </Badge>
                        </div>
                        <p className="text-sm text-gray-500 mb-2 break-all">{n.target}</p>
                        <div className="flex flex-wrap gap-1">
                          {n.conditions.map((c) => (
                            <Badge key={c} variant="secondary" className="text-xs">
                              {conditionLabels[c] || c}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <Switch checked={n.isActive} onCheckedChange={() => toggleActive(n.id)} />
                      <Button variant="outline" size="sm">
                        編集
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>

        <Card>
          <CardHeader>
            <CardTitle>通知テンプレート</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>転送通知テンプレート</Label>
              <Input
                defaultValue="【アイテル】{{company_name}} への着信を転送しました。発信者: {{caller_number}}"
              />
            </div>
            <div className="space-y-2">
              <Label>折り返し依頼テンプレート</Label>
              <Input
                defaultValue="【アイテル】折り返し依頼があります。お名前: {{name}} / 連絡先: {{phone}}"
              />
            </div>
          </CardContent>
        </Card>
      </main>
    </>
  );
}
