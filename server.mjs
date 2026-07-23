import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";

const currentFile = fileURLToPath(import.meta.url);
const rootDirectory = path.dirname(currentFile);
const storageDirectory = path.resolve(process.env.STORAGE_DIR || path.join(rootDirectory, "storage"));
const distributionDirectory = path.join(rootDirectory, "dist");
const port = Number(process.env.PORT || (process.argv.includes("--dev") ? 4174 : 4173));
const ttlMinutes = Math.max(5, Number(process.env.SHARE_TTL_MINUTES || 60));
const ttlMilliseconds = ttlMinutes * 60 * 1000;
const maximumImageBytes = 8 * 1024 * 1024;
const tokenPattern = /^[a-f0-9]{48}$/;

await fs.mkdir(storageDirectory, { recursive: true });

const app = express();
app.set("trust proxy", true);
app.disable("x-powered-by");
app.use((request, response, next) => {
  response.setHeader("X-Content-Type-Options", "nosniff");
  response.setHeader("Referrer-Policy", "no-referrer");
  response.setHeader("X-Frame-Options", "DENY");
  next();
});
app.use(express.json({ limit: "12mb" }));

function imagePath(token) {
  return path.join(storageDirectory, `${token}.jpg`);
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function publicBaseUrl(request) {
  const configured = process.env.PUBLIC_BASE_URL?.replace(/\/$/, "");
  return configured || `${request.protocol}://${request.get("host")}`;
}

async function getActiveImage(token) {
  if (!tokenPattern.test(token)) return null;
  const file = imagePath(token);
  try {
    const stat = await fs.stat(file);
    const expiresAt = stat.mtimeMs + ttlMilliseconds;
    if (expiresAt <= Date.now()) {
      await fs.unlink(file).catch(() => undefined);
      return null;
    }
    return { file, expiresAt };
  } catch {
    return null;
  }
}

async function cleanExpiredImages() {
  const files = await fs.readdir(storageDirectory, { withFileTypes: true }).catch(() => []);
  await Promise.all(
    files
      .filter((entry) => entry.isFile() && entry.name.endsWith(".jpg"))
      .map(async (entry) => {
        const file = path.join(storageDirectory, entry.name);
        const stat = await fs.stat(file).catch(() => null);
        if (stat && stat.mtimeMs + ttlMilliseconds <= Date.now()) {
          await fs.unlink(file).catch(() => undefined);
        }
      }),
  );
}

await cleanExpiredImages();
setInterval(cleanExpiredImages, Math.min(ttlMilliseconds, 15 * 60 * 1000)).unref();

app.get("/api/health", (_request, response) => {
  response.setHeader("Cache-Control", "no-store");
  response.json({ ok: true, shareTtlMinutes: ttlMinutes });
});

app.post("/api/shares", async (request, response) => {
  response.setHeader("Cache-Control", "no-store");
  const imageDataUrl = request.body?.imageDataUrl;
  if (typeof imageDataUrl !== "string" || !imageDataUrl.startsWith("data:image/jpeg;base64,")) {
    return response.status(400).json({ message: "JPEG 형식의 네컷 사진이 필요합니다." });
  }

  const encoded = imageDataUrl.slice("data:image/jpeg;base64,".length);
  const buffer = Buffer.from(encoded, "base64");
  if (!buffer.length || buffer.length > maximumImageBytes) {
    return response.status(413).json({ message: "사진 용량이 너무 큽니다. 다시 촬영해주세요." });
  }
  if (buffer[0] !== 0xff || buffer[1] !== 0xd8 || buffer[2] !== 0xff) {
    return response.status(400).json({ message: "올바른 사진 파일이 아닙니다." });
  }

  const token = crypto.randomBytes(24).toString("hex");
  await fs.writeFile(imagePath(token), buffer, { flag: "wx" });
  const expiresAt = new Date(Date.now() + ttlMilliseconds).toISOString();
  return response.status(201).json({
    url: `${publicBaseUrl(request)}/s/${token}`,
    expiresAt,
  });
});

app.get("/api/shares/:token/image", async (request, response) => {
  const record = await getActiveImage(request.params.token);
  if (!record) return response.status(410).json({ message: "사진이 만료되었거나 존재하지 않습니다." });
  response.setHeader("Cache-Control", "private, no-store, max-age=0");
  response.setHeader("Content-Type", "image/jpeg");
  return response.sendFile(record.file);
});

app.get("/api/shares/:token/download", async (request, response) => {
  const record = await getActiveImage(request.params.token);
  if (!record) return response.status(410).send("사진이 만료되었거나 존재하지 않습니다.");
  response.setHeader("Cache-Control", "private, no-store, max-age=0");
  return response.download(record.file, "우리들의-네컷.jpg");
});

app.get("/s/:token", async (request, response) => {
  const record = await getActiveImage(request.params.token);
  response.setHeader("Cache-Control", "private, no-store, max-age=0");
  response.setHeader("Content-Security-Policy", "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'");
  if (!record) {
    return response.status(410).send(`<!doctype html><html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>사진 만료</title><style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#fff8ec;color:#263248;font-family:-apple-system,BlinkMacSystemFont,sans-serif;text-align:center}main{padding:30px}i{display:grid;width:54px;height:54px;margin:auto;place-items:center;border-radius:18px;background:#ece7dd;font-style:normal;font-size:27px}h1{font-size:25px;margin:18px 0 8px}p{color:#707783;line-height:1.6}</style><main><i>⌛</i><h1>사진 보관 시간이 끝났어요</h1><p>개인정보 보호를 위해 사진이 자동 삭제되었습니다.<br>사진관에서 새 QR을 만들어주세요.</p></main></html>`);
  }

  const minutesRemaining = Math.max(1, Math.ceil((record.expiresAt - Date.now()) / 60000));
  const title = escapeHtml(request.query.title || "우리들의 네컷");
  return response.send(`<!doctype html>
<html lang="ko">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
  <meta name="robots" content="noindex,nofollow,noarchive">
  <meta name="theme-color" content="#fff8ec">
  <title>${title}</title>
  <style>
    *{box-sizing:border-box}body{margin:0;min-height:100svh;padding:22px;background:radial-gradient(circle at 10% 10%,#ffe4ca 0 12%,transparent 12.3%),#fff8ec;color:#263248;font-family:-apple-system,BlinkMacSystemFont,"Apple SD Gothic Neo",sans-serif}main{width:min(520px,100%);margin:auto;text-align:center}.mark{display:grid;width:45px;height:45px;margin:7px auto 13px;place-items:center;border-radius:15px;color:white;background:#ff745b;font-size:22px;font-weight:900;transform:rotate(-5deg)}h1{margin:0;font-size:29px;letter-spacing:-.05em}p{margin:8px 0 18px;color:#747b86;font-size:14px;line-height:1.6}.photo{padding:9px;border-radius:9px;background:white;box-shadow:0 18px 45px #69543b2b}.photo img{display:block;width:100%;border-radius:3px}a{display:block;margin-top:16px;padding:16px;border-radius:15px;color:white;background:#ff745b;font-size:16px;font-weight:800;text-decoration:none;box-shadow:0 12px 25px #ff745b42}.note{margin-top:13px;padding:10px;border-radius:11px;color:#4b786d;background:#e8f8f2;font-size:11px;font-weight:700}small{display:block;margin-top:12px;color:#92969d;font-size:11px;line-height:1.5}
  </style>
</head>
<body><main><div class="mark">✦</div><h1>${title}</h1><p>오늘의 반짝이는 순간을 간직하세요.</p><div class="photo"><img src="/api/shares/${request.params.token}/image" alt="완성된 네컷 사진"></div><a href="/api/shares/${request.params.token}/download">사진 내려받기</a><div class="note">개인정보 보호를 위해 약 ${minutesRemaining}분 후 자동 삭제돼요.</div><small>iPhone에서는 사진을 길게 누른 뒤 ‘사진 앱에 저장’을 선택할 수도 있어요.</small></main></body>
</html>`);
});

app.use(express.static(distributionDirectory, { index: false, maxAge: "1h" }));
app.get("/{*path}", async (_request, response, next) => {
  try {
    await fs.access(path.join(distributionDirectory, "index.html"));
    response.setHeader("Cache-Control", "no-cache");
    return response.sendFile(path.join(distributionDirectory, "index.html"));
  } catch {
    return next();
  }
});

app.use((error, _request, response, _next) => {
  if (error?.type === "entity.too.large") {
    return response.status(413).json({ message: "사진 용량이 너무 큽니다." });
  }
  console.error(error);
  return response.status(500).json({ message: "서버에서 문제가 생겼습니다. 잠시 후 다시 시도해주세요." });
});

app.listen(port, "0.0.0.0", () => {
  console.log(`Four-cut photo booth is running on http://localhost:${port}`);
  console.log(`QR photos expire after ${ttlMinutes} minutes.`);
});
