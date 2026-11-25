// =====================================================================
// main.js : 화면과 계산(chem.js)을 연결하는 파일
// 흐름: 사용자가 무언가 조작함(이벤트) → chem.js로 계산 → 글자·그래프·비커 갱신
// =====================================================================


// ---------------------------------------------------------------------
// 1. 화면 요소 가져오기
//    HTML에서 id를 붙여 둔 요소를 자바스크립트 변수로 연결합니다.
// ---------------------------------------------------------------------
const acidConcSlider = document.getElementById("acid-conc");
const baseConcSlider = document.getElementById("base-conc");
const acidVolSlider  = document.getElementById("acid-vol");

const acidConcText = document.getElementById("acid-conc-value");
const baseConcText = document.getElementById("base-conc-value");
const acidVolText  = document.getElementById("acid-vol-value");

const addedVolText  = document.getElementById("added-vol");
const phText        = document.getElementById("ph-value");
const liquid        = document.getElementById("liquid");
const tangentInfo   = document.getElementById("tangent-info");
const analysisBox   = document.getElementById("analysis");
const expDataBox    = document.getElementById("exp-data");
const compareBox    = document.getElementById("compare-result");
const tangentToggle = document.getElementById("tangent-toggle");
const pointToggle   = document.getElementById("point-toggle");
const logToggle     = document.getElementById("log-toggle");
const buretteLiquid = document.getElementById("burette-liquid");
const buretteTip    = document.getElementById("burette-tip");
const apparatus     = document.getElementById("apparatus");
const phMarker      = document.getElementById("ph-marker");
const bisectionBody = document.querySelector("#bisection-table tbody");
const bisectionSummary = document.getElementById("bisection-summary");
const bisectionCaption = document.getElementById("bisection-caption");


// ---------------------------------------------------------------------
// 2. 프로그램이 기억해야 하는 값 (상태)
//    let 으로 만든 변수는 나중에 값이 바뀝니다.
// ---------------------------------------------------------------------
let addedVolume = 0; // 가상 실험에서 지금까지 넣은 NaOH 부피 (mL)
let vMax = 50;       // 그래프 x축 끝 (이론 당량점의 2배로 자동 설정)
let expPoints = [];  // 붙여 넣은 실험 데이터


// 슬라이더의 현재 값을 숫자로 읽어 오는 함수
// (슬라이더 값은 원래 글자라서 Number()로 숫자로 바꿔야 계산할 수 있습니다)
function readSettings() {
  return {
    Ca: Number(acidConcSlider.value),
    Cb: Number(baseConcSlider.value),
    Va: Number(acidVolSlider.value),
  };
}

// 그래프 제목에 넣을 실험 조건 글자
function conditionText() {
  const { Ca, Cb, Va } = readSettings();
  return `${Ca.toFixed(2)} M 아세트산 ${Va} mL + ${Cb.toFixed(2)} M NaOH`;
}


// ---------------------------------------------------------------------
// 3. 보고서용 그래프 도우미 (Chart.js 플러그인)
//    플러그인 = 그래프를 그리는 중간에 끼어들어 추가로 무언가를 그리는 함수 묶음
// ---------------------------------------------------------------------

// (1) 흰 배경: Chart.js는 원래 배경이 투명이라, 이미지로 저장하면 문서에서 검게 보일 수 있음
const whiteBackground = {
  id: "whiteBackground",
  beforeDraw(chart) {
    const ctx = chart.ctx;
    ctx.save();
    ctx.globalCompositeOperation = "destination-over"; // 이미 그린 것 '뒤에' 칠하기
    ctx.fillStyle = "white";
    ctx.fillRect(0, 0, chart.width, chart.height);
    ctx.restore();
  },
};

// (2) 점 옆에 글자 쓰기: 데이터 묶음에 pointLabels: ["글자", ...] 를 넣으면 각 점 옆에 써 줌
//     labelBelow: [true, false, ...] 를 넣으면 true인 점은 글자를 점 아래에 씀
//     글자 뒤에 흰 상자를 깔아서 곡선이나 격자선과 겹쳐도 잘 읽히게 함
const pointLabelsPlugin = {
  id: "pointLabels",
  afterDatasetsDraw(chart) {
    const ctx = chart.ctx;
    const area = chart.chartArea; // 그래프가 그려지는 사각형 영역 (top, bottom, left, right)
    chart.data.datasets.forEach((dataset, i) => {
      if (!dataset.pointLabels || !chart.isDatasetVisible(i)) return;
      const meta = chart.getDatasetMeta(i);      // 화면에 그려진 점들의 위치 정보
      meta.data.forEach((element, j) => {
        const text = dataset.pointLabels[j];
        if (!text) return;
        ctx.save();
        ctx.font = "bold 13px sans-serif";
        const textWidth = ctx.measureText(text).width;

        // 가로 위치: 점이 오른쪽 끝에 가까우면 글자를 점의 왼쪽에 씀 (그래프 밖으로 잘리지 않게)
        const nearRight = element.x + 12 + textWidth > area.right;
        const left = nearRight ? element.x - 12 - textWidth : element.x + 12;

        // 세로 위치: 기본은 점 위, labelBelow면 점 아래
        // 단, 위에 쓰면 그래프 위쪽 끝을 넘어가거나 아래에 쓰면 아래쪽 끝을 넘어가면 반대로
        let below = dataset.labelBelow ? dataset.labelBelow[j] : false;
        if (!below && element.y - 26 < area.top) below = true;
        if (below && element.y + 26 > area.bottom) below = false;
        const baseline = below ? element.y + 22 : element.y - 10;

        // 흰 상자 → 글자 순서로 그림
        ctx.fillStyle = "rgba(255, 255, 255, 0.85)";
        ctx.fillRect(left - 3, baseline - 14, textWidth + 6, 18);
        ctx.fillStyle = dataset.labelColor || "#1f2d3a";
        ctx.textAlign = "left";
        ctx.fillText(text, left, baseline);
        ctx.restore();
      });
    });
  },
};

// 모든 그래프 공통 설정
Chart.defaults.font.size = 13;     // 보고서에 넣었을 때 글자가 잘 보이도록 조금 크게
Chart.defaults.devicePixelRatio = 2; // 2배 해상도로 그려서 저장 이미지가 선명하게
// 범례 아이콘을 실제 점 모양(삼각형, 별 등)과 똑같이 표시
// (선으로 그리는 데이터는 pointStyle: "line" 으로 정해 두어서 범례에 선으로 나옴)
Chart.defaults.plugins.legend.labels.usePointStyle = true;
// 그래프 높이는 CSS(.chart-box)에서 정하고, 그래프는 그 상자를 꽉 채우게
Chart.defaults.maintainAspectRatio = false;
// 그래프 글꼴과 글자색을 페이지와 맞춤
Chart.defaults.font.family = '"IBM Plex Sans KR", "Malgun Gothic", sans-serif';
Chart.defaults.color = "#5e6b73";

// 그래프를 PNG 파일로 내려받기
function saveChart(chart, fileName) {
  const link = document.createElement("a");          // 보이지 않는 링크를 만들어서
  link.href = chart.toBase64Image("image/png", 1);   // 그래프를 이미지 데이터로 바꾸고
  link.download = fileName;                          // 파일 이름을 정한 뒤
  link.click();                                      // 대신 클릭 → 다운로드
}


// ---------------------------------------------------------------------
// 4. 그래프 세 개 만들기 (Chart.js)
//    scatter(산점도) 타입에 showLine: true 를 켜서 선 그래프로 씁니다.
//    line 타입은 x축을 '이름표'로 취급해서 부피 간격이 어긋날 수 있기 때문입니다.
//    datasets 는 그래프 위에 겹쳐 그릴 데이터 묶음들입니다. 순서(번호)가 중요해요.
// ---------------------------------------------------------------------

// (1) 적정 곡선
const titrationChart = new Chart(document.getElementById("titration-chart"), {
  type: "scatter",
  data: {
    datasets: [
      // [0] 이론 적정 곡선
      { label: "이론 곡선", data: [], showLine: true, pointRadius: 0, pointStyle: "line",
        borderColor: "#2b5f8e", backgroundColor: "#2b5f8e", borderWidth: 2 },
      // [1] 가상 실험의 현재 위치
      { label: "현재 위치", data: [], pointRadius: 7,
        backgroundColor: "#e8590c", borderColor: "#e8590c" },
      // [2] 현재 위치(주황 점)에서의 접선
      { label: "접선", data: [], showLine: true, pointRadius: 0, pointStyle: "line",
        borderColor: "#e8590c", backgroundColor: "#e8590c", borderWidth: 2, borderDash: [6, 4] },
      // [3] 실험 데이터
      { label: "실험 데이터", data: [], pointRadius: 4,
        backgroundColor: "#2f9e44", borderColor: "#2f9e44" },
      // [4] 당량점 표시
      { label: "당량점", data: [], pointRadius: 8, pointStyle: "triangle",
        backgroundColor: "#c2255c", borderColor: "#c2255c", labelColor: "#c2255c", pointLabels: [] },
      // [5] 반당량점 표시
      { label: "반당량점 (pH = pKa)", data: [], pointRadius: 8, pointStyle: "rectRot",
        backgroundColor: "#157a7a", borderColor: "#157a7a", labelColor: "#157a7a", pointLabels: [] },
    ],
  },
  options: {
    animation: false, // 슬라이더를 움직일 때 바로바로 바뀌도록 애니메이션 끔
    plugins: {
      title: { display: true, text: "", font: { size: 16 } },
    },
    scales: {
      x: { min: 0, max: 50, title: { display: true, text: "넣은 NaOH 부피 (mL)" } },
      y: { min: 0, max: 14, title: { display: true, text: "pH" } },
    },
  },
  plugins: [whiteBackground, pointLabelsPlugin],
});

// (2) 기울기 그래프
const slopeChart = new Chart(document.getElementById("slope-chart"), {
  type: "scatter",
  data: {
    datasets: [
      // [0] 이론 곡선의 기울기
      { label: "이론 기울기", data: [], showLine: true, pointRadius: 0, pointStyle: "line",
        borderColor: "#2b5f8e", backgroundColor: "#2b5f8e", borderWidth: 2 },
      // [1] 실험 데이터의 기울기
      { label: "실험 기울기", data: [], showLine: true, pointRadius: 3,
        borderColor: "#2f9e44", backgroundColor: "#2f9e44", borderWidth: 1 },
      // [2] 현재 위치의 기울기 (③의 접선 기울기와 같은 값)
      { label: "현재 위치의 기울기", data: [], pointRadius: 7,
        backgroundColor: "#e8590c", borderColor: "#e8590c" },
      // [3] 기울기 최대·최소 지점 표시
      { label: "기울기 최대·최소", data: [], pointRadius: 7, pointStyle: "triangle",
        backgroundColor: "#1f2d3a", borderColor: "#1f2d3a", labelColor: "#1f2d3a", pointLabels: [] },
    ],
  },
  options: {
    animation: false,
    plugins: {
      title: { display: true, text: "", font: { size: 16 } },
    },
    scales: {
      x: { min: 0, max: 50, title: { display: true, text: "넣은 NaOH 부피 (mL)" } },
      // 처음에는 로그 눈금: 당량점의 큰 기울기(수십)와 완충 구간의 작은 기울기(0.07 정도)를 함께 보기 위해
      y: { type: "logarithmic", title: { display: true, text: "기울기 ΔpH/ΔV (pH / mL, 로그 눈금)" } },
    },
  },
  plugins: [whiteBackground, pointLabelsPlugin],
});

// (3) 이분법 그래프: f(pH)와 각 단계의 가운데 값
const bisectionChart = new Chart(document.getElementById("bisection-chart"), {
  type: "scatter",
  data: {
    datasets: [
      // [0] f(pH) 곡선
      { label: "f(pH)", data: [], showLine: true, pointRadius: 0, pointStyle: "line",
        borderColor: "#2b5f8e", backgroundColor: "#2b5f8e", borderWidth: 2 },
      // [1] f = 0 기준선
      { label: "f = 0", data: [], showLine: true, pointRadius: 0, pointStyle: "line",
        borderColor: "#9aa7ad", backgroundColor: "#9aa7ad", borderWidth: 1 },
      // [2] 이분법 각 단계의 가운데 값
      { label: "이분법 단계별 mid", data: [], pointRadius: 5,
        backgroundColor: "#e8590c", borderColor: "#e8590c", labelColor: "#b8470a", pointLabels: [] },
      // [3] 최종 근
      { label: "근 (구한 pH)", data: [], pointRadius: 8, pointStyle: "star",
        backgroundColor: "#1f2d3a", borderColor: "#1f2d3a", borderWidth: 2 },
    ],
  },
  options: {
    animation: false,
    plugins: {
      title: { display: true, text: "", font: { size: 16 } },
    },
    scales: {
      x: { title: { display: true, text: "pH" } },
      y: { title: { display: true, text: "f(pH)  (mol/L)" } },
    },
  },
  plugins: [whiteBackground, pointLabelsPlugin],
});


// ---------------------------------------------------------------------
// 5. 이론 곡선 다시 그리기 (조건이 바뀔 때마다 실행)
// ---------------------------------------------------------------------
function updateTheory() {
  const { Ca, Cb, Va } = readSettings(); // 객체에서 값 세 개를 한 번에 꺼냄

  // 슬라이더 옆 숫자 갱신 (toFixed(2) = 소수 둘째 자리까지)
  acidConcText.textContent = Ca.toFixed(2);
  baseConcText.textContent = Cb.toFixed(2);
  acidVolText.textContent  = Va.toFixed(0);

  // x축 범위: 이론 당량점의 2배까지 보여 주면 곡선 전체가 잘 보임
  const vEq = equivalenceVolume(Ca, Cb, Va);
  vMax = vEq * 2;

  // 이론 곡선(801칸)과 그 기울기 계산
  // 801처럼 홀수 칸으로 나누면 기울기를 계산하는 가운데 점 하나가 정확히 이론 당량점에 놓입니다.
  const curve = makeCurve(Ca, Cb, Va, vMax, 801);
  const curveSlopes = slopes(curve);

  // 미분으로 찾은 특별한 점들
  const eq = findMax(curveSlopes);                                  // 기울기 최대 → 당량점
  const half = findMinBetween(curveSlopes, 0.05 * vEq, 0.95 * vEq); // 완충 구간 기울기 최소 → 반당량점
  const eqPH = phAt(eq.x, Ca, Cb, Va);
  const halfPH = phAt(half.x, Ca, Cb, Va);

  // 적정 곡선 그래프
  titrationChart.data.datasets[0].data = curve;
  titrationChart.data.datasets[4].data = [{ x: eq.x, y: eqPH }];
  titrationChart.data.datasets[4].pointLabels = [`당량점 (${eq.x.toFixed(2)} mL, pH ${eqPH.toFixed(2)})`];
  titrationChart.data.datasets[5].data = [{ x: half.x, y: halfPH }];
  titrationChart.data.datasets[5].pointLabels = [`반당량점 (${half.x.toFixed(2)} mL, pH ${halfPH.toFixed(2)} = pKa)`];
  titrationChart.data.datasets[5].labelBelow = [true]; // 곡선 위쪽은 접선과 겹치기 쉬워서 아래에
  titrationChart.options.scales.x.max = vMax;
  titrationChart.options.plugins.title.text = `적정 곡선: ${conditionText()}`;

  // 기울기 그래프
  slopeChart.data.datasets[0].data = curveSlopes;
  slopeChart.data.datasets[3].data = [eq, half];
  slopeChart.data.datasets[3].pointLabels = [
    `기울기 최대: 당량점 (${eq.x.toFixed(2)} mL)`,
    `기울기 최소: 반당량점 (${half.x.toFixed(2)} mL)`,
  ];
  slopeChart.data.datasets[3].labelBelow = [false, true]; // 최소점 글자는 점 아래에
  slopeChart.options.scales.x.max = vMax;
  slopeChart.options.plugins.title.text = `적정 곡선의 기울기: ${conditionText()}`;

  analysisBox.innerHTML =
    `<b>당량점</b> (기울기 최대): ${eq.x.toFixed(2)} mL, pH ${eqPH.toFixed(2)}` +
    ` / 몰수로 계산한 값 ${vEq.toFixed(2)} mL<br>` +
    `<b>반당량점</b> (완충 구간 기울기 최소): ${half.x.toFixed(2)} mL, pH ${halfPH.toFixed(2)}` +
    ` / 아세트산 pKa 4.76`;

  // 조건이 바뀌면 가상 실험은 처음부터 (주황 점과 접선도 0 mL로 돌아감)
  addedVolume = 0;
  updateExperiment();

  // 실험 데이터가 있으면 바뀐 이론값으로 다시 비교
  if (expPoints.length > 0) compareData();

  titrationChart.update();
  slopeChart.update();
}


// ---------------------------------------------------------------------
// 6. 가상 실험 화면 갱신 (버튼을 누를 때마다 실행)
//    주황 점, 접선, 기울기 그래프의 점, 이분법 그래프, 비커가 모두 여기서 함께 바뀝니다.
// ---------------------------------------------------------------------
function updateExperiment() {
  const { Ca, Cb, Va } = readSettings();
  const pH = phAt(addedVolume, Ca, Cb, Va);
  const m = slopeAt(addedVolume, Ca, Cb, Va); // 현재 위치의 기울기(미분계수)

  addedVolText.textContent = addedVolume.toFixed(1);
  showPH(pH); // pH 미터 숫자가 이전 값에서 새 값으로 굴러가듯 바뀜

  // pH 색 띠 위의 표시를 현재 pH 위치로 (0 → 왼쪽 끝, 14 → 오른쪽 끝)
  phMarker.style.left = (pH / 14 * 100) + "%";

  // 뷰렛 속 NaOH: 넣은 만큼 줄어듦 (그래프 끝 vMax mL를 다 넣으면 바닥)
  buretteLiquid.style.height = ((1 - addedVolume / vMax) * 100) + "%";

  // 주황 점: 토글이 켜져 있을 때만 적정 곡선과 기울기 그래프에 표시
  if (pointToggle.checked) {
    titrationChart.data.datasets[1].data = [{ x: addedVolume, y: pH }];
    slopeChart.data.datasets[2].data = [{ x: addedVolume, y: m }];
  } else {
    titrationChart.data.datasets[1].data = [];
    slopeChart.data.datasets[2].data = [];
  }

  // 접선: 토글이 켜져 있으면 주황 점 위치에 그리고, 꺼져 있으면 지움
  if (tangentToggle.checked) {
    drawTangent(addedVolume, pH, m);
  } else {
    titrationChart.data.datasets[2].data = [];
    tangentInfo.textContent = "접선 꺼짐";
  }

  // 바뀐 내용을 그래프에 한 번에 반영
  titrationChart.update();
  slopeChart.update();

  // 이분법 과정도 현재 위치 기준으로 다시 보여 줌
  updateBisection();

  // 비커 액체 높이: 전체 부피에 비례 (가득 찬 상태 = 아세트산 + NaOH 최대량)
  const fill = (Va + addedVolume) / (Va + vMax);
  liquid.style.height = (20 + 70 * fill) + "%";

  // 페놀프탈레인 색: pH 8.2 이하 무색 → 10 이상 진한 분홍
  let strength = (pH - 8.2) / (10 - 8.2); // 0 ~ 1 사이 값으로 바꿈
  if (strength < 0) strength = 0;
  if (strength > 1) strength = 1;
  liquid.style.backgroundColor = `rgba(236, 72, 153, ${0.1 + 0.8 * strength})`;
}

// NaOH를 step mL만큼 넣는 함수 (step이 음수면 그만큼 되돌림)
function addBase(step) {
  const before = addedVolume;
  // 0.1을 여러 번 더하면 0.30000000000000004 같은 오차가 생겨서, 소수 둘째 자리에서 반올림
  addedVolume = Math.round((addedVolume + step) * 100) / 100;
  if (addedVolume > vMax) addedVolume = vMax; // 그래프 범위를 넘지 않게
  if (addedVolume < 0) addedVolume = 0;       // 0 mL보다 적게 되돌릴 수는 없게

  // 실제로 더 넣었을 때만 방울을 떨어뜨림 (0.1 mL는 한 방울, 1 mL는 세 방울)
  if (addedVolume > before) dropAnimation(step >= 1 ? 3 : 1);
  updateExperiment();
}


// ---------------------------------------------------------------------
// 6-1. 애니메이션 도우미
// ---------------------------------------------------------------------

// 사용자가 '동작 줄이기'를 켜 두었는지 (켜져 있으면 애니메이션을 생략)
const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

// 뷰렛 꼭지에서 비커 액체 표면까지 방울 떨어뜨리기
function dropAnimation(count) {
  if (reduceMotion) return;
  const tipBottom = buretteTip.offsetTop + buretteTip.offsetHeight; // 꼭지 끝의 높이
  const beaker = liquid.parentElement;
  const surface = beaker.offsetTop + beaker.offsetHeight - liquid.offsetHeight; // 액체 표면 높이

  for (let i = 0; i < count; i++) {
    const drop = document.createElement("span");    // 방울 하나 만들기
    drop.className = "drop";
    drop.style.top = tipBottom + "px";
    drop.style.setProperty("--fall", (surface - tipBottom) + "px"); // 떨어질 거리
    drop.style.animationDelay = (i * 0.15) + "s";    // 여러 방울이면 조금씩 늦게
    apparatus.appendChild(drop);
    drop.addEventListener("animationend", () => drop.remove()); // 다 떨어지면 지움
  }
}

// pH 미터 숫자를 이전 값에서 새 값까지 0.35초 동안 부드럽게 바꾸기
let shownPH = null;   // 지금 화면에 보이는 pH
let phFrame = null;   // 진행 중인 애니메이션 번호 (새 애니메이션이 시작되면 이전 것은 취소)
function showPH(target) {
  if (shownPH === null || reduceMotion) {
    shownPH = target;
    phText.textContent = target.toFixed(2);
    return;
  }
  const start = shownPH;
  const startTime = performance.now();
  cancelAnimationFrame(phFrame);
  function step(now) {
    const t = Math.min((now - startTime) / 350, 1); // 0 → 1 로 진행
    const eased = 1 - Math.pow(1 - t, 3);           // 끝에서 천천히 멈추도록
    shownPH = start + (target - start) * eased;
    phText.textContent = shownPH.toFixed(2);
    if (t < 1) phFrame = requestAnimationFrame(step);
  }
  phFrame = requestAnimationFrame(step);
}


// ---------------------------------------------------------------------
// 7. 접선 계산 (updateExperiment 안에서 주황 점이 움직일 때마다 실행)
//    접선: 점 (V, pH)를 지나고 기울기가 m 인 직선  y = pH + m (x - V)
//    그래프에 반영(update)은 updateExperiment가 마지막에 한 번 합니다.
// ---------------------------------------------------------------------
function drawTangent(V, pH, m) {
  const w = vMax * 0.1; // 접선을 좌우로 얼마나 길게 그릴지

  titrationChart.data.datasets[2].data = [
    { x: V - w, y: pH - m * w },
    { x: V + w, y: pH + m * w },
  ];

  tangentInfo.textContent =
    `${V.toFixed(2)} mL일 때 pH ${pH.toFixed(2)}, 접선 기울기 ${m.toFixed(3)} pH/mL`;
}


// ---------------------------------------------------------------------
// 8. 이분법 과정 보여 주기 (그래프 + 표)
// ---------------------------------------------------------------------
function updateBisection() {
  const { Ca, Cb, Va } = readSettings();
  const V = addedVolume;
  const root = phAt(V, Ca, Cb, Va);          // 50단계까지 반복한 최종 답
  const steps = bisectionSteps(V, Ca, Cb, Va, 12); // 표에는 처음 12단계만

  // (1) 그래프: 근 주변 ±1.5 구간만 확대해서 f(pH)를 그림
  //     (0~14 전체를 그리면 양 끝값이 너무 커서 근 근처가 납작하게 보임)
  let xFrom = root - 1.5;
  let xTo = root + 1.5;
  if (xFrom < 0) xFrom = 0;
  if (xTo > 14) xTo = 14;

  const fCurve = [];
  for (let i = 0; i <= 300; i++) {
    const x = xFrom + (xTo - xFrom) * i / 300;
    fCurve.push({ x: x, y: fOfPH(x, V, Ca, Cb, Va) });
  }

  // 확대한 구간 안에 들어오는 단계의 mid만 점으로 표시 (번호를 글자로 붙임)
  // 근이나 이미 표시한 점과 너무 가까운 점(그래프 폭의 4% 이내)은 겹쳐 보이므로 그래프에서는 생략 (표에는 모두 나옴)
  // 번호 위치: f > 0 인 점은 위, f < 0 인 점은 아래에 써서 서로 겹치지 않게
  const midPoints = [];
  const midLabels = [];
  const midBelow = [];
  const minGap = (xTo - xFrom) * 0.04;
  for (const s of steps) {
    if (s.mid < xFrom || s.mid > xTo) continue;               // 확대 구간 밖
    if (Math.abs(s.mid - root) < minGap) continue;            // 근과 겹침
    let crowded = false;
    for (const p of midPoints) {
      if (Math.abs(s.mid - p.x) < minGap) crowded = true;     // 다른 점과 겹침
    }
    if (crowded) continue;
    midPoints.push({ x: s.mid, y: s.f });
    midLabels.push(String(s.step));
    midBelow.push(s.f < 0);
  }
  bisectionCaption.textContent =
    `근 근처만 확대한 그래프. 번호는 각 단계의 mid 값이다. ` +
    `근에 너무 붙어서 겹치는 단계는 그래프에서 뺐고, 아래 표에는 12단계까지 다 있다.`;

  bisectionChart.data.datasets[0].data = fCurve;
  bisectionChart.data.datasets[1].data = [{ x: xFrom, y: 0 }, { x: xTo, y: 0 }];
  bisectionChart.data.datasets[2].data = midPoints;
  bisectionChart.data.datasets[2].pointLabels = midLabels;
  bisectionChart.data.datasets[2].labelBelow = midBelow;
  bisectionChart.data.datasets[3].data = [{ x: root, y: 0 }];
  bisectionChart.options.scales.x.min = xFrom;
  bisectionChart.options.scales.x.max = xTo;
  bisectionChart.options.plugins.title.text =
    `NaOH ${V.toFixed(1)} mL에서의 f(pH): ${conditionText()}`;
  bisectionChart.update();

  // (2) 표: 단계마다 한 줄씩 만들어 넣기
  let rows = "";
  for (const s of steps) {
    const positive = s.f > 0;
    const next = positive
      ? `[${s.mid.toFixed(4)}, ${s.high.toFixed(4)}]`  // f > 0 → 오른쪽 절반 남김
      : `[${s.low.toFixed(4)}, ${s.mid.toFixed(4)}]`;  // f ≤ 0 → 왼쪽 절반 남김
    rows +=
      `<tr>` +
      `<td>${s.step}</td>` +
      `<td>[${s.low.toFixed(4)}, ${s.high.toFixed(4)}]</td>` +
      `<td>${s.mid.toFixed(4)}</td>` +
      `<td>${s.f.toExponential(2)}</td>` +          // 아주 작은 수라서 지수 표기 (예: 2.35e-3)
      `<td class="${positive ? "plus" : "minus-sign"}">${positive ? "+" : "−"}</td>` +
      `<td>${next}</td>` +
      `</tr>`;
  }
  bisectionBody.innerHTML = rows;

  const width12 = 14 / Math.pow(2, 12);
  bisectionSummary.innerHTML =
    `12단계 후 구간 폭: 14 ÷ 2<sup>12</sup> ≈ ${width12.toFixed(4)}<br>` +
    `실제로는 50단계까지 돌려서 폭을 1.2 × 10<sup>−14</sup> 정도까지 줄임 → <b>pH ${root.toFixed(2)}</b>`;
}


// ---------------------------------------------------------------------
// 9. 실험 데이터 비교 ('비교하기' 버튼)
// ---------------------------------------------------------------------
function compareData() {
  expPoints = parseData(expDataBox.value);
  if (expPoints.length < 3) {
    compareBox.textContent = "데이터가 3줄 이상 있어야 한다. '부피, pH' 형식인지 확인.";
    return;
  }
  const { Ca, Cb, Va } = readSettings();

  // 실험 데이터의 기울기 → 기울기가 가장 큰 곳이 실험 당량점
  const expSlopes = slopes(expPoints);
  if (expSlopes.length === 0) {
    compareBox.textContent = "부피가 서로 다른 데이터가 2개 이상 있어야 기울기를 계산할 수 있다.";
    return;
  }
  const eqExp = findMax(expSlopes);

  // 반당량점(당량점의 절반 부피)의 pH = 실험으로 구한 pKa
  const pKaExp = interpolate(expPoints, eqExp.x / 2);

  // 실험 당량점으로 거꾸로 계산한 아세트산 농도: Ca = Cb × V당량 / Va
  const caExp = Cb * eqExp.x / Va;

  // 이론과의 차이: 각 측정점에서 (측정 pH - 이론 pH)를 제곱해 평균 내고 루트 (RMS 오차)
  let sumSq = 0;
  for (const p of expPoints) {
    const diff = p.y - phAt(p.x, Ca, Cb, Va);
    sumSq += diff * diff;
  }
  const rms = Math.sqrt(sumSq / expPoints.length);

  const vEq = equivalenceVolume(Ca, Cb, Va);
  const eqError = (eqExp.x - vEq) / vEq * 100; // 당량점 상대 오차 (%)

  compareBox.innerHTML =
    `<b>당량점</b> (기울기 최대): ${eqExp.x.toFixed(2)} mL / 이론 ${vEq.toFixed(2)} mL, 오차 ${eqError.toFixed(1)}%<br>` +
    `<b>pKa</b> (반당량점의 pH): ${pKaExp === null ? "데이터 범위 밖" : pKaExp.toFixed(2)} / 문헌값 4.76<br>` +
    `<b>아세트산 농도</b> (당량점으로 역산): ${caExp.toFixed(4)} M / 설정값 ${Ca.toFixed(2)} M<br>` +
    `<b>이론 곡선과의 차이</b> (RMS): pH ${rms.toFixed(2)}`;

  titrationChart.data.datasets[3].data = expPoints;
  slopeChart.data.datasets[1].data = expSlopes;
  titrationChart.update();
  slopeChart.update();
}

function clearData() {
  expPoints = [];
  expDataBox.value = "";
  compareBox.textContent = "";
  titrationChart.data.datasets[3].data = [];
  slopeChart.data.datasets[1].data = [];
  titrationChart.update();
  slopeChart.update();
}


// ---------------------------------------------------------------------
// 10. 이벤트 연결: "이 요소에 이런 일이 생기면 이 함수를 실행해라"
//     "input" 은 슬라이더를 움직이는 동안 계속 발생하는 이벤트입니다.
// ---------------------------------------------------------------------
acidConcSlider.addEventListener("input", updateTheory);
baseConcSlider.addEventListener("input", updateTheory);
acidVolSlider.addEventListener("input", updateTheory);

document.getElementById("add-small").addEventListener("click", () => addBase(0.1));
document.getElementById("add-large").addEventListener("click", () => addBase(1));
document.getElementById("sub-small").addEventListener("click", () => addBase(-0.1));
document.getElementById("sub-large").addEventListener("click", () => addBase(-1));
document.getElementById("reset").addEventListener("click", () => {
  addedVolume = 0;
  updateExperiment();
});

// 토글: 체크 상태가 바뀔 때("change") 화면을 다시 그림
// (켜져 있으면 그리고, 꺼져 있으면 지우는 일은 updateExperiment가 알아서 함)
tangentToggle.addEventListener("change", updateExperiment);
pointToggle.addEventListener("change", updateExperiment);

// 기울기 그래프 세로축: 로그 눈금 ↔ 일반 눈금
logToggle.addEventListener("change", () => {
  const y = slopeChart.options.scales.y;
  if (logToggle.checked) {
    y.type = "logarithmic";
    y.title.text = "기울기 ΔpH/ΔV (pH / mL, 로그 눈금)";
  } else {
    y.type = "linear";
    y.title.text = "기울기 ΔpH/ΔV (pH / mL)";
  }
  slopeChart.update();
});

document.getElementById("compare").addEventListener("click", compareData);
document.getElementById("clear-data").addEventListener("click", clearData);

// 그래프 이미지 저장 버튼 (파일 이름에 조건을 넣어서 나중에 구분하기 쉽게)
document.getElementById("save-titration").addEventListener("click", () => {
  const { Ca, Cb, Va } = readSettings();
  saveChart(titrationChart, `적정곡선_산${Ca}M_${Va}mL_염기${Cb}M.png`);
});
document.getElementById("save-slope").addEventListener("click", () => {
  const { Ca, Cb, Va } = readSettings();
  saveChart(slopeChart, `기울기_산${Ca}M_${Va}mL_염기${Cb}M.png`);
});
document.getElementById("save-bisection").addEventListener("click", () => {
  saveChart(bisectionChart, `이분법_NaOH${addedVolume.toFixed(1)}mL.png`);
});


// ---------------------------------------------------------------------
// 11. 페이지(탭) 나누기
//     탭을 누르면 해당 페이지만 보이고 나머지는 숨김(hidden).
//     주소 끝에 #slope 처럼 표시해 두어서 새로고침해도 같은 페이지가 열림.
// ---------------------------------------------------------------------
const tabs = document.querySelectorAll(".tab");
const pages = document.querySelectorAll(".page");
const chartsByPage = {
  titrate: [titrationChart],
  slope: [slopeChart],
  bisection: [bisectionChart],
  compare: [],
};

function showPage(name) {
  if (!chartsByPage[name]) name = "titrate"; // 모르는 이름이면 첫 페이지로
  for (const tab of tabs) {
    tab.setAttribute("aria-selected", tab.dataset.page === name ? "true" : "false");
  }
  for (const page of pages) {
    page.hidden = page.id !== "page-" + name;
  }
  // 숨겨져 있던 그래프는 크기가 0으로 잡혀 있어서, 보일 때 크기를 다시 계산해야 함
  for (const chart of chartsByPage[name]) chart.resize();
  history.replaceState(null, "", "#" + name);
}

for (const tab of tabs) {
  tab.addEventListener("click", () => showPage(tab.dataset.page));
}


// 소개 상자: 바깥을 누르거나 Esc를 누르면 닫힘
const about = document.getElementById("about");
document.addEventListener("click", (e) => {
  if (about.open && !about.contains(e.target)) about.open = false;
});
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") about.open = false;
});


// ---------------------------------------------------------------------
// 12. 페이지가 처음 열릴 때 한 번 실행
// ---------------------------------------------------------------------
updateTheory();
showPage(location.hash.slice(1)); // 주소의 # 뒷부분 (없으면 첫 페이지)
