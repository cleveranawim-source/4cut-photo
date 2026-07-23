# 우리들의 네컷사진관

iPad로 네 장을 연속 촬영하고, 4×6 인화용 네컷 사진을 만들어 AirPrint로 인화하거나 iPad에 저장하는 학교 행사·학급 활동용 웹앱입니다. **서버가 필요 없는 정적 앱**이라 GitHub Pages 같은 정적 호스팅에 그대로 올릴 수 있습니다.

## 현재 들어 있는 기능

- 전면 카메라 미리보기와 3초 카운트다운
- 포즈를 바꿔가며 네 장 자동 촬영
- 살구 크림·베리 팝·미드나잇 프레임
- 1200×1800픽셀(4×6인치, 300dpi 기준) 인화 이미지 생성
- 한 장에 같은 2×6 스트립 두 개 배치 — 인화 후 가운데를 잘라 두 장으로 사용
- AirPrint용 4×6 인쇄 레이아웃
- iPad 저장·공유 및 다시 찍기
- 홈 화면에 추가할 수 있는 PWA (오프라인 캐시)

> 모든 처리는 iPad 브라우저 안에서만 이뤄집니다. 사진은 서버로 전송되지 않습니다.

## 컴퓨터에서 바로 실행

Node.js 20.19 이상이 필요합니다.

```powershell
npm install
npm run dev
```

브라우저에서 `http://localhost:4173`을 엽니다. 카메라 없이 전체 흐름을 확인하려면 첫 화면의 **카메라 없이 샘플로 둘러보기**를 누르세요.

프로덕션 빌드를 확인하려면:

```powershell
npm run build
npm run preview
```

## GitHub Pages 배포

이 저장소에는 `.github/workflows/deploy.yml`이 포함되어 있어, `main` 브랜치에 push하면 자동으로 빌드해 GitHub Pages에 배포합니다.

1. GitHub 저장소 **Settings → Pages** 로 이동합니다.
2. **Build and deployment → Source** 를 **GitHub Actions** 로 선택합니다.
3. `main` 브랜치에 push하면 Actions가 실행되고, 완료되면 다음 주소로 열립니다.
   `https://cleveranawim-source.github.io/4cut-photo/`

빌드는 상대 경로(`base: "./"`)로 만들어지므로 저장소 이름이 바뀌어도 하위 경로에서 그대로 동작합니다.

> iPadOS는 웹 카메라를 HTTPS 주소에서만 허용합니다. GitHub Pages는 HTTPS로 제공되므로 별도 설정 없이 카메라를 사용할 수 있습니다.

## iPad에서 사용하려면

1. iPad의 Safari에서 배포 주소를 엽니다.
2. 공유 버튼을 누르고 **홈 화면에 추가**를 선택합니다.
3. 생성된 **네컷사진관** 아이콘을 실행합니다.
4. 처음 한 번 카메라 사용을 허용합니다.

## AirPrint 프린터 연결

1. iPad와 AirPrint 지원 포토프린터를 같은 Wi‑Fi에 연결합니다.
2. 완성 화면에서 **사진 인쇄하기**를 누릅니다.
3. AirPrint 창에서 프린터와 4×6(Postcard) 용지를 선택합니다.
4. 가능하면 여백 없음, 컬러, 세로 방향으로 인쇄합니다.

학교 Wi‑Fi가 기기 간 통신을 차단하면 프린터가 검색되지 않을 수 있습니다. 행사 전용 공유기 한 대에 iPad와 프린터를 함께 연결하는 구성이 가장 안정적입니다. Canon SELPHY CP1500처럼 AirPrint와 4×6 엽서 용지를 모두 지원하는 승화형 포토프린터가 이 레이아웃에 잘 맞습니다.

## 운영 시 알아둘 점

- 웹앱이므로 인쇄할 때마다 iPad의 표준 AirPrint 창이 열립니다. 프린터를 기억하는 완전한 원터치 인쇄를 하려면 후속 네이티브 iPad 앱이 필요합니다.
- 사진은 어디에도 업로드되지 않고 iPad에만 남습니다. 저장·공유 버튼으로 사진 앱이나 AirDrop으로 내보내세요.

## 프로젝트 구조

```text
src/App.tsx        촬영, 합성, 인쇄 화면
src/styles.css     iPad 반응형 화면과 4×6 인쇄 CSS
public/            PWA 설치 파일과 아이콘 (manifest, sw.js, icon)
.github/workflows/ GitHub Pages 자동 배포 워크플로
```
