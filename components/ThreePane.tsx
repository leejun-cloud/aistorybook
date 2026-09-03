// 파트 1~3 화면이 공유하는 좌(자산/목록) · 중앙(미리보기) · 우(Inspector/AI 제안)
// 3패널 레이아웃 골격. lecture-video timeline의 EditorClient 3패널 개념을
// 참고했다 (컴포넌트 자체는 새로 작성).

export function ThreePane({
  left,
  center,
  right,
  leftTitle,
  rightTitle,
}: {
  left: React.ReactNode;
  center: React.ReactNode;
  right: React.ReactNode;
  leftTitle: string;
  rightTitle: string;
}) {
  return (
    <div className="grid flex-1 grid-cols-[260px_1fr_320px] gap-4 overflow-hidden p-4">
      <aside className="flex flex-col overflow-y-auto rounded-xl border border-gray-200 bg-white p-3">
        <h2 className="mb-3 text-sm font-semibold text-gray-500">{leftTitle}</h2>
        {left}
      </aside>
      <main className="flex flex-col overflow-y-auto rounded-xl border border-gray-200 bg-white p-4">
        {center}
      </main>
      <aside className="flex flex-col overflow-y-auto rounded-xl border border-gray-200 bg-white p-3">
        <h2 className="mb-3 text-sm font-semibold text-gray-500">{rightTitle}</h2>
        {right}
      </aside>
    </div>
  );
}
