// 화면이 다시 그려져 대상 요소가 생기면 그 요소로 키보드 포커스를 옮긴다.
// (단계 이동·줄 추가/삭제 뒤에 포커스가 사라지지 않게 하려고 쓴다. 아직 요소가 없으면 잠깐씩 더 기다린다.)
export function focusSoon(id, tries = 40) {
  setTimeout(() => {
    const el = document.getElementById(id);
    if (el) el.focus();
    else if (tries > 0) focusSoon(id, tries - 1);
  }, 16);
}
