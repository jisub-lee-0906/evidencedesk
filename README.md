# EvidenceDesk | 근거 기반 문서 검색 데모

가상의 한국어 정책 문서에서 **근거 검색 → 답변·인용 ID 검증 → 근거가 없으면 응답 보류**를 처리하는 로컬 데모입니다. 기본 모드는 **LLM 호출 없는 오프라인 추출형 응답**입니다.

[요청·서버 구현](server.mjs) · [검색·응답 로직](rag.mjs) · [테스트](tests.test.mjs) · [IT 운영 포트폴리오](https://github.com/jisub-lee-0906/engineering-portfolio)

## 프로젝트 개요

규정 질문에 문서 근거를 함께 반환하고, 근거가 없거나 인용 형식이 맞지 않을 때 응답을 제한하는 작은 구현입니다. 실제 회사 자료가 아닌 `data/docs.json`의 **가상 fixture**를 사용합니다.

| 항목 | 내용 |
| --- | --- |
| 형태 | localhost 전용 문서 검색 데모 |
| 핵심 기술 | Node.js 22+, 내장 HTTP·Fetch·node:test, HTML/CSS/JavaScript |
| 의존성 | 외부 npm 패키지 없음. 선택형 OpenAI 모드 |
| 범위 | 키워드·바이그램 검색과 응답 검증. 벡터 DB·업무용 운영 서비스는 아님 |

## 주요 내용

- 단어 포함 1점·연속 두 단어 포함 2점으로 점수를 계산해 **상위 3개 근거**를 반환합니다. 동점은 source ID로 정렬합니다.
- API 키가 없으면 문서 원문에서 답을 추출하고, 근거가 없으면 provider를 호출하지 않고 응답을 보류합니다.
- 답변 JSON의 형식·길이·인용 중복과 반환된 근거 ID 안에서의 참조 여부를 검사합니다.
- 질문 길이·본문 크기·정적 경로를 제한하고, 화면 출력에는 `textContent`를 사용합니다.
- 선택형 OpenAI 모드의 업스트림 오류·시간 초과·형식/인용 오류는 502로 반환합니다.

## 구조와 기술

```text
브라우저 → POST /api/ask → 질문 검증 → 문서 검색 → 상위 3개 근거
                                             ├ 근거 없음: 응답 보류
                                             ├ API 키 없음: 원문 추출
                                             └ API 키 있음: OpenAI → 응답·인용 검증
```

```text
server.mjs       요청·본문·정적 경로 제한, HTTP 응답
rag.mjs          검색 점수·오프라인 추출·선택형 OpenAI
public/          HTML/CSS/JavaScript 화면
data/docs.json   가상 정책 fixture
tests.test.mjs   오프라인·mock 기반 테스트
Dockerfile       non-root Node 컨테이너 구성
```

검색은 임베딩이나 BM25가 아닙니다. OpenAI를 선택해도 서버는 상위 근거 ID만 인용했는지 검사할 뿐, 답변의 사실성을 보장하지 않습니다.

## 실행·사용 방법

Node.js 22 이상이 필요합니다. 의존성은 없습니다.

```powershell
cd evidencedesk
npm start
```

`http://127.0.0.1:3000`에서 `출장비는 언제 정산하나요?`를 입력해 보세요. 기본 host는 localhost이며 `HOST`, `PORT` 환경 변수로 변경할 수 있습니다.

```powershell
npm test
```

테스트는 `apiKey: ''`와 mock provider/fetch를 사용하므로 외부 네트워크나 OpenAI API 호출을 하지 않습니다.

### 질문 API

`POST /api/ask`에 `{ "question": "..." }`를 보냅니다. 성공 응답에는 `mode`, `answer`, `citations`, `evidence`가 포함됩니다. 모든 `citations`는 반환된 `evidence`의 `sourceId`만 참조합니다.

<details>
<summary>선택형 OpenAI: 환경 변수·전송·비용</summary>

`OPENAI_API_KEY`가 있을 때만 Node 내장 `fetch`로 OpenAI Chat Completions를 호출합니다. 키가 없으면 외부 호출은 없습니다.

```powershell
$env:OPENAI_API_KEY="your-key"
npm start
```

`.env.example`은 환경 변수 목록이며 자동으로 로드되지 않습니다. 위 PowerShell 환경 변수 설정을 사용하세요. OpenAI 모드는 질문과 검색된 문서 발췌를 외부 API에 전송하며 비용이 발생할 수 있으므로, 기밀 문서를 넣지 마세요.

OpenAI에는 JSON 형태 `{ "answer": "string", "citations": ["string"] }`만 요구합니다. 질문과 근거는 신뢰할 수 없는 데이터로 전달하며, 서버는 상위 근거 ID만 인용했는지 검증합니다. 그렇더라도 모델 응답의 근거 충실성을 보장할 수는 없습니다. 근거가 없으면 provider/OpenAI를 호출하지 않고 명시적으로 답변을 보류합니다. 업스트림 실패·시간 초과·형식/인용 오류는 502입니다.

</details>

<details>
<summary>선택형 Docker 실행</summary>

```powershell
docker build -t evidencedesk .
docker run --rm -p 127.0.0.1:3000:3000 evidencedesk
```

컨테이너는 non-root `node` 사용자로 실행합니다. Docker 실행과 실제 OpenAI 모델 호출은 이 프로젝트 검증에서 실행하지 않았습니다.

</details>

## 검증과 한계

### 기존 실행 기록

| 기록 | 확인된 결과 | 확인하지 않은 범위 |
| --- | --- | --- |
| Windows / Node.js 26.5.0 | `npm test` **11개 통과**, 실패 0개. 하위 테스트 포함 | Node.js 22 최소 버전·Docker 컨테이너 |
| 제공 fixture의 HTTP 요청 | 홈페이지 200, 질문 API 200. `출장비는 언제 정산하나요?`에서 `POL-EXP`와 `30일 안에 정산` 원문 반환 | 실제 사내 문서·다른 표현의 검색 정확도 |
| 선택형 OpenAI 어댑터 | mock 응답으로 검증 | 실제 모델 품질·비용 측정 |

이 결과는 기존 로컬 실행 기록이며 새 실행이나 검색 정확도 100%, 테스트 커버리지 100%, 업무 시간 절감·운영 실적을 의미하지 않습니다.

### 사용 범위와 제한

- 문서는 `data/docs.json`의 가상 fixture이며, 문서 업로드 UI는 없습니다.
- 질문은 1~500자, 요청 본문은 최대 8192바이트입니다. 정적 파일은 정확한 allowlist만 제공하며 UI는 `textContent`로 렌더링합니다.
- 인증·권한·감사로그·레이트 리밋이 없으므로 localhost 데모 전용입니다. 프로덕션 보안을 주장하지 않습니다.
- 벡터 검색, React, 실제 사내 정책 또는 사업 성과를 제공하거나 주장하지 않습니다.
- 한국어 조사·동의어를 정규화하지 않으므로 표현이 달라지면 검색에 실패할 수 있습니다. 문서 발췌는 앞 220자로 제한됩니다.
- 인용 ID 검증은 인용 대상의 존재만 확인하며, 문장 내용의 사실성이나 프롬프트 인젝션 방어를 보장하지 않습니다.
- Node.js 22 최소 버전 및 Docker 컨테이너는 별도 실행 검증하지 않았습니다.
- 테스트 fixture 결과는 사업 성공 지표가 아닙니다.

## 기여와 관련 문서

이지섭이 AI 도구의 도움으로 제작한 개인 프로젝트입니다. 정책 문서는 가상 예시이며 실제 사내 규정·사업 성과로 소개하지 않습니다.

- [가상 정책 데이터](data/docs.json)
- [실행 환경 변수 목록](.env.example)
- [오프라인·mock 테스트](tests.test.mjs)
- [IT 운영 포트폴리오](https://github.com/jisub-lee-0906/engineering-portfolio)
