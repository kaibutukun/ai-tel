/**
 * シードスクリプト — npm run dev 時に自動実行される
 * 実行: npx ts-node --transpile-only prisma/seed.ts  (apps/api ディレクトリで)
 *
 * 作成するデータ（upsert なので何度実行しても安全）:
 *   - Business プラン
 *   - デモ会社
 *   - デモユーザー (demo@ai-tel.jp / password)
 *   - メンバーシップ (ADMIN)
 *   - 電話番号
 *   - コールフロー
 *   - サブスクリプション
 *   - FAQ 5件
 *   - 今月の利用状況レコード
 */

import { PrismaClient } from "@prisma/client";
import { scryptSync, randomBytes } from "crypto";

const prisma = new PrismaClient();

function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

async function main() {
  console.log("🌱 Seeding database...");

  // ── プラン ────────────────────────────────────────────────────────────
  const plan = await prisma.plan.upsert({
    where: { type: "BUSINESS" },
    create: {
      name: "Business",
      type: "BUSINESS",
      priceMonthly: 29800,
      maxPhoneNumbers: 5,
      maxMinutesPerMonth: 500,
      maxFaqs: 100,
      hasMultipleFlows: true,
      hasSlackNotification: true,
      hasMemberManagement: true,
      hasTransfer: true,
      hasAdvancedConditions: true,
    },
    update: {},
  });
  console.log(`✅ Plan: ${plan.name}`);

  // ── 会社 ──────────────────────────────────────────────────────────────
  const company = await prisma.company.upsert({
    where: { slug: "demo" },
    create: {
      name: "デモ株式会社",
      slug: "demo",
      industry: "小売業",
      phoneMain: "03-0000-0000",
      isActive: true,
    },
    update: {},
  });
  console.log(`✅ Company: ${company.name} (${company.id})`);

  // ── プラットフォーム運営者（kaibutukun） ───────────────────────────────
  await prisma.user.upsert({
    where: { email: "kaibutukun1201@gmail.com" },
    create: {
      email: "kaibutukun1201@gmail.com",
      name: "運営管理者",
      passwordHash: hashPassword("testkai"),
      adminRole: true,
    },
    update: { passwordHash: hashPassword("testkai"), adminRole: true },
  });
  console.log(`✅ PlatformAdmin: kaibutukun1201@gmail.com`);

  // ── デモ会社ユーザー ──────────────────────────────────────────────────
  const user = await prisma.user.upsert({
    where: { email: "demo@ai-tel.jp" },
    create: {
      email: "demo@ai-tel.jp",
      name: "デモ ユーザー",
      passwordHash: hashPassword("password"),
    },
    update: { passwordHash: hashPassword("password") },
  });
  console.log(`✅ User: ${user.email}`);

  // ── メンバーシップ ────────────────────────────────────────────────────
  await prisma.companyMember.upsert({
    where: { companyId_userId: { companyId: company.id, userId: user.id } },
    create: {
      companyId: company.id,
      userId: user.id,
      role: "ADMIN",
      joinedAt: new Date(),
    },
    update: {},
  });
  console.log(`✅ Membership: ${user.email} -> ${company.name} (ADMIN)`);

  // ── サブスクリプション ────────────────────────────────────────────────
  const periodStart = new Date();
  periodStart.setDate(1);
  periodStart.setHours(0, 0, 0, 0);
  const periodEnd = new Date(periodStart);
  periodEnd.setMonth(periodEnd.getMonth() + 1);

  await prisma.subscription.upsert({
    where: { companyId: company.id },
    create: {
      companyId: company.id,
      planId: plan.id,
      status: "ACTIVE",
      currentPeriodStart: periodStart,
      currentPeriodEnd: periodEnd,
    },
    update: {},
  });
  console.log(`✅ Subscription: ${plan.name}`);

  // ── コールフロー ──────────────────────────────────────────────────────
  const callFlow = await prisma.callFlow.upsert({
    where: { id: "seed-flow-1" },
    create: {
      id: "seed-flow-1",
      companyId: company.id,
      name: "標準対応フロー",
      description: "汎用的な電話対応フロー",
      status: "PUBLISHED",
      flowJson: {
        nodes: [],
        edges: [],
      },
    },
    update: {},
  });
  console.log(`✅ CallFlow: ${callFlow.name}`);

  // ── 電話番号 ──────────────────────────────────────────────────────────
  const phoneNumber = await prisma.phoneNumber.upsert({
    where: { number: "050-0000-0001" },
    create: {
      companyId: company.id,
      number: "050-0000-0001",
      displayName: "代表回線",
      callFlowId: callFlow.id,
      transferTo: null,
      isActive: true,
    },
    update: {},
  });
  console.log(`✅ PhoneNumber: ${phoneNumber.number}`);

  // ── FAQ ───────────────────────────────────────────────────────────────
  const faqs = [
    { id: "seed-faq-1", category: "予約", question: "予約はどのようにすればよいですか？", answer: "お電話またはウェブサイトからご予約いただけます。", priority: 1 },
    { id: "seed-faq-2", category: "営業時間", question: "営業時間を教えてください。", answer: "平日9:00〜18:00、土曜10:00〜17:00です。日祝はお休みです。", priority: 2 },
    { id: "seed-faq-3", category: "キャンセル", question: "キャンセルポリシーを教えてください。", answer: "前日までのキャンセルは無料です。当日キャンセルはキャンセル料が発生します。", priority: 3 },
    { id: "seed-faq-4", category: "支払い", question: "支払い方法は何がありますか？", answer: "現金・クレジットカード・電子マネーがご利用いただけます。", priority: 4 },
    { id: "seed-faq-5", category: "アクセス", question: "最寄り駅はどこですか？", answer: "○○駅から徒歩5分です。", priority: 5 },
  ];

  for (const faq of faqs) {
    await prisma.fAQ.upsert({
      where: { id: faq.id },
      create: { ...faq, companyId: company.id, isActive: true },
      update: {},
    });
  }
  console.log(`✅ FAQs: ${faqs.length} items`);

  // ── 今月の利用状況レコード ────────────────────────────────────────────
  const now = new Date();
  await prisma.usageRecord.upsert({
    where: {
      companyId_year_month: {
        companyId: company.id,
        year: now.getFullYear(),
        month: now.getMonth() + 1,
      },
    },
    create: {
      companyId: company.id,
      year: now.getFullYear(),
      month: now.getMonth() + 1,
      totalCalls: 0,
      totalMinutes: 0,
      aiResolvedCount: 0,
      transferredCount: 0,
    },
    update: {},
  });
  console.log(`✅ UsageRecord: ${now.getFullYear()}/${now.getMonth() + 1}`);

  console.log("\n🎉 Seed complete!");
  console.log(`   Platform admin: kaibutukun1201@gmail.com / testkai`);
  console.log(`   Demo user:      demo@ai-tel.jp / password`);
  console.log(`   CompanyId: ${company.id}`);
}

main()
  .catch((e) => {
    console.error("❌ Seed failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
