# EvidenceDesk

EvidenceDesk는 **명확히 가상인** 한국어 회사 정책 fixture를 대상으로 하는 작고 실행 가능한 근거 검색 데모입니다. 키워드와 바이그램으로 상위 3개 근거를 찾고, 답변 및 source ID 인용을 JSON으로 반환합니다. 기본값은 **LLM이 아닌 오프라인 추출형 데모**입니다.

## 설계

```text
브라우저 → POST /api/ask → 질문 검증 → 문서 검색 → 상위 3개 근거
                                            ├ 근거 없음: 응답 보류
                                            ├ API 키 없음: 원문 추출
                                            └ API 키 있음: OpenAI → 응답/인용 검증
```

- Frontend: HTML5, CSS, JavaScript, Fetch API
- Backend: Node.js 22 이상, 내장 HTTP 서버
- AI/Data: 단어 및 연속 두 단어 검색, JSON 문서, 선택적 OpenAI API
- Infra: Dockerfile, node:test. 외부 npm 의존성 없음
- 검색 점수는 단어 포함 1점, 연속 두 단어 포함 2점입니다. 동점은 source ID로 정렬합니다. 이는 임베딩 검색이나 BM25가 아닙니다.

## 실행

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

## 선택적 OpenAI

`OPENAI_API_KEY`가 있을 때만 Node 내장 `fetch`로 OpenAI Chat Completions를 호출합니다. 키가 없으면 외부 호출은 없습니다.

```powershell
$env:OPENAI_API_KEY="your-key"
npm start
```

`.env.example`은 환경 변수 목록이며 자동으로 로드되지 않습니다. 위 PowerShell 환경 변수 설정을 사용하세요. OpenAI 모드는 질문과 검색된 문서 발췌를 외부 API에 전송하며 비용이 발생할 수 있으므로, 기밀 문서를 넣지 마세요.

OpenAI에는 JSON 형태 `{ "answer": "string", "citations": ["string"] }`만 요구합니다. 질문과 근거는 신뢰할 수 없는 데이터로 전달하며, 서버는 상위 근거 ID만 인용했는지 검증합니다. 그렇더라도 모델 응답의 근거 충실성을 보장할 수는 없습니다. 근거가 없으면 provider/OpenAI를 호출하지 않고 명시적으로 답변을 보류합니다. 업스트림 실패·시간 초과·형식/인용 오류는 502입니다.

## Docker

```powershell
docker build -t evidencedesk .
docker run --rm -p 127.0.0.1:3000:3000 evidencedesk
```

컨테이너는 non-root `node` 사용자로 실행합니다. Docker 실행과 실제 OpenAI 모델 호출은 이 프로젝트 검증에서 실행하지 않았습니다.

## 확인된 실행 결과

- Windows / Node.js 26.5.0에서 `npm test`: 테스트 11개 통과, 실패 0개. 하위 테스트를 포함한 수치입니다.
- 실제 제공 문서로 HTTP 확인: 홈페이지 200, 질문 API 200.
- `출장비는 언제 정산하나요?` 질문에서 `POL-EXP`와 `30일 안에 정산` 원문을 반환했습니다.
- OpenAI 어댑터는 mock 응답으로 검증했습니다. 실제 모델 품질과 비용은 측정하지 않았습니다.
- 이 결과는 검색 정확도 100%, 테스트 커버리지 100%, 업무 시간 절감 또는 운영 실적을 의미하지 않습니다.

## 범위와 한계

- 문서는 `data/docs.json`의 가상 fixture이며, 문서 업로드 UI는 없습니다.
- 질문은 1~500자, 요청 본문은 최대 8192바이트입니다. 정적 파일은 정확한 allowlist만 제공하고 query string은 경로 판정에서 제외하며, UI는 `textContent`로 렌더링합니다.
- 인증·권한·감사로그·레이트 리밋이 없으므로 localhost 데모 전용입니다. 프로덕션 보안을 주장하지 않습니다.
- 벡터 검색, React, 실제 사내 정책 또는 사업 성과를 제공하거나 주장하지 않습니다.
- 한국어 조사·동의어를 정규화하지 않으므로 표현이 달라지면 검색에 실패할 수 있습니다. 문서 발췌는 앞 220자로 제한됩니다.
- 인용 ID 검증은 인용 대상의 존재만 확인하며, 문장 내용의 사실성이나 프롬프트 인젝션 방어를 보장하지 않습니다.
- Node.js 22 최소 버전 및 Docker 컨테이너는 별도 실행 검증하지 않았습니다.
- 테스트 fixture 결과는 사업 성공 지표가 아닙니다.
- 이 프로젝트는 AI의 도움으로 생성되었습니다.

## API

`POST /api/ask`에 `{ "question": "..." }`를 보냅니다. 성공 응답에는 `mode`, `answer`, `citations`, `evidence`가 포함됩니다. 모든 `citations`는 반환된 `evidence`의 `sourceId`만 참조합니다.