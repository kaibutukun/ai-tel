import { Phone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default function LoginPage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-blue-600 rounded-2xl mb-4">
            <Phone className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-4xl font-bold text-gray-900">アイテル</h1>
          <p className="text-gray-500 mt-2">AI電話対応サービス</p>
        </div>

        <Card className="shadow-xl">
          <CardHeader>
            <CardTitle className="text-center">ログイン</CardTitle>
            <CardDescription className="text-center">
              管理画面にアクセスするにはログインしてください
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">メールアドレス</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="your@email.com"
                  defaultValue="demo@ai-tel.jp"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">パスワード</Label>
                <Input
                  id="password"
                  type="password"
                  placeholder="••••••••"
                  defaultValue="password"
                />
              </div>
              <Button asChild className="w-full">
                <a href="/dashboard">ログイン</a>
              </Button>
            </form>
            <div className="mt-4 text-center">
              <a href="#" className="text-sm text-blue-600 hover:underline">
                パスワードをお忘れですか？
              </a>
            </div>
          </CardContent>
        </Card>

        <p className="text-center text-xs text-gray-400 mt-6">
          © 2024 アイテル. All rights reserved.
        </p>
      </div>
    </div>
  );
}
