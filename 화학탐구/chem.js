// =====================================================================
// chem.js : 계산만 담당하는 파일
// 화면(버튼, 그래프)에 대해서는 아무것도 모릅니다.
// 그래서 F12 콘솔에서 함수만 따로 불러 계산이 맞는지 확인할 수 있어요.
//   예) phAt(25, 0.10, 0.10, 25).toFixed(2)  →  "8.73"
// =====================================================================

// ---------------------------------------------------------------------
// 상수 (const = 한 번 정하면 바꾸지 않는 값)
// ---------------------------------------------------------------------
const KA = Math.pow(10, -4.76); // 아세트산의 산 이온화 상수 Ka (pKa = 4.76)
const KW = 1e-14;               // 물의 이온곱 Kw (25 °C), 1e-14 = 1 × 10^-14


// ---------------------------------------------------------------------
// 1. 전하 균형식 f(h)
//    용액은 전기적으로 중성이므로  [Na+] + [H+] = [OH-] + [CH3COO-]
//    이 식을 한쪽으로 모아서 f(h) = [Na+] + h - [OH-] - [CH3COO-] 로 둡니다.
//    f(h) = 0 이 되는 h(= [H+])가 진짜 답입니다.
//
//    h  : [H+] (mol/L)
//    V  : 넣은 NaOH 부피 (mL)
//    Ca : 아세트산 농도 (M),  Cb : NaOH 농도 (M),  Va : 아세트산 부피 (mL)
// ---------------------------------------------------------------------
function chargeBalance(h, V, Ca, Cb, Va) {
  const na = Cb * V / (Va + V);           // 섞인 뒤 Na+ 농도 (전체 부피로 희석)
  const cTotal = Ca * Va / (Va + V);      // 섞인 뒤 아세트산 전체 농도 (CH3COOH + CH3COO-)
  const oh = KW / h;                      // [OH-] = Kw / [H+]
  const acetate = cTotal * KA / (KA + h); // 그중 이온(CH3COO-)으로 있는 양
  return na + h - oh - acetate;
}


// ---------------------------------------------------------------------
// 2. 이분법으로 pH 구하기
//    - f를 pH에 대한 함수로 보면 pH 0에서 f > 0, pH 14에서 f < 0 입니다.
//    - f는 연속이므로 사잇값 정리에 의해 0과 14 사이에 f = 0 인 pH가 반드시 있습니다.
//    - pH가 커질수록 f는 계속 줄어들기 때문에 그런 pH는 딱 하나뿐입니다.
//    - 구간의 가운데(mid)에서 f의 부호를 보고, 답이 있는 쪽 절반만 남기는 걸 50번 반복합니다.
//      50번이면 구간 폭이 14 ÷ 2^50 ≈ 1.2 × 10^-14 까지 줄어듭니다.
// ---------------------------------------------------------------------
function phAt(V, Ca, Cb, Va) {
  let low = 0;   // 구간의 왼쪽 끝 (pH)
  let high = 14; // 구간의 오른쪽 끝 (pH)

  for (let i = 0; i < 50; i++) {
    const mid = (low + high) / 2;  // 가운데 pH
    const h = Math.pow(10, -mid);  // pH → [H+]  (h = 10^-pH)

    if (chargeBalance(h, V, Ca, Cb, Va) > 0) {
      // f > 0 : [H+]가 아직 너무 많다 → 진짜 pH는 더 높은 쪽(오른쪽)에 있음
      low = mid;
    } else {
      // f ≤ 0 : [H+]가 너무 적다 → 진짜 pH는 더 낮은 쪽(왼쪽)에 있음
      high = mid;
    }
  }
  return (low + high) / 2;
}


// ---------------------------------------------------------------------
// 3. 이론 당량점 부피: 산의 몰수 = 염기의 몰수 가 되는 부피
//    Ca × Va = Cb × V   →   V = Ca × Va / Cb
// ---------------------------------------------------------------------
function equivalenceVolume(Ca, Cb, Va) {
  return Ca * Va / Cb;
}


// ---------------------------------------------------------------------
// 4. 적정 곡선 만들기
//    0 mL부터 vMax mL까지 n칸으로 나눠서 각 부피의 pH를 계산합니다.
//    결과는 Chart.js가 바로 쓸 수 있는 {x: 부피, y: pH} 모양의 배열입니다.
// ---------------------------------------------------------------------
function makeCurve(Ca, Cb, Va, vMax, n) {
  const points = [];                     // 빈 배열로 시작
  for (let i = 0; i <= n; i++) {
    const V = vMax * i / n;
    points.push({ x: V, y: phAt(V, Ca, Cb, Va) }); // 배열 끝에 점 하나 추가
  }
  return points;
}


// ---------------------------------------------------------------------
// 5. 기울기(평균변화율) 계산 ← 미분계수의 근사
//    이웃한 두 점 (V1, pH1), (V2, pH2) 사이의 기울기 = (pH2 - pH1) / (V2 - V1)
//    이 값은 두 점의 한가운데 부피에서의 순간변화율에 가깝다고 보고,
//    x 좌표를 (V1 + V2) / 2 로 둡니다.
//    이론 곡선과 실험 데이터 모두 이 함수로 기울기를 구합니다.
// ---------------------------------------------------------------------
function slopes(points) {
  const result = [];
  for (let i = 0; i < points.length - 1; i++) {
    const dV = points[i + 1].x - points[i].x;
    if (dV <= 0) continue; // 부피가 같은 점이 두 번 있으면 나눌 수 없으니 건너뜀
    const dpH = points[i + 1].y - points[i].y;
    result.push({ x: (points[i].x + points[i + 1].x) / 2, y: dpH / dV });
  }
  return result;
}


// ---------------------------------------------------------------------
// 6. 한 점에서의 접선 기울기 (화면에서 곡선을 클릭했을 때 사용)
//    아주 가까운 두 점 V - d, V + d 의 평균변화율로 미분계수를 근사합니다.
// ---------------------------------------------------------------------
function slopeAt(V, Ca, Cb, Va) {
  const d = 0.001;
  if (V - d < 0) {
    // 0 mL 바로 옆은 왼쪽 점이 없으니 오른쪽 점만 사용
    return (phAt(V + d, Ca, Cb, Va) - phAt(V, Ca, Cb, Va)) / d;
  }
  return (phAt(V + d, Ca, Cb, Va) - phAt(V - d, Ca, Cb, Va)) / (2 * d);
}


// ---------------------------------------------------------------------
// 7. 최댓값 / 최솟값 찾기
//    findMax       : 기울기가 가장 큰 점 → 당량점
//    findMinBetween: xFrom ~ xTo 구간에서 기울기가 가장 작은 점 → 반당량점(완충 구간)
// ---------------------------------------------------------------------
function findMax(points) {
  let best = points[0];
  for (const p of points) {          // 배열의 점을 하나씩 꺼내 p에 담아 반복
    if (p.y > best.y) best = p;
  }
  return best;
}

function findMinBetween(points, xFrom, xTo) {
  let best = null;
  for (const p of points) {
    if (p.x < xFrom || p.x > xTo) continue;   // 구간 밖은 무시
    if (best === null || p.y < best.y) best = p;
  }
  return best;
}


// ---------------------------------------------------------------------
// 8. 선형 보간: 측정한 점들 사이의 값을 직선으로 이어서 추정
//    예) 실험 데이터에서 "부피 12.5 mL일 때 pH"를 구할 때 사용
// ---------------------------------------------------------------------
function interpolate(points, x) {
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i];
    const b = points[i + 1];
    if (a.x <= x && x <= b.x && b.x > a.x) {
      return a.y + (b.y - a.y) * (x - a.x) / (b.x - a.x);
    }
  }
  return null; // 데이터 범위 밖이면 null(값 없음)
}


// ---------------------------------------------------------------------
// 9. 붙여 넣은 실험 데이터(글자)를 점 배열로 바꾸기
//    한 줄에 "부피, pH" 형식. 쉼표·공백·탭 모두 구분자로 인정합니다.
//    엑셀에서 두 열을 복사해서 붙여 넣어도 됩니다.
// ---------------------------------------------------------------------
function parseData(text) {
  const points = [];
  const lines = text.split("\n");                 // 줄 단위로 자르기
  for (const line of lines) {
    const parts = line.trim().split(/[\s,]+/);    // 쉼표나 공백으로 자르기
    if (parts.length < 2) continue;
    const V = Number(parts[0]);
    const pH = Number(parts[1]);
    if (isFinite(V) && isFinite(pH)) {            // 숫자가 아닌 줄(제목 등)은 건너뜀
      points.push({ x: V, y: pH });
    }
  }
  points.sort((a, b) => a.x - b.x);               // 부피 순서로 정렬
  return points;
}


// ---------------------------------------------------------------------
// 10. pH를 넣으면 f 값을 돌려주는 함수
//     (보고서용 f(pH) 그래프를 그릴 때 사용)
// ---------------------------------------------------------------------
function fOfPH(pH, V, Ca, Cb, Va) {
  return chargeBalance(Math.pow(10, -pH), V, Ca, Cb, Va);
}


// ---------------------------------------------------------------------
// 11. 이분법의 각 단계를 기록하기
//     phAt과 똑같은 계산을 하되, 단계마다 구간과 가운데 값, f의 부호를 배열에 저장합니다.
//     보고서용 표와 그래프에 사용합니다.
// ---------------------------------------------------------------------
function bisectionSteps(V, Ca, Cb, Va, nSteps) {
  const steps = [];
  let low = 0;
  let high = 14;
  for (let i = 1; i <= nSteps; i++) {
    const mid = (low + high) / 2;
    const f = fOfPH(mid, V, Ca, Cb, Va);
    steps.push({ step: i, low: low, high: high, mid: mid, f: f });
    if (f > 0) {
      low = mid;
    } else {
      high = mid;
    }
  }
  return steps;
}
