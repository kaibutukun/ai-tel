"use client";

import { useState } from "react";
import { Plus, Phone, Settings, Power } from "lucide-react";
import { Header } from "@/components/layout/header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { mockPhoneNumbers } from "@/mock/data";

export default function PhoneNumbersPage() {
  const [numbers, setNumbers] = useState(mockPhoneNumbers);

  const toggleActive = (id: string) => {
    setNumbers((prev) =>
      prev.map((n) => (n.id === id ? { ...n, isActive: !n.isActive } : n))
    );
  };

  return (
    <>
      <Header title="電話番号管理" />
      <main className="flex-1 p-6 space-y-6">
        <div className="flex items-center justify-between">
          <p className="text-sm text-gray-500">登録済み電話番号: {numbers.length} 件</p>
          <Button>
            <Plus className="w-4 h-4 mr-2" />
            電話番号を追加
          </Button>
        </div>

        <div className="grid gap-4">
          {numbers.map((num) => (
            <Card key={num.id} className={!num.isActive ? "opacity-60" : ""}>
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div
                      className={`w-12 h-12 rounded-xl flex items-center justify-center ${
                        num.isActive ? "bg-blue-50" : "bg-gray-100"
                      }`}
                    >
                      <Phone
                        className={`w-6 h-6 ${num.isActive ? "text-blue-600" : "text-gray-400"}`}
                      />
                    </div>
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <p className="text-lg font-semibold text-gray-900">{num.number}</p>
                        <Badge variant={num.isActive ? "success" : "secondary"}>
                          {num.isActive ? "有効" : "無効"}
                        </Badge>
                      </div>
                      <p className="text-sm text-gray-500">{num.displayName}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-6">
                    <div className="text-right">
                      <p className="text-xs text-gray-400 mb-1">対応フロー</p>
                      <p className="text-sm font-medium text-gray-700">{num.callFlow}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-xs text-gray-400 mb-1">営業時間</p>
                      <p className="text-sm font-medium text-gray-700">{num.businessHours}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-xs text-gray-400 mb-1">転送先</p>
                      <p className="text-sm font-medium text-gray-700">
                        {num.transferTo || "なし"}
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      <Switch
                        checked={num.isActive}
                        onCheckedChange={() => toggleActive(num.id)}
                      />
                      <Button variant="ghost" size="icon">
                        <Settings className="w-4 h-4 text-gray-400" />
                      </Button>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </main>
    </>
  );
}
