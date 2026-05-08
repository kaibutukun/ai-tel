// フロー編集は全画面なのでサイドバーなしの独立レイアウト
export default function FlowEditorLayout({ children }: { children: React.ReactNode }) {
  return <div className="h-screen overflow-hidden">{children}</div>;
}
