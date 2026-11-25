import { Icon } from "../icons";
import { Card, CardTitle, PageHeader } from "../ui";

const STEPS = [
  ["논문 Methods 붙여넣기", "시약과 실험 순서가 나오는 문단을 붙여넣거나 논문 PDF에서 바로 가져오고, 실험 규모(몇 배로 할지)를 정해요."],
  ["추출 결과 확인·수정", "AI가 읽어 낸 시약과 실행 단계를 표에서 확인하고, 틀리거나 빠진 곳은 직접 고쳐요."],
  ["계산 결과 보기", "시약별 계량값, 같은 시약을 합친 총량, 실행 순서 타임라인과 총 소요 시간을 확인해요. 규모와 유효숫자는 바로 바꿀 수 있고, 같은 시약을 여러 농도로 쓰면 희석 계획도 보여 줘요. 한 장의 문서로 PDF에 저장할 수도 있어요."],
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
    a: "자주 쓰는 시약은 앱에 들어 있는 분자량 목록에서, 없으면 PubChem에서 찾아요. 그래도 못 찾으면 직접 입력할 수 있고, 로그인 상태라면 다음에도 쓰도록 분자량 기록에 저장돼요.",
  },
  {
    q: "「AI 해석」 표시는 무슨 뜻인가요?",
    a: "AI가 뽑은 값을 논문 원문과 직접 맞춰 본 결과예요. 원문에 같은 값이 적혀 있으면(단위만 바꾼 경우 포함) 아무 표시도 하지 않고, 원문에서 그대로 찾지 못한 값에만 「AI 해석」을 달고 그 칸의 밑줄을 파랗게 보여 줘요. AI가 환산·추정했거나 직접 고친 값일 수 있으니 원문과 대조해 주세요. 줄 오른쪽의 문서 아이콘을 누르면 그 값이 나온 문장을 볼 수 있어요. 단계 이름(한국어 요약)과 대기 여부는 언제나 AI가 정해요.",
  },
  {
    q: "우리 학교에 있는 시약인지 확인하려면요?",
    a: "「보유 시약」 메뉴에 학교(연구실)에 있는 시약 이름을 적어 두세요. 한 줄에 하나씩 적거나 엑셀·문서에서 복사해 붙여넣으면 돼요. 그러면 확인·수정 화면 위쪽에 보유 현황이 나오고, 목록에 없는 시약 줄에는 「구매 요망」, 같은 시약의 다른 형태만 있으면 「다른 형태 보유」가 붙어요. 영문·한글 이름과 순도 표기(99%)가 달라도 같은 시약이면 알아보고, 한글 이름은 자주 쓰는 시약만 알아봐요. 로그인하면 목록이 내 계정에 저장돼 다른 기기에서도 쓸 수 있고, 로그인하지 않으면 이 브라우저에만 저장돼요.",
  },
  {
    q: "시약이 실제로 있는 물질인지 어떻게 확인하나요?",
    a: "앱에 들어 있는 분자량 목록과 PubChem에서 이름을 찾아 봐요. 「PubChem에서 못 찾음」이 나오면 AI가 이름을 잘못 읽었거나 오타일 수 있어요. 합성한 생성물(예: BiVO4:Mo)이나 상품명, 혼합 용액도 이렇게 나올 수 있으니 시약인지 직접 판단해 주세요.",
  },
  {
    q: "EDTA처럼 수화물마다 분자량이 다르면 어떻게 하나요?",
    a: "결과 화면의 계량값 아래 「형태 바꾸기」에서 무수물·수화물·염 중에서 고를 수 있어요. 자주 쓰는 시약은 형태 목록이 들어 있고(분자량은 화학식에서 계산해요), 목록에 없으면 「PubChem에서 다른 형태 찾기」로 수화물을 찾아요. 시약병 라벨에 적힌 형태를 고르세요.",
  },
  {
    q: "폐기 안내는 믿어도 되나요?",
    a: "참고용이에요. 분류표에 있는 시약은 사람이 정리한 분류표를, 그 밖의 시약은 화학식 규칙과 PubChem의 GHS 유해성 정보(MSDS와 같은 체계)를 근거로 해요. 폐액 이름과 기준은 학교·연구실마다 다르니 반드시 기관의 폐기물 규정과 시약 SDS 13항을 따르세요. 같이 버리면 안 되는 조합(예: 산 + 시안)도 알려 주지만, 모든 경우를 다 알려 주지는 못해요.",
  },
  {
    q: "실험 과정은 어떻게 설명해 주나요? 내가 추가한 시약·단계도 들어가나요?",
    a: "결과 화면의 「실험 과정」은 단계마다 쓰는 시약과 그 양(실험 규모 반영), 시작 시점, 걸리는 시간, 조건을 엮어서 처음부터 끝까지 보여 줘요. AI는 글에 나온 조작을 시간이 없는 것까지 순서대로 단계로 나누고, 각 단계에서 쓰는 시약을 연결해 줘요. 확인·수정에서 시약을 직접 추가하거나 단계를 넣고 고치면 그대로 반영되고, 「직접 추가」 표시가 붙어요. 빠진 조작은 단계의 「아래에 단계 넣기」로 중간에 끼워 넣고, 위·아래 화살표로 순서를 바꾸고, 「쓰는 시약」에서 그 단계에 쓰는 시약을 체크하세요. 어느 단계에도 연결하지 않은 시약은 과정 설명에서 빠지지 않고 따로 모아서 알려 줘요. PCR처럼 같은 조작 묶음을 여러 번 반복하는 것은 한 단계로 묶어 「반복」으로 표시해요. AI가 연결한 시약과 단계는 틀릴 수 있으니 논문과 대조해 주세요.",
  },
  {
    q: "같은 시약을 농도만 다르게 여러 번 쓰면요? (희석 계획)",
    a: "같은 시약이 서로 다른 농도로 두 번 이상 나오면, 결과 화면에 「희석 계획」 탭이 생겨요. 농도마다 따로 달아 만들지 않고 가장 진한 용액(원액)을 한 번에 넉넉히 만든 뒤 나눠서 희석하는 방법이에요. 원액은 쓸 양을 모두 더하고 10%를 더 잡아 계량하기 쉬운 양(예: 22.3 mL → 25 mL)으로 알려 주고, 농도마다 원액을 얼마 취해 얼마까지 채울지는 C₁V₁ = C₂V₂로 계산해요. 원액에서 100 µL보다 적게 취해야 하면 한 번 희석한 중간 용액을 거치도록 안내하고, 따로 만들면 10 mg 미만을 달아야 하는 경우도 알려 줘요. 몰농도(M)뿐 아니라 %(w/v, v/v)와 mg/mL도 지원해요. 농도 단위가 서로 다른 경우(M과 %)나 양(mmol)으로 적힌 줄은 계산하지 않아요. 질산처럼 농축 원액을 희석해 쓰는 시약은 원액에 필요한 시약량은 계산하지 못하지만 희석량은 알려 줘요. 희석은 눈금까지 용매를 채우는 것으로 계산했고, 산·염기는 열이 나니 용매에 원액을 천천히 넣으세요. 이 내용은 PDF 문서에도 들어가요.",
  },
  {
    q: "PDF 논문을 올리면 어떻게 읽나요?",
    a: "새 실험 화면의 「PDF에서 가져오기」를 누르거나 파일을 입력칸으로 끌어다 놓으면, 이 브라우저 안에서 글자를 읽어요. 파일은 서버로 보내지 않아요. Methods(재료 및 방법, Experimental, 실험 방법 등) 부분을 찾아 소제목 단위의 구간으로 나누고, 합성·준비 구간을 한도 안에서 앞에서부터 골라 줘요. 특성 분석·계산 구간은 기본에서 빼 두었고, 체크박스로 직접 바꿀 수 있어요. 한도(서비스 API 6,000자, 내 Gemini 키 30,000자)에 다 들어오고 입력칸이 비어 있으면 고르는 화면 없이 바로 넣어요. Methods 제목을 못 찾으면 수량과 조작이 몰린 글을 골라 「추정」이라고 알려 주고, 그것도 없으면(리뷰 논문, 슬라이드, 실험 방법이 보충 자료에 있는 논문) 아무것도 넣지 않고 쪽 범위를 직접 고르게 해요. 스캔한 이미지 PDF는 글자가 없어서 읽을 수 없고, 글자가 깨진 PDF는 경고를 보여 줘요. 두 단으로 짜인 논문은 글 순서가 어색할 수 있고 수식은 깨져 나올 수 있으니 확인해 주세요. 80쪽까지만 읽어요."
  },
  {
    q: "결과를 PDF로 저장하려면요?",
    a: "계산 결과 화면 위쪽의 「PDF로 저장」을 누르면 계량 준비표, 실험 순서, 폐기·안전 안내를 한 장의 문서로 보여 줘요. 문서 위쪽의 「PDF로 저장」을 누르면 인쇄 창이 열리고, 거기서 대상(프린터)을 「PDF로 저장」으로 고르면 파일이 만들어져요. 원문 Methods를 부록으로 붙일 수도 있어요. 어두운 화면을 써도 문서는 흰 종이로 나와요. 문서에는 AI가 읽은 값이 틀릴 수 있다는 안내와 「먼저 확인할 것」이 같이 들어가요.",
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
