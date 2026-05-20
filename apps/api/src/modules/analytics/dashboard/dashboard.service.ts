import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../../database/prisma.service";

@Injectable()
export class DashboardService {
  constructor(private readonly prisma: PrismaService) {}

  /** 会社のダッシュボード統計を返す */
  async getStats(companyId: string) {
    const now = new Date();

    // 今日の 00:00:00
    const todayStart = new Date(now);
    todayStart.setHours(0, 0, 0, 0);

    // 7日前の 00:00:00
    const weekStart = new Date(now);
    weekStart.setDate(weekStart.getDate() - 6);
    weekStart.setHours(0, 0, 0, 0);

    // 今日の通話セッションを全件取得
    const todaySessions = await this.prisma.callSession.findMany({
      where: { companyId, startedAt: { gte: todayStart } },
      select: { result: true, isAiHandled: true, callbackNeeded: true, category: true },
    });

    // 今日の統計
    const todayStats = {
      totalCalls: todaySessions.length,
      aiResolved: todaySessions.filter((s) => s.result === "AI_RESOLVED").length,
      transferred: todaySessions.filter((s) => s.result === "TRANSFERRED").length,
      callbackRequested: todaySessions.filter((s) => s.result === "CALLBACK_REQUESTED").length,
      unhandled: todaySessions.filter((s) => s.result === "NO_ANSWER").length,
    };

    // 週間データ
    const weekSessions = await this.prisma.callSession.findMany({
      where: { companyId, startedAt: { gte: weekStart } },
      select: { startedAt: true, result: true },
    });

    const DAY_LABELS = ["日", "月", "火", "水", "木", "金", "土"];
    const weeklyCallData = Array.from({ length: 7 }, (_, i) => {
      const date = new Date(now);
      date.setDate(date.getDate() - (6 - i));
      date.setHours(0, 0, 0, 0);
      const nextDate = new Date(date);
      nextDate.setDate(nextDate.getDate() + 1);

      const daySessions = weekSessions.filter(
        (s) => s.startedAt >= date && s.startedAt < nextDate
      );
      return {
        day: DAY_LABELS[date.getDay()],
        calls: daySessions.length,
        resolved: daySessions.filter((s) => s.result === "AI_RESOLVED").length,
      };
    });

    // カテゴリ別集計（今日）
    const categoryCounts: Record<string, number> = {};
    for (const s of todaySessions) {
      if (s.category) {
        categoryCounts[s.category] = (categoryCounts[s.category] ?? 0) + 1;
      }
    }
    const topInquiries = Object.entries(categoryCounts)
      .map(([category, count]) => ({ category, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);

    return {
      data: {
        todayStats,
        weeklyCallData,
        topInquiries,
        // AIが回答できなかった質問はコアロジック側で記録するため現状は空配列
        unansweredQuestions: [] as string[],
      },
    };
  }
}
