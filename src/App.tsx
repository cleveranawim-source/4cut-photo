import { useEffect, useRef, useState } from "react";

type Phase = "welcome" | "camera" | "preview";
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

const sleep = (milliseconds: number) => new Promise((resolve) => window.setTimeout(resolve, milliseconds));

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

// 미리보기에서 보이는 영역과 인쇄되는 영역을 똑같이 맞추기 위해,
// 촬영 순간 화면을 인쇄 셀과 같은 가로세로비(PHOTO_RATIO)로 중앙 크롭합니다.
const PHOTO_RATIO = 520 / 316;

function captureVideoFrame(video: HTMLVideoElement) {
  const sourceWidth = video.videoWidth;
  const sourceHeight = video.videoHeight;
  if (!sourceWidth || !sourceHeight) throw new Error("카메라 화면이 아직 준비되지 않았습니다.");

  // 원본 프레임을 인쇄 비율로 중앙 크롭(cover)합니다.
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
  const context = canvas.getContext("2d", { alpha: false });
  if (!context) throw new Error("사진을 만들 수 없습니다.");
  // 전면 카메라 미리보기(좌우 반전)와 동일하게 보이도록 좌우 반전해 저장합니다.
  context.translate(outputWidth, 0);
  context.scale(-1, 1);
  context.drawImage(video, sourceX, sourceY, cropWidth, cropHeight, 0, 0, outputWidth, outputHeight);
  return canvas.toDataURL("image/jpeg", 0.92);
}

async function composeFourCut(images: string[], theme: Theme, eventName: string) {
  const loaded = await Promise.all(images.map(loadImage));
  const canvas = document.createElement("canvas");
  canvas.width = 1200;
  canvas.height = 1800;
  const context = canvas.getContext("2d", { alpha: false });
  if (!context) throw new Error("네컷 이미지를 만들 수 없습니다.");

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

      context.fillStyle = theme.accent;
      context.beginPath();
      context.arc(photoX + 28, y + 28, 17, 0, Math.PI * 2);
      context.fill();
      context.fillStyle = "#ffffff";
      context.font = "800 18px -apple-system, BlinkMacSystemFont, sans-serif";
      context.fillText(String(index + 1), photoX + 28, y + 29);
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

  return canvas.toDataURL("image/jpeg", 0.95);
}

function makeSampleFrames() {
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
    return canvas.toDataURL("image/jpeg", 0.9);
  });
}

function Icon({ name }: { name: "camera" | "qr" | "print" | "download" | "redo" | "sparkle" }) {
  const paths = {
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
  const [error, setError] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const theme = THEMES[themeKey];

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

  useEffect(() => {
    if (phase === "camera" && videoRef.current && streamRef.current) {
      videoRef.current.srcObject = streamRef.current;
      videoRef.current.play().catch(() => undefined);
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
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
          facingMode: "user",
          width: { ideal: 1920 },
          height: { ideal: 1080 },
        },
      });
      streamRef.current = stream;
      setPhase("camera");
      setStatus("준비되면 촬영 버튼을 눌러주세요");
    } catch (caught) {
      const message = caught instanceof DOMException && caught.name === "NotAllowedError"
        ? "카메라 권한이 필요합니다. Safari 설정에서 카메라 접근을 허용해주세요."
        : "카메라를 시작하지 못했습니다. 다른 앱이 카메라를 사용 중인지 확인해주세요.";
      setError(message);
    }
  };

  const runSequence = async () => {
    if (!videoRef.current || !cameraReady || shooting) return;
    setShooting(true);
    setError(null);
    setShots([]);
    const frames: string[] = [];
    try {
      for (let index = 0; index < 4; index += 1) {
        setStatus(`${index + 1}번째 사진을 준비하세요`);
        for (let number = 5; number >= 1; number -= 1) {
          setCountdown(number);
          await sleep(1000);
        }
        setCountdown(null);
        setFlash(true);
        await sleep(90);
        const frame = captureVideoFrame(videoRef.current);
        frames.push(frame);
        setShots((previous) => [...previous, frame]);
        setShotCount(index + 1);
        await sleep(180);
        setFlash(false);
        if (index < 3) await sleep(650);
      }
      setStatus("네컷 사진을 꾸미고 있어요");
      const result = await composeFourCut(frames, theme, eventName);
      setComposite(result);
      stopCamera();
      setPhase("preview");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "촬영 중 문제가 생겼습니다.");
    } finally {
      setCountdown(null);
      setFlash(false);
      setShooting(false);
    }
  };

  const openSample = async () => {
    setError(null);
    const result = await composeFourCut(makeSampleFrames(), theme, eventName);
    setComposite(result);
    setPhase("preview");
  };

  const retake = async () => {
    await startCamera();
  };

  const downloadImage = () => {
    if (!composite) return;
    const link = document.createElement("a");
    link.href = composite;
    link.download = `우리들의-네컷-${new Date().toISOString().slice(0, 10)}.jpg`;
    link.click();
  };

  const shareImage = async () => {
    if (!composite || !navigator.share) {
      downloadImage();
      return;
    }
    try {
      const blob = await (await fetch(composite)).blob();
      const file = new File([blob], "우리들의-네컷.jpg", { type: "image/jpeg" });
      await navigator.share({ title: "우리들의 네컷", files: [file] });
    } catch {
      // 사용자가 공유 창을 닫은 경우 아무 동작도 하지 않습니다.
    }
  };

  const reset = () => {
    stopCamera();
    setPhase("welcome");
    setComposite(null);
    setError(null);
  };

  return (
    <div className={`app theme-${themeKey}`} style={{ "--theme-accent": theme.accent } as React.CSSProperties}>
      <header className="topbar no-print">
        <button className="brand" onClick={reset} aria-label="처음 화면으로">
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
          <section className="camera-stage">
            <div className="camera-frame">
              <video
                ref={videoRef}
                autoPlay
                muted
                playsInline
                onCanPlay={() => setCameraReady(true)}
                aria-label="카메라 미리보기"
              />
              <div className="camera-vignette" />
              <div className={`flash ${flash ? "active" : ""}`} />
              {countdown !== null && <div className="countdown" key={countdown}>{countdown}</div>}
            </div>
            <div className="camera-caption">이 사각형 안이 그대로 인쇄돼요 · 자연스럽게 웃어주세요!</div>
          </section>
          <aside className="shoot-panel">
            <div>
              <div className="step-label">자동 촬영</div>
              <h2>{shooting ? status : "네 번의 순간을 담아요"}</h2>
              <p>한 장마다 5초를 세고 자동으로 찍어요.<br />촬영 사이에 재빨리 포즈를 바꿔보세요.</p>
            </div>
            <div className="shot-progress" aria-label={`${shotCount}장 촬영 완료`}>
              {[0, 1, 2, 3].map((index) => (
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
              <button className="action-button print-action" onClick={() => window.print()}>
                <Icon name="print" /><span><strong>사진 인쇄하기</strong><small>AirPrint 프린터 선택</small></span>
              </button>
              <button className="action-button" onClick={shareImage}>
                <Icon name="download" /><span><strong>iPad에 저장·공유</strong><small>사진 앱 또는 AirDrop</small></span>
              </button>
            </div>
            <button className="retake-button" onClick={retake}><Icon name="redo" /> 다시 찍기</button>
            <button className="text-button" onClick={reset}>새 손님 맞이하기</button>
          </aside>
        </main>
      )}

      {composite && <img className="print-only print-image" src={composite} alt="인쇄용 네컷 사진" />}
    </div>
  );
}
