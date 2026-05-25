import { Module } from "@nestjs/common";
import { AdminCallSessionsModule } from "./call-sessions/admin-call-sessions.module";
import { AdminCompaniesModule } from "./companies/admin-companies.module";
import { AdminPhoneNumbersModule } from "./phone-numbers/admin-phone-numbers.module";

/**
 * プラットフォーム管理 API のアグリゲータ。
 *
 * - companies/     : 全企業の管理（一覧・詳細・有効/無効・プラン設定）
 * - phone-numbers/ : NTT CPaaS 番号在庫 + 会社からの追加リクエスト
 * - call-sessions/ : 全社の通話履歴 横断ビュー
 */
@Module({
  imports: [
    AdminCompaniesModule,
    AdminPhoneNumbersModule,
    AdminCallSessionsModule,
  ],
})
export class PlatformAdminModule {}
