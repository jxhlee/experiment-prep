import { Icon } from "../icons";
import { Card, CardTitle, PageHeader } from "../ui";

const STEPS = [
  ["논문 Methods 붙여넣기", "시약과 실험 순서가 나오는 문단을 붙여넣고, 실험 규모(몇 배로 할지)를 정해요."],
  ["추출 결과 확인·수정", "AI가 읽어 낸 시약과 실행 단계를 표에서 확인하고, 틀리거나 빠진 곳은 직접 고쳐요."],
  ["계산 결과 보기", "시약별 계량값, 같은 시약을 합친 총량, 실행 순서 타임라인과 총 소요 시간을 확인해요. 규모와 유효숫자는 바로 바꿀 수 있어요."],
];

const FAQ = [
  {
    q: "로그인해야 쓸 수 있나요?",
    a: "아니요. 분석, 수정, 계산은 모두 로그인 없이 쓸 수 있어요. 실험을 저장하고 나중에 다시 불러오려면 로그인이 필요해요.",
  },
  {
    q: "계산은 AI가 하나요?",
    a: "아니요. AI는 글에서 시약과 단계를 읽어 내기만 해요. 몰농도·부피·분자량으로 계량값을 구하는 일은 정해진 계산식이 맡아서, 같은 입력이면 늘 같은 값이 나와요.",
  },
  {
    q: "내 Gemini API 키는 안전한가요?",
    a: "내 키를 쓰는 방식을 고르면, 키는 이 브라우저에서 Google(Gemini)로만 보내고 우리 서버에는 보내지 않아요. 이 탭을 닫으면 지워져요.",
  },
  {
    q: "AI가 잘못 읽으면 어떡하나요?",
    a: "확인·수정 단계에서 모든 칸을 직접 고칠 수 있어요. 그래도 실험 전에는 꼭 논문 원문과 한 번 더 대조해 주세요.",
  },
  {
    q: "분자량은 어디서 가져오나요?",
    a: "자주 쓰는 시약은 내장 목록에서, 없으면 PubChem에서 찾아요. 그래도 못 찾으면 직접 입력할 수 있고, 로그인 상태라면 다음에도 쓰도록 내 시약에 저장돼요.",
  },
  {
    q: "하던 작업이 사라지나요?",
    a: "새로고침하거나 로그인 화면에 다녀와도 이 탭에서는 이어져요. 탭을 닫거나 6시간이 지나면 지워져요. 오래 두려면 저장해 주세요.",
  },
];

export default function HelpView() {
  return (
    <div className="flex flex-col gap-5">
      <PageHeader title="도움말" description="사용 방법과 자주 묻는 질문, 그리고 쓰기 전에 꼭 알아 둘 점이에요." />

      <div className="grid items-start gap-5 lg:grid-cols-2">
        <Card as="section" aria-labelledby="how-title">
          <CardTitle id="how-title" icon="list">
            사용 방법
          </CardTitle>
          <ol className="mt-4 flex flex-col gap-4">
            {STEPS.map(([title, body], i) => (
              <li key={title} className="flex gap-3">
                <span aria-hidden="true" className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand text-sm font-semibold text-brand-ink">
                  {i + 1}
                </span>
                <div>
                  <p className="text-[15px] font-semibold text-ink">
                    <span className="sr-only">{i + 1}단계. </span>
                    {title}
                  </p>
                  <p className="mt-0.5 text-sm text-ink-muted">{body}</p>
                </div>
              </li>
            ))}
          </ol>
        </Card>

        <Card as="section" aria-labelledby="caution-title">
          <CardTitle id="caution-title" icon="alert">
            꼭 알아 두세요
          </CardTitle>
          <ul className="mt-4 flex flex-col gap-3 text-sm leading-relaxed text-ink-muted">
            <li className="flex gap-2.5">
              <Icon name="check" size={16} className="mt-1 text-ink" />
              AI가 읽어 낸 시약과 실행 단계는 틀릴 수 있어요. 실험 전에 반드시 논문 원문과 대조해 주세요.
            </li>
            <li className="flex gap-2.5">
              <Icon name="check" size={16} className="mt-1 text-ink" />
              농축 산이나 암모니아수처럼 원액을 희석해 쓰는 시약은 원액의 농도와 밀도를 확인해 직접 계산해야 해요.
            </li>
            <li className="flex gap-2.5">
              <Icon name="check" size={16} className="mt-1 text-ink" />
              위험한 시약은 반드시 안전 수칙에 따라 다뤄 주세요. 이 도구는 준비를 돕는 참고 자료예요.
            </li>
          </ul>
        </Card>
      </div>

      <Card as="section" aria-labelledby="faq-title">
        <CardTitle id="faq-title" icon="help">
          자주 묻는 질문
        </CardTitle>
        <div className="mt-3 divide-y divide-line">
          {FAQ.map((item) => (
            <details key={item.q} className="group py-1">
              <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-4 rounded-lg px-1 text-[15px] font-medium text-ink marker:hidden [&::-webkit-details-marker]:hidden">
                {item.q}
                <Icon name="chevronDown" size={18} className="text-ink-muted transition-transform group-open:rotate-180" />
              </summary>
              <p className="px-1 pb-3 text-sm leading-relaxed text-ink-muted">{item.a}</p>
            </details>
          ))}
        </div>
      </Card>
    </div>
  );
}
