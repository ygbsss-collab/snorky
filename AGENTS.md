# SNORKY 프로젝트 작업 지침

## 적용 범위와 권위

- 이 지침은 SNORKY 프로젝트의 모든 작업 요청에 적용한다.
- `docs/SNORKY_Routing_Policy_Plus_2026-08-26.md`를 SNORKY 라우팅의 authoritative policy로 사용한다.
- SNORKY 작업에서는 원본 `sol-advisor` 대신 로컬 marketplace의 `snorky-sol-advisor` plugin을 사용한다. marketplace 파일은 `C:\Users\user\Documents\Codex\snorky-marketplace\.agents\plugins\marketplace.json`이며 plugin source는 `C:\Users\user\Documents\Codex\snorky-marketplace\plugins\snorky-sol-advisor`이다.
- 사용자가 별도 route를 지정하지 않아도 `snorky-sol-advisor`의 `orchestration` skill을 기준으로 자동 분류·위임한다.
- 정책과 코드 또는 다른 문서가 충돌하면 기준을 임의로 수정·확정하지 말고 Primary에 보고한다.
- 기존 source, API, Supabase, migration, SQL, specification을 요청 범위 밖에서 수정하지 않는다.

## Primary 책임

- Primary는 `gpt-5.6-terra` / `high` 기준으로 작업 분류, route 선언, 범위 통제, agent 선택, diff 검증, 테스트 검증, 최종 수락을 담당한다.
- SNORKY 프로젝트의 Primary 기준은 `gpt-5.6-terra` / `high`이다. Sol Advisor orchestration의 전역 `gpt-5.6-sol` / `high` Primary 확인 요구와 충돌할 경우, SNORKY의 프로젝트 정책과 실제 `config.toml` 설정을 우선 기준으로 삼고 Terra/high에서 자동 라우팅을 계속한다. `gpt-5.6-sol`은 CRITICAL·ARCHITECTURE의 독립 reviewer로만 사용한다.
- 이 프로젝트 지침은 plugin 원본 skill의 실행 게이트 자체를 수정하지 않는다. 실행 환경이 Sol/high 불일치로 중단을 강제하면 이를 프로젝트 정책 위반으로 보고하고, plugin cache를 임의 수정하지 않는다.
- 사용자가 route 또는 agent를 지정하지 않아도 자연어 요청을 바탕으로 내부적으로 분류, route, implementer를 결정한다.
- 모든 작업 시작 전에 분류와 route를 확인하고 `SELECTIVE ROUTE`를 선언한다.
- 구현 agent의 결과를 주장만으로 수락하지 말고 실제 diff, 변경 파일 목록, 검증 결과를 직접 확인한다.
- 모든 진행 보고와 최종 보고는 한국어로 작성한다. 코드, 파일명, 명령어, identifier, 원문 오류 메시지는 원문을 유지할 수 있다.

## 작업 분류와 라우팅

### MICRO

대상: 단일 문자열, 단일 CSS 값, 오타, 명백한 한 줄 수정.

Route: `solo` 허용. Primary가 직접 수정하고 검증한다.

### UI

대상: HTML, CSS, SVG, 레이아웃, 문구, 일반 UI, 그래프 표시·스타일.

Route: `delegate` → `sol_advisor_luna_implementer` 우선.

### GENERAL_JS

대상: frontend JS, 이벤트, 화면 상태, Reader 연결, 화면 단위 기능.

Route: `delegate` → `sol_advisor_luna_implementer` 우선.

### GENERAL_COMPLEX

대상: 여러 파일 연동 또는 일반 기능 중 판단이 필요한 작업.

Route: `delegate` → `sol_advisor_terra_implementer`.

### BACKEND

대상: API, Cache, Supabase, Edge Function, Scheduler, 일반 DB 연동.

Route: `delegate` → `sol_advisor_terra_implementer`.

### CRITICAL

대상: Evaluation, Safety, Condition Pipeline, 핵심 알고리즘, 데이터 계약, 핵심 DB schema.

Route: `full` → `sol_advisor_terra_implementer` 구현 → Primary 검증 → `sol_advisor_sol_reviewer` 독립 검토.

### ARCHITECTURE

대상: 대규모 refactor, V1 제거, 공통 Pipeline 전환, 광범위한 DB 변경.

Route: `full` → `sol_advisor_terra_implementer` 구현 → Primary 검증 → `sol_advisor_sol_reviewer` 독립 검토.

## 금지 규칙

- MICRO가 아닌 UI 또는 GENERAL_JS를 편의상 `solo`로 처리하지 않는다.
- Primary는 MICRO 외 일반 구현을 직접 수행하지 않는다.
- Luna로 충분하면 Terra로 올리지 않는다.
- Terra로 충분하면 Sol reviewer를 사용하지 않는다.
- Sol reviewer는 CRITICAL, ARCHITECTURE 또는 명확한 독립 검토가 필요한 경우에만 사용한다.
- 구현 agent는 요청 범위를 임의로 넓히거나 설계를 재정의하지 않는다.
- 구현 agent는 지정된 소유 파일 밖을 수정하지 않는다.

## 승격 규칙

- Luna가 예상보다 복잡하거나 위험하다고 판단하면 임의 확장하지 않고 중단 후 Primary에 보고한다.
- Primary가 근거를 확인하면 Terra 구현 lane으로 승격한다.
- Terra가 Evaluation, Safety, Condition Pipeline, 핵심 알고리즘, 데이터 계약 또는 Architecture 위험을 발견하면 `full` + `sol_advisor_sol_reviewer`로 승격한다.
- route 승격은 새로 확인된 위험과 근거를 기록하여 명시적으로 선언한다.

## 실행 원칙

- 작업 요청에서 사용자가 route나 agent를 직접 지정하도록 요구하지 않는다.
- 자연어 요청과 실제 변경 범위를 분석하여 위 분류 중 하나를 선택한다.
- `delegate`에서는 선택된 implementer가 전체 구현을 수행하고 Primary가 검증한다.
- `full`에서는 Terra 구현, Primary 검증, 새 Sol reviewer의 read-only 독립 검토 순서를 지킨다.
- 이 파일은 라우팅 지침이며 Sol Advisor plugin cache, agent TOML, 전역 `config.toml`을 대신하거나 수정하지 않는다.
