import { useEffect, useRef, useState } from "react";

type Phase = "welcome" | "camera" | "select" | "preview";
type ShotMode = "six" | "four";
// 전면 카메라(렌즈)가 있는 화면 가장자리 — 카운트다운·응시 유도를 그쪽에 배치해
// 숫자를 읽는 시선이 자연스럽게 렌즈를 향하게 합니다. 기기마다 위치가 달라 설정으로 둡니다.
type CamEdge = "top" | "left" | "right";
const CAM_EDGE_KEY = "fourcut-cam-edge";
type ThemeKey = "sunny" | "berry" | "midnight" | "mint" | "lavender" | "ocean";

type Theme = {
  name: string;
  hint: string;
  background: string;
  surface: string;
  ink: string;
  accent: string;
  accentSoft: string;
};

const THEMES: Record<ThemeKey, Theme> = {
  sunny: {
    name: "살구 크림",
    hint: "포근하고 밝게",
    background: "#fff5e4",
    surface: "#fffdf8",
    ink: "#263248",
    accent: "#ff765f",
    accentSoft: "#ffd9ca",
  },
  berry: {
    name: "베리 팝",
    hint: "발랄하고 선명하게",
    background: "#ffe8f1",
    surface: "#fff8fb",
    ink: "#44263c",
    accent: "#e94486",
    accentSoft: "#ffc4dc",
  },
  midnight: {
    name: "미드나잇",
    hint: "차분하고 멋지게",
    background: "#182237",
    surface: "#26334d",
    ink: "#f9f5ea",
    accent: "#67d9cb",
    accentSoft: "#2e716e",
  },
  mint: {
    name: "민트 소다",
    hint: "상큼하고 시원하게",
    background: "#e4f7ef",
    surface: "#f6fffb",
    ink: "#1f4a3d",
    accent: "#17b890",
    accentSoft: "#bff0dd",
  },
  lavender: {
    name: "라벤더",
    hint: "은은하고 사랑스럽게",
    background: "#efe9ff",
    surface: "#faf8ff",
    ink: "#3a2f57",
    accent: "#7c5cff",
    accentSoft: "#dccfff",
  },
  ocean: {
    name: "오션 블루",
    hint: "맑고 청량하게",
    background: "#e5f0ff",
    surface: "#f5faff",
    ink: "#213453",
    accent: "#2f7dff",
    accentSoft: "#c4ddff",
  },
};

type FilterKey = "none" | "soft" | "glow" | "vivid" | "warm" | "cool" | "mono" | "vintage";

type FilterDef = {
  key: FilterKey;
  name: string;
  css: string; // 결과물(캔버스)에 굽는 기본 보정. CSS filter 문법과 동일.
  previewCss?: string; // 라이브 미리보기(비디오)용. 없으면 css 사용.
  bloom?: number; // 뽀샤시 글로우 세기(0~1). 밝은 부분을 흐릿하게 덧입혀 은은하게 번지게 함.
};

const FILTERS: FilterDef[] = [
  { key: "none", name: "원본", css: "none" },
  {
    key: "soft",
    name: "뽀샤시",
    css: "brightness(1.12) contrast(0.9) saturate(1.06) sepia(0.04)",
    previewCss: "brightness(1.2) contrast(0.9) saturate(1.06) sepia(0.04) blur(1.4px)",
    bloom: 1,
  },
  {
    key: "glow",
    name: "화사",
    css: "brightness(1.1) contrast(0.94) saturate(1.14) sepia(0.04)",
    previewCss: "brightness(1.14) contrast(0.94) saturate(1.14) sepia(0.04) blur(0.6px)",
    bloom: 0.5,
  },
  { key: "vivid", name: "선명", css: "saturate(1.5) contrast(1.12)" },
  { key: "warm", name: "따뜻", css: "sepia(0.3) saturate(1.35) brightness(1.06)" },
  { key: "cool", name: "시원", css: "saturate(1.16) contrast(1.05) brightness(1.04) hue-rotate(-12deg)" },
  { key: "mono", name: "흑백", css: "grayscale(1) contrast(1.1) brightness(1.03)" },
  { key: "vintage", name: "빈티지", css: "sepia(0.5) contrast(1.02) brightness(1.04) saturate(1.2)" },
];

const sleep = (milliseconds: number) => new Promise((resolve) => window.setTimeout(resolve, milliseconds));

// ── 사운드 (Web Audio 합성 — 오디오 파일 없이 동작) ─────────────────
// AudioContext 는 사용자 제스처(촬영 시작 버튼) 안에서 resume 해야 iPad Safari 에서 소리가 납니다.
let audioContext: AudioContext | null = null;

function ensureAudio(): AudioContext | null {
  try {
    if (!audioContext) audioContext = new AudioContext();
    // iOS WebKit 은 전화·Siri 인터럽션 후 비표준 "interrupted" 상태가 될 수 있어
    // "suspended" 만이 아니라 running 이 아닌 모든 상태에서 resume 합니다.
    if (audioContext.state !== "running") audioContext.resume().catch(() => undefined);
    return audioContext;
  } catch {
    return null;
  }
}

// 카운트다운 틱 — 마지막 1초는 높은 음으로 긴장감을 줍니다.
function playBeep(frequency: number, durationMs: number, volume = 0.12) {
  const context = ensureAudio();
  if (!context) return;
  const oscillator = context.createOscillator();
  const gain = context.createGain();
  oscillator.type = "sine";
  oscillator.frequency.value = frequency;
  gain.gain.setValueAtTime(volume, context.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, context.currentTime + durationMs / 1000);
  oscillator.connect(gain).connect(context.destination);
  oscillator.start();
  oscillator.stop(context.currentTime + durationMs / 1000);
}

// 셔터음 — 짧은 화이트노이즈 + 로우패스로 "찰칵" 느낌을 만듭니다.
function playShutter() {
  const context = ensureAudio();
  if (!context) return;
  const length = Math.floor(context.sampleRate * 0.09);
  const buffer = context.createBuffer(1, length, context.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < length; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / length);
  const source = context.createBufferSource();
  source.buffer = buffer;
  const filter = context.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.value = 2600;
  const gain = context.createGain();
  gain.gain.value = 0.3;
  source.connect(filter).connect(gain).connect(context.destination);
  source.start();
}

function drawCover(
  context: CanvasRenderingContext2D,
  image: CanvasImageSource,
  sourceWidth: number,
  sourceHeight: number,
  x: number,
  y: number,
  width: number,
  height: number,
) {
  const scale = Math.max(width / sourceWidth, height / sourceHeight);
  const cropWidth = width / scale;
  const cropHeight = height / scale;
  const sourceX = (sourceWidth - cropWidth) / 2;
  const sourceY = (sourceHeight - cropHeight) / 2;
  context.drawImage(image, sourceX, sourceY, cropWidth, cropHeight, x, y, width, height);
}

function roundedRect(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
) {
  const safeRadius = Math.min(radius, width / 2, height / 2);
  context.beginPath();
  context.moveTo(x + safeRadius, y);
  context.arcTo(x + width, y, x + width, y + height, safeRadius);
  context.arcTo(x + width, y + height, x, y + height, safeRadius);
  context.arcTo(x, y + height, x, y, safeRadius);
  context.arcTo(x, y, x + width, y, safeRadius);
  context.closePath();
}

function loadImage(source: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("사진을 불러오지 못했습니다."));
    image.src = source;
  });
}

// ── 필터 엔진 ──────────────────────────────────────────────────────
// 캔버스 context.filter 는 현행 iPadOS 전 버전에서 실험 플래그 뒤에 있어 비활성입니다
// (2026-07 기준, WebKit 구현은 있으나 기본 꺼짐) — 즉 iPad 는 항상 아래 픽셀 폴백을 탑니다.
// 감지는 실제 1×1 픽셀에 grayscale 을 적용해 결과를 읽어 확인하므로, 파싱만 되고
// 렌더링이 안 되는 구현이나 향후 플래그 활성화에도 안전합니다. (Chrome 등은 네이티브 GPU 경로)

const supportsCanvasFilter = (() => {
  try {
    const probe = document.createElement("canvas");
    probe.width = probe.height = 1;
    const context = probe.getContext("2d", { willReadFrequently: true });
    if (!context || typeof context.filter !== "string") return false;
    const red = document.createElement("canvas");
    red.width = red.height = 1;
    const redContext = red.getContext("2d")!;
    redContext.fillStyle = "#f00";
    redContext.fillRect(0, 0, 1, 1);
    context.filter = "grayscale(1)";
    context.drawImage(red, 0, 0);
    const [r, g, b] = context.getImageData(0, 0, 1, 1).data;
    return r === g && g === b; // 필터가 실제로 렌더링에 적용됐는지 확인
  } catch {
    return false;
  }
})();

// 네이티브 filter 로 사본을 만듭니다(지원 기기 전용, GPU 가속).
function filteredCopy(source: HTMLCanvasElement, css: string): HTMLCanvasElement {
  const out = document.createElement("canvas");
  out.width = source.width;
  out.height = source.height;
  const context = out.getContext("2d", { alpha: false })!;
  context.filter = css;
  context.drawImage(source, 0, 0);
  context.filter = "none";
  return out;
}

const saturateMatrix = (s: number) => [
  0.213 + 0.787 * s, 0.715 - 0.715 * s, 0.072 - 0.072 * s,
  0.213 - 0.213 * s, 0.715 + 0.285 * s, 0.072 - 0.072 * s,
  0.213 - 0.213 * s, 0.715 - 0.715 * s, 0.072 + 0.928 * s,
];

const sepiaMatrix = (a: number) => {
  const k = 1 - a;
  return [
    0.393 + 0.607 * k, 0.769 - 0.769 * k, 0.189 - 0.189 * k,
    0.349 - 0.349 * k, 0.686 + 0.314 * k, 0.168 - 0.168 * k,
    0.272 - 0.272 * k, 0.534 - 0.534 * k, 0.131 + 0.869 * k,
  ];
};

const hueRotateMatrix = (deg: number) => {
  const rad = (deg * Math.PI) / 180;
  const c = Math.cos(rad);
  const s = Math.sin(rad);
  return [
    0.213 + c * 0.787 - s * 0.213, 0.715 - c * 0.715 - s * 0.715, 0.072 - c * 0.072 + s * 0.928,
    0.213 - c * 0.213 + s * 0.143, 0.715 + c * 0.285 + s * 0.14, 0.072 - c * 0.072 - s * 0.283,
    0.213 - c * 0.213 - s * 0.787, 0.715 - c * 0.715 + s * 0.715, 0.072 + c * 0.928 + s * 0.072,
  ];
};

// CSS filter 문자열(blur 제외)을 단계별 행렬+오프셋 목록으로 파싱합니다.
// CSS 필터는 각 단계 결과를 [0,255]로 클램프한 뒤 다음 단계에 넘기므로(8비트 중간 버퍼),
// 미리보기와 정확히 일치하려면 하나의 행렬로 합성하지 않고 단계별로 적용·클램프해야 합니다.
// (사전 합성 방식은 뽀샤시·화사의 하이라이트에서 미리보기 대비 최대 Δ14 오차 실측 → 단계별은 Δ2 이하)
type FilterStep = { m: number[]; o: number[] };

function parseFilterSteps(css: string): FilterStep[] {
  const steps: FilterStep[] = [];
  const scale = (v: number) => [v, 0, 0, 0, v, 0, 0, 0, v];
  const regex = /([\w-]+)\(([^)]+)\)/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(css))) {
    const fn = match[1];
    const raw = match[2].trim();
    const value = raw.endsWith("%") ? parseFloat(raw) / 100 : parseFloat(raw);
    if (Number.isNaN(value)) continue;
    if (fn === "brightness") steps.push({ m: scale(value), o: [0, 0, 0] });
    else if (fn === "contrast") steps.push({ m: scale(value), o: Array(3).fill(127.5 * (1 - value)) });
    else if (fn === "saturate") steps.push({ m: saturateMatrix(value), o: [0, 0, 0] });
    else if (fn === "grayscale") steps.push({ m: saturateMatrix(1 - value), o: [0, 0, 0] });
    else if (fn === "sepia") steps.push({ m: sepiaMatrix(value), o: [0, 0, 0] });
    else if (fn === "hue-rotate") steps.push({ m: hueRotateMatrix(value), o: [0, 0, 0] });
    // blur() 등은 여기서 무시 — 공간 필터는 softenPixels/글로우 단계에서 처리합니다.
  }
  return steps;
}

const clamp255 = (v: number) => (v < 0 ? 0 : v > 255 ? 255 : v);

// 캔버스 픽셀에 필터를 직접 적용합니다(ctx.filter 미지원 기기 폴백).
function filterCanvasPixels(context: CanvasRenderingContext2D, width: number, height: number, css: string) {
  const steps = parseFilterSteps(css);
  if (!steps.length) return;
  const image = context.getImageData(0, 0, width, height);
  const data = image.data;
  const stepCount = steps.length;
  for (let i = 0; i < data.length; i += 4) {
    let r = data[i];
    let g = data[i + 1];
    let b = data[i + 2];
    for (let s = 0; s < stepCount; s += 1) {
      const m = steps[s].m;
      const o = steps[s].o;
      const nr = clamp255(m[0] * r + m[1] * g + m[2] * b + o[0]);
      const ng = clamp255(m[3] * r + m[4] * g + m[5] * b + o[1]);
      const nb = clamp255(m[6] * r + m[7] * g + m[8] * b + o[2]);
      r = nr;
      g = ng;
      b = nb;
    }
    data[i] = r;
    data[i + 1] = g;
    data[i + 2] = b;
  }
  context.putImageData(image, 0, 0);
}

// 약한 소프트닝(피부 결 정리) 폴백 — 미리보기의 blur(N px) = σ N/2 가우시안을
// 분리형 3탭 커널 [w, 1-2w, w] 로 근사합니다. 커널 분산 = 2w 이므로 w = σ²/(2·패스수).
// 고정 박스(σ0.58)가 아니라 σ에 맞춘 가변 커널이라 화사(blur 0.6px, σ0.33)처럼
// 아주 약한 블러도 미리보기보다 과하게 뭉개지 않습니다.
function softenPixels(context: CanvasRenderingContext2D, width: number, height: number, sigma: number) {
  const passes = sigma > 0.81 ? 2 : 1;
  const w = Math.min(1 / 3, (sigma * sigma) / (2 * passes));
  if (w <= 0.005) return;
  const center = 1 - 2 * w;
  const image = context.getImageData(0, 0, width, height);
  const data = image.data;
  const line = new Float32Array(Math.max(width, height) * 3);
  for (let pass = 0; pass < passes; pass += 1) {
    // 가로 방향
    for (let y = 0; y < height; y += 1) {
      const rowStart = y * width * 4;
      for (let x = 0; x < width; x += 1) {
        const i = rowStart + x * 4;
        line[x * 3] = data[i];
        line[x * 3 + 1] = data[i + 1];
        line[x * 3 + 2] = data[i + 2];
      }
      for (let x = 1; x < width - 1; x += 1) {
        const i = rowStart + x * 4;
        data[i] = line[(x - 1) * 3] * w + line[x * 3] * center + line[(x + 1) * 3] * w;
        data[i + 1] = line[(x - 1) * 3 + 1] * w + line[x * 3 + 1] * center + line[(x + 1) * 3 + 1] * w;
        data[i + 2] = line[(x - 1) * 3 + 2] * w + line[x * 3 + 2] * center + line[(x + 1) * 3 + 2] * w;
      }
    }
    // 세로 방향
    for (let x = 0; x < width; x += 1) {
      for (let y = 0; y < height; y += 1) {
        const i = (y * width + x) * 4;
        line[y * 3] = data[i];
        line[y * 3 + 1] = data[i + 1];
        line[y * 3 + 2] = data[i + 2];
      }
      for (let y = 1; y < height - 1; y += 1) {
        const i = (y * width + x) * 4;
        data[i] = line[(y - 1) * 3] * w + line[y * 3] * center + line[(y + 1) * 3] * w;
        data[i + 1] = line[(y - 1) * 3 + 1] * w + line[y * 3 + 1] * center + line[(y + 1) * 3 + 1] * w;
        data[i + 2] = line[(y - 1) * 3 + 2] * w + line[y * 3 + 2] * center + line[(y + 1) * 3 + 2] * w;
      }
    }
  }
  context.putImageData(image, 0, 0);
}

// context.filter 없이 흐림 효과: 축소했다가 다시 확대하면 자연스럽게 뭉개집니다(모든 기기 지원).
function makeBlurredCanvas(source: HTMLCanvasElement, width: number, height: number, downscale: number) {
  const smallWidth = Math.max(1, Math.round(width / downscale));
  const smallHeight = Math.max(1, Math.round(height / downscale));
  const small = document.createElement("canvas");
  small.width = smallWidth;
  small.height = smallHeight;
  const smallContext = small.getContext("2d")!;
  smallContext.imageSmoothingEnabled = true;
  smallContext.drawImage(source, 0, 0, smallWidth, smallHeight);
  const output = document.createElement("canvas");
  output.width = width;
  output.height = height;
  const outputContext = output.getContext("2d")!;
  outputContext.imageSmoothingEnabled = true;
  outputContext.imageSmoothingQuality = "high";
  outputContext.drawImage(small, 0, 0, width, height);
  return output;
}

// 미리보기에서 보이는 영역과 인쇄되는 영역을 똑같이 맞추기 위해,
// 촬영 순간 화면을 인쇄 셀과 같은 가로세로비(PHOTO_RATIO)로 중앙 크롭합니다.
const PHOTO_RATIO = 520 / 316;

// 라이브 프레임 한 장을 인쇄 비율로 중앙 크롭 + 좌우 반전해 캔버스로 만듭니다(필터 미적용).
function grabFrame(video: HTMLVideoElement): HTMLCanvasElement {
  const sourceWidth = video.videoWidth;
  const sourceHeight = video.videoHeight;
  if (!sourceWidth || !sourceHeight) throw new Error("카메라 화면이 아직 준비되지 않았습니다.");

  let cropWidth = sourceWidth;
  let cropHeight = Math.round(sourceWidth / PHOTO_RATIO);
  if (cropHeight > sourceHeight) {
    cropHeight = sourceHeight;
    cropWidth = Math.round(sourceHeight * PHOTO_RATIO);
  }
  const sourceX = (sourceWidth - cropWidth) / 2;
  const sourceY = (sourceHeight - cropHeight) / 2;

  const outputWidth = Math.min(cropWidth, 1040);
  const outputHeight = Math.round(outputWidth / PHOTO_RATIO);
  const canvas = document.createElement("canvas");
  canvas.width = outputWidth;
  canvas.height = outputHeight;
  // 픽셀 폴백 경로에서 getImageData 를 반복하므로 CPU 백킹 힌트를 줍니다(GPU 리드백 스톨 방지).
  const context = canvas.getContext("2d", { alpha: false, willReadFrequently: !supportsCanvasFilter });
  if (!context) throw new Error("사진을 만들 수 없습니다.");
  // 전면 카메라 미리보기(좌우 반전)와 동일하게 보이도록 좌우 반전해 저장합니다.
  context.translate(outputWidth, 0);
  context.scale(-1, 1);
  context.drawImage(video, sourceX, sourceY, cropWidth, cropHeight, 0, 0, outputWidth, outputHeight);
  context.setTransform(1, 0, 0, 1, 0, 0); // 이후 연산을 위해 변환 초기화
  return canvas;
}

// 선명도 점수(인접 픽셀 밝기차의 합) — 클수록 덜 흔들린(또렷한) 프레임입니다.
// 순위 판별에는 해상도가 필요 없어 1/4 축소 사본에서 채점합니다(데이터량 1/16).
function sharpnessScore(canvas: HTMLCanvasElement): number {
  const width = Math.max(1, Math.round(canvas.width / 4));
  const height = Math.max(1, Math.round(canvas.height / 4));
  const small = document.createElement("canvas");
  small.width = width;
  small.height = height;
  const context = small.getContext("2d", { alpha: false, willReadFrequently: true });
  if (!context) return 0;
  context.drawImage(canvas, 0, 0, width, height);
  const data = context.getImageData(0, 0, width, height).data;
  const luma = (i: number) => data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114;
  let sum = 0;
  for (let y = 1; y < height; y += 1) {
    for (let x = 1; x < width; x += 1) {
      const i = (y * width + x) * 4;
      const value = luma(i);
      sum += Math.abs(value - luma(i - 4)) + Math.abs(value - luma(i - width * 4));
    }
  }
  return sum;
}

// 다음 실제 비디오 프레임까지 대기 — 고정 슬립 대신 새 프레임에 맞춰 후보를 잡습니다.
// 카메라 인터럽션 등으로 프레임이 멈추면 콜백이 영영 안 올 수 있어 200ms 상한을 둡니다
// (상한 없이는 촬영 시퀀스가 shooting=true 로 고착되어 새로고침 외 복구 불가).
function nextVideoFrame(video: HTMLVideoElement) {
  return new Promise<void>((resolve) => {
    const request = (video as HTMLVideoElement & {
      requestVideoFrameCallback?: (callback: () => void) => void;
    }).requestVideoFrameCallback;
    if (typeof request !== "function") {
      window.setTimeout(resolve, 45);
      return;
    }
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      resolve();
    };
    const timer = window.setTimeout(finish, 200);
    request.call(video, finish);
  });
}

// ── WYSIWYG 베이크 ─────────────────────────────────────────────────
// 결과물이 라이브 미리보기와 똑같아 보이도록, 미리보기 화면의 레이어 구성을 그대로 굽습니다:
//   ① 메인: previewCss(밝기·색 보정 + 약한 소프트닝 블러 — 피부 결 정리)
//   ② 글로우(뽀샤시 계열): css+blur+brightness(1.32) 사본을 screen 블렌드(α = bloom×0.72)
// 이전에는 메인에 css(어두운 버전)만 굽고 소프트닝이 빠져, 결과물이 미리보기보다
// 어둡고(Δ밝기 ≈ 13) 노이즈가 3.5배 남는 문제가 실측으로 확인되었습니다.
// 미리보기 blur 값은 표시 크기(≈940px) 기준 CSS px 이므로 캡처 해상도로 환산합니다.
const PREVIEW_REFERENCE_WIDTH = 940;

const extractBlurPx = (css: string) => {
  const match = /blur\(([\d.]+)px\)/.exec(css);
  return match ? parseFloat(match[1]) : 0;
};

const scaleBlur = (css: string, scale: number) =>
  css.replace(/blur\(([\d.]+)px\)/g, (_, v) => `blur(${(parseFloat(v) * scale).toFixed(1)}px)`);

function bakePreviewLook(source: HTMLCanvasElement, filter: FilterDef): HTMLCanvasElement {
  const width = source.width;
  const height = source.height;
  const scale = width / PREVIEW_REFERENCE_WIDTH;
  const mainCss = filter.previewCss ?? filter.css;
  const bloom = filter.bloom ?? 0;

  // ① 메인 레이어
  let main: HTMLCanvasElement;
  if (supportsCanvasFilter) {
    main = mainCss === "none" ? source : filteredCopy(source, scaleBlur(mainCss, scale));
  } else {
    main = source;
    if (mainCss !== "none") {
      const context = main.getContext("2d", { alpha: false })!;
      filterCanvasPixels(context, width, height, mainCss);
      const blurPx = extractBlurPx(mainCss) * scale;
      // CSS blur(N px) = σ N/2 — σ를 그대로 전달해 커널이 세기를 맞춥니다
      if (blurPx > 0.2) softenPixels(context, width, height, blurPx / 2);
    }
  }

  // ② 글로우 레이어 (미리보기의 cam-glow 비디오와 동일 구성)
  if (bloom > 0) {
    const glowBase = `${filter.css === "none" ? "" : filter.css} brightness(1.32)`.trim();
    let glow: HTMLCanvasElement;
    if (supportsCanvasFilter) {
      glow = filteredCopy(source, `${filter.css === "none" ? "" : filter.css} blur(${Math.round(10 * scale)}px) brightness(1.32)`.trim());
    } else {
      glow = makeBlurredCanvas(source, width, height, 9);
      const glowContext = glow.getContext("2d", { willReadFrequently: true })!;
      filterCanvasPixels(glowContext, width, height, glowBase);
    }
    const context = main.getContext("2d", { alpha: false })!;
    context.globalCompositeOperation = "screen";
    context.globalAlpha = bloom * 0.72;
    context.drawImage(glow, 0, 0);
    context.globalAlpha = 1;
    context.globalCompositeOperation = "source-over";
  }
  return main;
}

async function captureVideoFrame(video: HTMLVideoElement, filter: FilterDef) {
  // 짧은 순간 여러 프레임을 잡아 가장 선명한(덜 흔들린) 프레임을 고릅니다 — 모션 블러 완화.
  let best: HTMLCanvasElement | null = null;
  let bestScore = -1;
  const attempts = 3;
  for (let i = 0; i < attempts; i += 1) {
    const candidate = grabFrame(video);
    const score = sharpnessScore(candidate);
    if (score > bestScore) {
      bestScore = score;
      best = candidate;
    }
    if (i < attempts - 1) await nextVideoFrame(video);
  }

  const canvas = bakePreviewLook(best as HTMLCanvasElement, filter);
  return canvas.toDataURL("image/jpeg", 0.92);
}

async function composeFourCut(images: string[], theme: Theme, eventName: string) {
  const loaded = await Promise.all(images.map(loadImage));
  const canvas = document.createElement("canvas");
  // 인쇄(4×6", 300dpi)에는 1200×1800 이면 충분하지만, 폰으로 저장·확대해 보는 화질을 위해
  // 2배(2400×3600)로 합성합니다 — 사진 셀이 1040×632 가 되어 캡처 해상도와 1:1(무손실)입니다.
  // 아래 그리기 코드는 기존 1200×1800 좌표계를 그대로 쓰도록 scale(2,2)를 적용합니다.
  canvas.width = 2400;
  canvas.height = 3600;
  const context = canvas.getContext("2d", { alpha: false });
  if (!context) throw new Error("네컷 이미지를 만들 수 없습니다.");
  context.scale(2, 2);
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";

  const drawStrip = (offsetX: number, stripNumber: number) => {
    context.fillStyle = theme.background;
    context.fillRect(offsetX, 0, 600, 1800);

    context.globalAlpha = 0.65;
    context.fillStyle = theme.accentSoft;
    context.beginPath();
    context.arc(offsetX + 65, 56, 52, 0, Math.PI * 2);
    context.fill();
    context.beginPath();
    context.arc(offsetX + 548, 1730, 72, 0, Math.PI * 2);
    context.fill();
    context.globalAlpha = 1;

    context.fillStyle = theme.ink;
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.font = "800 52px -apple-system, BlinkMacSystemFont, 'Apple SD Gothic Neo', sans-serif";
    context.fillText("Happy with u", offsetX + 300, 78);
    context.fillStyle = theme.accent;
    context.font = "700 19px -apple-system, BlinkMacSystemFont, 'Apple SD Gothic Neo', sans-serif";
    context.fillText("FOUR MOMENTS, ONE MEMORY", offsetX + 300, 124);

    const photoX = offsetX + 40;
    const photoWidth = 520;
    const photoHeight = 316;
    const firstY = 166;
    const gap = 18;

    loaded.forEach((image, index) => {
      const y = firstY + index * (photoHeight + gap);
      context.save();
      roundedRect(context, photoX, y, photoWidth, photoHeight, 18);
      context.clip();
      drawCover(context, image, image.naturalWidth, image.naturalHeight, photoX, y, photoWidth, photoHeight);
      context.restore();
    });

    const safeName = eventName.trim() || "오늘의 우리";
    context.fillStyle = theme.ink;
    context.font = "800 38px -apple-system, BlinkMacSystemFont, 'Apple SD Gothic Neo', sans-serif";
    context.fillText(safeName, offsetX + 300, 1570, 490);
    context.fillStyle = theme.accent;
    roundedRect(context, offsetX + 185, 1610, 230, 44, 22);
    context.fill();
    context.fillStyle = theme.surface;
    context.font = "700 19px -apple-system, BlinkMacSystemFont, 'Apple SD Gothic Neo', sans-serif";
    context.fillText("함께라서 더 반짝이는 순간", offsetX + 300, 1633);

    const date = new Intl.DateTimeFormat("ko-KR", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date());
    context.fillStyle = theme.ink;
    context.globalAlpha = 0.62;
    context.font = "600 21px ui-monospace, SFMono-Regular, Menlo, monospace";
    context.fillText(`${date}  ·  #${String(stripNumber).padStart(2, "0")}`, offsetX + 300, 1691);
    context.globalAlpha = 1;
  };

  drawStrip(0, 1);
  drawStrip(600, 2);
  context.strokeStyle = "rgba(255,255,255,0.72)";
  context.lineWidth = 4;
  context.setLineDash([18, 14]);
  context.beginPath();
  context.moveTo(600, 18);
  context.lineTo(600, 1782);
  context.stroke();

  // 2400×3600 이라 0.92 로도 인쇄·확대 화질이 충분하고 파일 크기를 줄입니다.
  return canvas.toDataURL("image/jpeg", 0.92);
}

function makeSampleFrames(filter?: FilterDef) {
  const palettes = [
    ["#f7b3c9", "#814d6a"],
    ["#a8d9d4", "#2b716f"],
    ["#f6cf83", "#8c572e"],
    ["#b9c6ef", "#4c568f"],
  ];
  return palettes.map(([background, ink], index) => {
    const canvas = document.createElement("canvas");
    canvas.width = 1200;
    canvas.height = 800;
    const context = canvas.getContext("2d")!;
    context.fillStyle = background;
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.fillStyle = "rgba(255,255,255,.5)";
    context.beginPath();
    context.arc(250 + index * 60, 170, 150, 0, Math.PI * 2);
    context.fill();
    context.fillStyle = ink;
    context.beginPath();
    context.arc(600, 335, 160, 0, Math.PI * 2);
    context.fill();
    context.fillStyle = background;
    context.beginPath();
    context.arc(545, 310, 16, 0, Math.PI * 2);
    context.arc(655, 310, 16, 0, Math.PI * 2);
    context.fill();
    context.strokeStyle = background;
    context.lineWidth = 18;
    context.lineCap = "round";
    context.beginPath();
    context.arc(600, 355, 70, 0.2, Math.PI - 0.2);
    context.stroke();
    context.fillStyle = "rgba(255,255,255,.82)";
    context.font = "800 54px -apple-system, sans-serif";
    context.textAlign = "center";
    context.fillText(`SAMPLE ${index + 1}`, 600, 690);
    // 촬영 결과물과 동일하게: 미리보기 스택을 그대로 굽기
    const out = filter && filter.key !== "none" ? bakePreviewLook(canvas, filter) : canvas;
    return out.toDataURL("image/jpeg", 0.9);
  });
}

function Icon({ name }: { name: "camera" | "qr" | "print" | "download" | "redo" | "sparkle" | "video" }) {
  const paths = {
    video: <><rect x="3" y="6" width="13" height="12" rx="2"/><path d="m16 10.5 5-3v9l-5-3z"/></>,
    camera: <><path d="M5 8h14a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2Z"/><path d="m8 8 1.5-3h5L16 8"/><circle cx="12" cy="14" r="3.5"/></>,
    qr: <><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><path d="M14 14h3v3h-3zM18 18h3v3h-3zM14 20h2M20 14h1v2"/></>,
    print: <><path d="M7 8V3h10v5M7 17H5a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><path d="M7 14h10v7H7z"/></>,
    download: <><path d="M12 3v12M7 10l5 5 5-5"/><path d="M4 20h16"/></>,
    redo: <><path d="M20 11a8 8 0 1 0-2.3 5.7"/><path d="M20 4v7h-7"/></>,
    sparkle: <><path d="m12 3 1.5 4.5L18 9l-4.5 1.5L12 15l-1.5-4.5L6 9l4.5-1.5L12 3Z"/><path d="m19 15 .7 2.3L22 18l-2.3.7L19 21l-.7-2.3L16 18l2.3-.7L19 15Z"/></>,
  };
  return <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">{paths[name]}</svg>;
}

export default function App() {
  const [phase, setPhase] = useState<Phase>("welcome");
  const [themeKey, setThemeKey] = useState<ThemeKey>("sunny");
  const [filterKey, setFilterKey] = useState<FilterKey>("none");
  const [shotMode, setShotMode] = useState<ShotMode>("six");
  const [camEdge, setCamEdge] = useState<CamEdge>(() => {
    const saved = localStorage.getItem(CAM_EDGE_KEY);
    return saved === "left" || saved === "right" ? saved : "top";
  });
  const [picked, setPicked] = useState<number[]>([]);
  const [composing, setComposing] = useState(false);
  const [eventName, setEventName] = useState("너와 나 그리고 우리");
  const [privacyChecked, setPrivacyChecked] = useState(false);
  const [cameraReady, setCameraReady] = useState(false);
  const [shooting, setShooting] = useState(false);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [shotCount, setShotCount] = useState(0);
  const [shots, setShots] = useState<string[]>([]);
  const [flash, setFlash] = useState(false);
  const [status, setStatus] = useState("준비되면 촬영 버튼을 눌러주세요");
  const [composite, setComposite] = useState<string | null>(null);
  // 전면 카메라가 실제로 주는 해상도(진단용 — 화질 문의 시 확인)
  const [camRes, setCamRes] = useState<string | null>(null);
  const [clip, setClip] = useState<{ url: string; blob: Blob; ext: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const glowVideoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  // 촬영 시퀀스의 세대 번호. reset 등으로 증가하면 진행 중이던 시퀀스가 스스로 중단됩니다.
  const runGenRef = useRef(0);

  const pickCamEdge = (edge: CamEdge) => {
    setCamEdge(edge);
    try {
      localStorage.setItem(CAM_EDGE_KEY, edge);
    } catch {
      // 프라이빗 모드 등 저장 불가 시 세션 동안만 유지
    }
  };

  const theme = THEMES[themeKey];
  const totalShots = shotMode === "six" ? 6 : 4;
  const activeFilter = FILTERS.find((item) => item.key === filterKey) ?? FILTERS[0];
  // 라이브 미리보기용 값: 기본 보정(메인 레이어)과 글로우 레이어(스크린 블렌드) 세기
  const previewFilter = activeFilter.previewCss ?? activeFilter.css;
  const glowStrength = activeFilter.bloom ?? 0;
  const glowLayerFilter = `${activeFilter.css === "none" ? "" : activeFilter.css} blur(10px) brightness(1.32)`.trim();

  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("sample") === "1") {
      composeFourCut(makeSampleFrames(), THEMES.sunny, "너와 나 그리고 우리")
        .then((result) => {
          setComposite(result);
          setPhase("preview");
        })
        .catch(() => undefined);
    }
  }, []);

  const stopCamera = () => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    setCameraReady(false);
  };

  useEffect(() => () => stopCamera(), []);

  // 영상 blob URL 누수 방지: clip 이 바뀌거나 언마운트될 때 이전 URL 해제
  useEffect(() => () => { if (clip) URL.revokeObjectURL(clip.url); }, [clip]);

  useEffect(() => {
    if (phase === "camera" && streamRef.current) {
      for (const element of [videoRef.current, glowVideoRef.current]) {
        if (!element) continue;
        element.srcObject = streamRef.current;
        element.play().catch(() => undefined);
      }
      // 재사용한 스트림은 canplay 가 다시 안 뜰 수 있어, 이미 준비된 경우 바로 활성화합니다.
      if (videoRef.current && videoRef.current.readyState >= 2) setCameraReady(true);
    }
  }, [phase]);

  const startCamera = async () => {
    setError(null);
    setComposite(null);
    setShotCount(0);
    setShots([]);
    if (!navigator.mediaDevices?.getUserMedia) {
      setError("카메라를 사용할 수 없습니다. iPad의 Safari에서 HTTPS 주소로 열어주세요.");
      return;
    }
    try {
      setCameraReady(false);
      const existing = streamRef.current;
      const hasLiveStream = !!existing && existing.getVideoTracks().some((track) => track.readyState === "live");
      if (!hasLiveStream) {
        // 최초 1회만 권한을 요청하고, 이후에는 이 스트림을 재사용해 권한 팝업이 다시 뜨지 않게 합니다.
        streamRef.current = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: {
            facingMode: "user",
            width: { ideal: 1920 },
            height: { ideal: 1080 },
          },
        });
      }
      setPhase("camera");
      setStatus("준비되면 촬영 버튼을 눌러주세요");
    } catch (caught) {
      const message = caught instanceof DOMException && caught.name === "NotAllowedError"
        ? "카메라 권한이 필요합니다. Safari 설정에서 카메라 접근을 허용해주세요."
        : "카메라를 시작하지 못했습니다. 다른 앱이 카메라를 사용 중인지 확인해주세요.";
      setError(message);
    }
  };

  // 촬영 내내 일정 간격으로 540p(좌우 반전) 스냅샷을 모읍니다. 나중에 빠르게 이어붙여 타임랩스로 만듭니다.
  // 재미용 보너스 영상이므로 540p·짧은 재생시간으로 가볍게 — 생성(실시간 재생 녹화)도
  // 공유 시트 준비도 빨라집니다.
  const TIMELAPSE = { intervalMs: 450, maxFrames: 50, playbackFps: 20, width: 960, height: 540 };

  const startTimelapseCapture = () => {
    const snapCanvas = document.createElement("canvas");
    snapCanvas.width = TIMELAPSE.width;
    snapCanvas.height = TIMELAPSE.height;
    const snapContext = snapCanvas.getContext("2d", { alpha: false });
    const frames: string[] = [];
    let active = true;
    let last = -Infinity;
    const tick = (now: number) => {
      if (!active) return;
      requestAnimationFrame(tick);
      if (now - last < TIMELAPSE.intervalMs) return;
      const source = videoRef.current;
      if (snapContext && source && source.videoWidth && frames.length < TIMELAPSE.maxFrames) {
        last = now;
        snapContext.save();
        snapContext.translate(TIMELAPSE.width, 0);
        snapContext.scale(-1, 1);
        drawCover(snapContext, source, source.videoWidth, source.videoHeight, 0, 0, TIMELAPSE.width, TIMELAPSE.height);
        snapContext.restore();
        frames.push(snapCanvas.toDataURL("image/jpeg", 0.8));
      }
    };
    requestAnimationFrame(tick);
    return {
      stop: () => {
        active = false;
        return frames;
      },
    };
  };

  // 모은 스냅샷들을 playbackFps 로 재생하며 녹화 → 짧은 타임랩스 영상 파일을 만듭니다.
  const buildTimelapse = async (frameUrls: string[]) => {
    if (frameUrls.length < 2 || typeof MediaRecorder === "undefined") return null;
    try {
      const images = await Promise.all(frameUrls.map(loadImage));
      const canvas = document.createElement("canvas");
      canvas.width = TIMELAPSE.width;
      canvas.height = TIMELAPSE.height;
      const context = canvas.getContext("2d", { alpha: false });
      if (!context) return null;
      const recStream = canvas.captureStream(TIMELAPSE.playbackFps);
      const candidates = [
        "video/mp4;codecs=avc1",
        "video/mp4",
        "video/webm;codecs=vp9",
        "video/webm;codecs=vp8",
        "video/webm",
      ];
      const isSupported = (type: string) =>
        typeof MediaRecorder.isTypeSupported === "function" && MediaRecorder.isTypeSupported(type);
      const mime = candidates.find(isSupported) || "";
      const recorder = mime
        ? new MediaRecorder(recStream, { mimeType: mime, videoBitsPerSecond: 2_500_000 })
        : new MediaRecorder(recStream);
      const chunks: BlobPart[] = [];
      recorder.ondataavailable = (event) => {
        if (event.data && event.data.size) chunks.push(event.data);
      };
      const stopped = new Promise<void>((resolve) => {
        recorder.onstop = () => resolve();
      });
      context.drawImage(images[0], 0, 0, TIMELAPSE.width, TIMELAPSE.height);
      recorder.start();
      for (const image of images) {
        context.drawImage(image, 0, 0, TIMELAPSE.width, TIMELAPSE.height);
        await sleep(1000 / TIMELAPSE.playbackFps);
      }
      await sleep(300); // 마지막 프레임 잠깐 유지
      recorder.stop();
      await stopped;
      const type = mime || "video/webm";
      const blob = new Blob(chunks, { type });
      return blob.size
        ? { url: URL.createObjectURL(blob), blob, ext: type.includes("mp4") ? "mp4" : "webm" }
        : null;
    } catch {
      return null;
    }
  };

  const saveClip = async () => {
    if (!clip) return;
    const file = new File([clip.blob], `네컷타임랩스-${new Date().toISOString().slice(0, 10)}.${clip.ext}`, {
      type: clip.blob.type,
    });
    try {
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file], title: "우리들의 네컷 영상" });
        return;
      }
    } catch (caught) {
      // 사용자가 공유 창을 닫은 경우(AbortError)만 조용히 끝내고,
      // 그 외 실패는 아래 다운로드 폴백으로 이어갑니다.
      if (caught instanceof DOMException && caught.name === "AbortError") return;
    }
    const link = document.createElement("a");
    link.href = clip.url;
    link.download = file.name;
    link.click();
  };

  const runSequence = async () => {
    if (!videoRef.current || !cameraReady || shooting) return;
    // 이 시퀀스의 세대 번호를 기억해 두고, 도중에 reset 등으로 세대가 바뀌거나
    // 카메라 화면이 언마운트되면(videoRef 소실) 조용히 중단합니다.
    const gen = ++runGenRef.current;
    const aborted = () => runGenRef.current !== gen || !videoRef.current;
    setShooting(true);
    setError(null);
    setShots([]);
    setShotCount(0);
    setPicked([]);
    setClip(null);
    ensureAudio(); // 사용자 제스처 안에서 오디오를 깨워둡니다 (iPad Safari 자동재생 정책)
    const shotsToTake = totalShots;
    const frames: string[] = [];
    const timelapse = startTimelapseCapture();
    try {
      for (let index = 0; index < shotsToTake; index += 1) {
        if (aborted()) return;
        setStatus(`${index + 1}번째 사진을 준비하세요`);
        for (let number = 5; number >= 1; number -= 1) {
          setCountdown(number);
          playBeep(number === 1 ? 1320 : 880, 80);
          await sleep(1000);
          if (aborted()) return;
        }
        setCountdown(null);
        setFlash(true);
        playShutter();
        await sleep(90);
        if (aborted()) return;
        const frame = await captureVideoFrame(videoRef.current, activeFilter);
        frames.push(frame);
        setShots((previous) => [...previous, frame]);
        setShotCount(index + 1);
        await sleep(180);
        setFlash(false);
        if (index < shotsToTake - 1) await sleep(650);
      }
      const snapshots = timelapse.stop();
      if (aborted()) return;
      // 타임랩스는 백그라운드에서 생성 — 완성/선택 화면 진입을 막지 않고,
      // 끝나면 '타임랩스 영상 저장' 버튼이 나타납니다.
      void buildTimelapse(snapshots).then((captured) => {
        if (!captured) return;
        if (runGenRef.current !== gen) {
          URL.revokeObjectURL(captured.url);
          return;
        }
        setClip(captured);
      });
      // 스트림은 끄지 않고 유지 — '다시 찍기' 때 권한 팝업이 다시 뜨지 않습니다.
      setCameraReady(false);
      if (shotsToTake === 6) {
        // 6컷 모드: 베스트 4컷 선택 화면으로
        setPhase("select");
        return;
      }
      setStatus("네컷 사진을 꾸미고 있어요");
      const result = await composeFourCut(frames, theme, eventName);
      if (aborted()) return;
      setComposite(result);
      setPhase("preview");
    } catch (caught) {
      if (!aborted()) setError(caught instanceof Error ? caught.message : "촬영 중 문제가 생겼습니다.");
    } finally {
      timelapse.stop(); // 중단 경로에서도 스냅샷 rAF 루프를 확실히 종료 (중복 호출 무해)
      setCountdown(null);
      setFlash(false);
      setShooting(false);
    }
  };

  const openSample = async () => {
    setError(null);
    const result = await composeFourCut(makeSampleFrames(activeFilter), theme, eventName);
    setComposite(result);
    setPhase("preview");
  };

  const retake = async () => {
    await startCamera();
  };

  // 6컷 중 베스트 4컷 선택 — 탭 순서가 스트립에 배치되는 순서가 됩니다.
  const togglePick = (index: number) => {
    setPicked((previous) => {
      if (previous.includes(index)) return previous.filter((item) => item !== index);
      if (previous.length >= 4) return previous;
      return [...previous, index];
    });
  };

  const finishSelect = async () => {
    if (picked.length !== 4 || composing) return;
    // 합성 중 reset(로고·유휴 타이머)이 실행되면 완료 시점에 preview 로 되돌아가지 않도록 세대 확인
    const gen = runGenRef.current;
    setComposing(true);
    setError(null);
    try {
      const chosen = picked.map((index) => shots[index]);
      const result = await composeFourCut(chosen, theme, eventName);
      if (runGenRef.current !== gen) return;
      setComposite(result);
      setPhase("preview");
    } catch (caught) {
      if (runGenRef.current === gen)
        setError(caught instanceof Error ? caught.message : "네컷을 만드는 중 문제가 생겼습니다.");
    } finally {
      setComposing(false);
    }
  };

  const downloadImage = () => {
    if (!composite) return;
    const link = document.createElement("a");
    link.href = composite;
    link.download = `우리들의-네컷-${new Date().toISOString().slice(0, 10)}.jpg`;
    link.click();
  };

  const shareImage = async () => {
    if (!composite) return;
    try {
      const blob = await (await fetch(composite)).blob();
      const file = new File([blob], "우리들의-네컷.jpg", { type: "image/jpeg" });
      // share 존재만으로는 부족 — 파일 공유(iPadOS 15+)를 지원하는지 canShare 로 확인해야
      // 구형 기기에서 버튼이 무반응이 되지 않습니다.
      if (navigator.share && navigator.canShare?.({ files: [file] })) {
        await navigator.share({ title: "우리들의 네컷", files: [file] });
        return;
      }
    } catch (caught) {
      // 사용자가 공유 창을 닫은 경우(AbortError)만 조용히 끝냅니다.
      if (caught instanceof DOMException && caught.name === "AbortError") return;
    }
    // 파일 공유 미지원 기기·공유 실패 시 다운로드로 폴백합니다.
    downloadImage();
  };

  const printImage = () => {
    // 홈 화면에 추가한 standalone 웹앱에서는 window.print()가 동작하지 않는
    // iPadOS 버전이 있어, 공유 시트로 폴백합니다(시트의 '프린트' 항목으로 인쇄).
    const standalone =
      window.matchMedia?.("(display-mode: standalone)").matches ||
      (navigator as { standalone?: boolean }).standalone === true;
    if (standalone) {
      void shareImage();
      return;
    }
    window.print();
  };

  const reset = () => {
    // 진행 중일 수 있는 촬영 시퀀스를 중단시킵니다.
    runGenRef.current += 1;
    // 환영 화면에서는 카메라 표시등이 꺼지도록 스트림을 종료합니다.
    // (같은 페이지 세션 안에서는 다시 촬영해도 보통 권한 팝업이 다시 뜨지 않습니다.)
    stopCamera();
    setPhase("welcome");
    setComposite(null);
    setClip(null);
    setPicked([]);
    setError(null);
  };

  // 화면 꺼짐 방지 — 행사 키오스크에서 iPad 자동 잠금이 걸리지 않게 합니다(iPadOS 16.4+).
  useEffect(() => {
    let lock: WakeLockSentinel | null = null;
    let disposed = false;
    const request = async () => {
      try {
        lock = (await navigator.wakeLock?.request("screen")) ?? null;
        if (disposed) lock?.release().catch(() => undefined);
      } catch (caught) {
        // 미지원 기기·저전력 모드(NotAllowedError) 등 — 앱 동작에는 지장 없지만
        // 화면 꺼짐 방지가 비활성임을 콘솔로 남깁니다(운영: 저전력 모드 해제 권장).
        console.warn("화면 꺼짐 방지(Wake Lock)를 켤 수 없습니다:", caught);
      }
    };
    void request();
    const onVisibility = () => {
      if (document.visibilityState === "visible") void request();
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      disposed = true;
      document.removeEventListener("visibilitychange", onVisibility);
      lock?.release().catch(() => undefined);
    };
  }, []);

  // 완성/선택 화면 방치 시 자동 초기화 — 앞 팀의 사진이 다음 이용자에게 노출되지 않게 합니다.
  const IDLE_RESET_SECONDS = 90;
  useEffect(() => {
    if (phase !== "preview" && phase !== "select") return;
    let timer = 0;
    const arm = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => reset(), IDLE_RESET_SECONDS * 1000);
    };
    arm();
    const events = ["pointerdown", "keydown", "touchstart"] as const;
    events.forEach((name) => window.addEventListener(name, arm));
    return () => {
      window.clearTimeout(timer);
      events.forEach((name) => window.removeEventListener(name, arm));
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  return (
    <div className={`app theme-${themeKey}`} style={{ "--theme-accent": theme.accent } as React.CSSProperties}>
      <header className="topbar no-print">
        <button className="brand" onClick={reset} disabled={shooting || composing} aria-label="처음 화면으로">
          <span className="brand-mark"><Icon name="sparkle" /></span>
          <span>우리들의 <strong>4컷 사진관</strong></span>
        </button>
        <div className="privacy-badge"><span className="status-dot" /> 사진은 iPad에만 저장돼요</div>
      </header>

      {phase === "welcome" && (
        <main className="welcome no-print">
          <section className="hero-copy">
            <div className="eyebrow">TAKE · PRINT · KEEP</div>
            <h1>웃음은 네 번,<br /><em>추억은 오래오래.</em></h1>
            <p>iPad 앞에 모여 네 장을 찍어요.<br />바로 인화하고, iPad에 저장해 나눠 가져요.</p>
            <div className="feature-row" aria-label="주요 기능">
              <span><Icon name="camera" /> 4장 자동 촬영</span>
              <span><Icon name="print" /> 4×6 인화</span>
              <span><Icon name="download" /> iPad에 저장</span>
            </div>
          </section>

          <section className="setup-card">
            <div className="step-label">촬영 준비</div>
            <h2>오늘의 사진관을 꾸며볼까요?</h2>
            <label className="field-label" htmlFor="event-name">사진 아래에 넣을 말</label>
            <input
              id="event-name"
              className="text-input"
              value={eventName}
              maxLength={24}
              onChange={(event) => setEventName(event.target.value)}
              placeholder="예: 1학년 5반의 봄날"
            />

            <fieldset className="theme-picker">
              <legend>사진 프레임</legend>
              <div className="theme-options">
                {(Object.entries(THEMES) as [ThemeKey, Theme][]).map(([key, option]) => (
                  <button
                    type="button"
                    className={`theme-option ${themeKey === key ? "selected" : ""}`}
                    onClick={() => setThemeKey(key)}
                    key={key}
                    aria-pressed={themeKey === key}
                  >
                    <span className="swatch" style={{ background: option.background }}><i style={{ background: option.accent }} /></span>
                    <span><strong>{option.name}</strong><small>{option.hint}</small></span>
                    <b aria-hidden="true">✓</b>
                  </button>
                ))}
              </div>
            </fieldset>

            <fieldset className="mode-picker">
              <legend>촬영 방식</legend>
              <div className="mode-options">
                <button
                  type="button"
                  className={`mode-option ${shotMode === "six" ? "selected" : ""}`}
                  onClick={() => setShotMode("six")}
                  aria-pressed={shotMode === "six"}
                >
                  <strong>6컷 찍고 고르기</strong>
                  <small>여섯 장 중 베스트 4장 선택</small>
                </button>
                <button
                  type="button"
                  className={`mode-option ${shotMode === "four" ? "selected" : ""}`}
                  onClick={() => setShotMode("four")}
                  aria-pressed={shotMode === "four"}
                >
                  <strong>4컷 바로 완성</strong>
                  <small>찍은 그대로 빠르게</small>
                </button>
              </div>
            </fieldset>

            <fieldset className="edge-picker">
              <legend>카메라 위치</legend>
              <div className="edge-options" role="group" aria-label="전면 카메라가 있는 가장자리">
                {([
                  ["top", "위쪽"],
                  ["left", "왼쪽"],
                  ["right", "오른쪽"],
                ] as [CamEdge, string][]).map(([edge, label]) => (
                  <button
                    type="button"
                    className={`edge-option ${camEdge === edge ? "selected" : ""}`}
                    onClick={() => pickCamEdge(edge)}
                    aria-pressed={camEdge === edge}
                    key={edge}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <small className="edge-hint">렌즈가 있는 쪽을 골라주세요 — 촬영 중 "여기를 봐요!" 안내가 그쪽에 떠요</small>
            </fieldset>

            <label className="privacy-check">
              <input type="checkbox" checked={privacyChecked} onChange={(event) => setPrivacyChecked(event.target.checked)} />
              <span><strong>촬영 안내를 확인했어요.</strong><small>사진은 서버로 전송되지 않고 이 iPad에서만 만들어져요.</small></span>
            </label>

            {error && <div className="error-message" role="alert">{error}</div>}
            <button className="primary-button" disabled={!privacyChecked} onClick={startCamera}>
              <Icon name="camera" /> 사진 찍으러 가기 <span>→</span>
            </button>
            <button className="sample-button" onClick={openSample}>카메라 없이 샘플로 둘러보기</button>
          </section>
        </main>
      )}

      {phase === "camera" && (
        <main className="camera-layout no-print">
          <section className={`camera-stage edge-${camEdge}`}>
            <div className="camera-frame">
              <video
                ref={videoRef}
                className="cam-video"
                autoPlay
                muted
                playsInline
                onCanPlay={(event) => {
                  setCameraReady(true);
                  const element = event.currentTarget;
                  if (element.videoWidth) setCamRes(`${element.videoWidth}×${element.videoHeight}`);
                }}
                aria-label="카메라 미리보기"
                style={{ filter: previewFilter === "none" ? undefined : previewFilter }}
              />
              <video
                ref={glowVideoRef}
                className="cam-video cam-glow"
                autoPlay
                muted
                playsInline
                aria-hidden="true"
                style={{ filter: glowLayerFilter, opacity: glowStrength * 0.72 }}
              />
              <div className="camera-vignette" />
              <div className={`flash ${flash ? "active" : ""}`} />
              {countdown !== null && (
                <div className={`countdown ${countdown === 1 ? "last" : ""}`} key={countdown}>{countdown}</div>
              )}
            </div>
            {!shooting && (
              <div className="camera-caption">
                이 사각형 안이 그대로 인쇄돼요 · 자연스럽게 웃어주세요!
                {camRes && <span className="cam-res"> · {camRes}</span>}
              </div>
            )}
            {shooting && (
              <div className="gaze-hint" aria-hidden="true">
                <span className="gaze-dot" />
                📷 여기를 봐요!
              </div>
            )}
            <div className="camera-filters" role="group" aria-label="사진 필터 선택">
              {FILTERS.map((option) => (
                <button
                  type="button"
                  className={`cam-filter-chip ${filterKey === option.key ? "selected" : ""}`}
                  onClick={() => setFilterKey(option.key)}
                  disabled={shooting}
                  key={option.key}
                  aria-pressed={filterKey === option.key}
                >
                  {option.name}
                </button>
              ))}
            </div>
          </section>
          <aside className="shoot-panel">
            <div>
              <div className="step-label">자동 촬영</div>
              <h2>{shooting ? status : shotMode === "six" ? "여섯 번 찍고 넷을 골라요" : "네 번의 순간을 담아요"}</h2>
              <p>
                한 장마다 5초를 세고 자동으로 찍어요.<br />
                {shotMode === "six" ? "촬영이 끝나면 베스트 4컷을 골라요." : "촬영 사이에 재빨리 포즈를 바꿔보세요."}
              </p>
            </div>
            <div
              className="shot-progress"
              style={{ gridTemplateColumns: `repeat(${totalShots}, 1fr)` }}
              aria-label={`${shotCount}장 촬영 완료`}
            >
              {Array.from({ length: totalShots }, (_, index) => (
                <span
                  className={shots[index] ? "done shot-thumb" : index === shotCount && shooting ? "current" : ""}
                  key={index}
                >
                  {shots[index] ? <img src={shots[index]} alt={`${index + 1}번째 사진`} /> : index + 1}
                </span>
              ))}
            </div>
            {error && <div className="error-message" role="alert">{error}</div>}
            <button className="shutter-button" disabled={!cameraReady || shooting} onClick={runSequence}>
              <span className="shutter-ring"><i /></span>
              {cameraReady ? (shooting ? "촬영 중…" : "촬영 시작") : "카메라 준비 중…"}
            </button>
            <button className="text-button" disabled={shooting} onClick={reset}>처음으로 돌아가기</button>
          </aside>
        </main>
      )}

      {phase === "select" && shots.length === 6 && (
        <main className="select-layout no-print">
          <section className="select-stage">
            <div className="select-grid" role="group" aria-label="베스트 컷 고르기">
              {shots.map((shot, index) => {
                const order = picked.indexOf(index);
                return (
                  <button
                    type="button"
                    className={`select-cell ${order >= 0 ? "picked" : ""}`}
                    onClick={() => togglePick(index)}
                    aria-pressed={order >= 0}
                    key={index}
                  >
                    <img src={shot} alt={`${index + 1}번째 컷`} />
                    {order >= 0 && <span className="pick-badge">{order + 1}</span>}
                  </button>
                );
              })}
            </div>
          </section>
          <aside className="select-panel">
            <div>
              <div className="step-label">베스트 컷 고르기</div>
              <h2>마음에 드는 4장을<br />순서대로 골라주세요</h2>
              <p>고른 순서대로 위에서 아래로 배치돼요.<br />다시 탭하면 선택이 취소돼요.</p>
            </div>
            <div className="pick-count" aria-live="polite">{picked.length} / 4 선택</div>
            {error && <div className="error-message" role="alert">{error}</div>}
            <button className="primary-button" disabled={picked.length !== 4 || composing} onClick={finishSelect}>
              {composing ? "네컷 만드는 중…" : "이 4장으로 완성하기"} <span>→</span>
            </button>
            <button className="retake-button" disabled={composing} onClick={retake}><Icon name="redo" /> 전부 다시 찍기</button>
            <button className="text-button" disabled={composing} onClick={reset}>처음으로 돌아가기</button>
            <div className="idle-hint">{IDLE_RESET_SECONDS}초 동안 조작이 없으면 처음 화면으로 돌아가요</div>
          </aside>
        </main>
      )}

      {phase === "preview" && composite && (
        <main className="result-layout no-print">
          <section className="result-preview">
            <div className="print-mat">
              <img src={composite} alt="완성된 네컷 사진" />
            </div>
            <div className="cut-hint"><span /> 가운데 선을 따라 자르면 같은 사진 두 장이 돼요</div>
          </section>
          <aside className="result-panel">
            <div>
              <div className="success-mark">✓</div>
              <div className="step-label">촬영 완료</div>
              <h2>우리들의 네컷이<br />완성됐어요!</h2>
              <p>옆의 포토프린터로 바로 인화하거나, iPad에 저장해 나눠 가지세요.</p>
            </div>
            {error && <div className="error-message" role="alert">{error}</div>}
            <div className="result-actions">
              <button className="action-button print-action" onClick={printImage}>
                <Icon name="print" /><span><strong>사진 인쇄하기</strong><small>AirPrint 프린터 선택</small></span>
              </button>
              <button className="action-button" onClick={shareImage}>
                <Icon name="download" /><span><strong>iPad에 저장·공유</strong><small>사진 앱 또는 AirDrop</small></span>
              </button>
              {clip && (
                <button className="action-button" onClick={saveClip}>
                  <Icon name="video" /><span><strong>타임랩스 영상 저장</strong><small>촬영 과정 타임랩스</small></span>
                </button>
              )}
            </div>
            <button className="retake-button" onClick={retake}><Icon name="redo" /> 다시 찍기</button>
            <button className="text-button" onClick={reset}>새 손님 맞이하기</button>
            <div className="idle-hint">{IDLE_RESET_SECONDS}초 동안 조작이 없으면 처음 화면으로 돌아가요</div>
          </aside>
        </main>
      )}

      {composite && <img className="print-only print-image" src={composite} alt="인쇄용 네컷 사진" />}
    </div>
  );
}
