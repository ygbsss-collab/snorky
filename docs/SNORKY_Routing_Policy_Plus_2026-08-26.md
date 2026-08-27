# SNORKY Plus 최적화 Routing Policy

작성일: 2026-08-26  
적용 대상: SNORKY 프로젝트의 Sol Advisor orchestration 요청

## 1. 운영 목표

- Primary는 `gpt-5.6-terra` / `high`를 사용한다.
- Primary는 작업 분류, 범위 통제, agent 선택, diff 검증, 최종 수락을 담당한다.
- 가장 저비용이면서 충분한 agent를 우선 선택한다.
- Sol은 일반 구현에 사용하지 않고 핵심 변경의 독립 검토에 사용한다.
- MICRO를 제외한 단순 UI·일반 JS 작업은 편의상 `solo`로 처리하지 않는다.

## 2. Route 분류표

### MICRO

대상:

- 단일 문자열 수정
- 단일 CSS 값 수정
- 오타 수정
- 한 줄 수준의 명백한 수정

Route:

- `solo` 허용
- Primary가 직접 수정·검증한다.

### UI

대상:

- HTML, CSS, SVG
- 레이아웃, 문구, 일반 UI 변경
- 그래프 표시·스타일 변경

Route:

- `delegate`
- Implementer: `sol_advisor_luna_implementer`
- Primary는 범위와 diff를 검증한다.

### GENERAL_JS

대상:

- 일반 frontend JavaScript
- 이벤트와 UI 상태
- Reader 연결
- 화면 단위 기능

Route:

- `delegate`
- Implementer: `sol_advisor_luna_implementer`
- Primary는 인터페이스, diff, 관련 동작을 검증한다.

### GENERAL_COMPLEX

대상:

- 여러 파일 연동
- 판단이 필요한 일반 기능
- Luna 범위를 넘어서는 구현

Route:

- `delegate`
- Implementer: `sol_advisor_terra_implementer`
- Primary는 전체 변경 범위와 회귀 위험을 검증한다.

### BACKEND

대상:

- API, Cache, Supabase
- Edge Function, Scheduler
- 일반 DB 연동

Route:

- `delegate`
- Implementer: `sol_advisor_terra_implementer`
- Primary는 계약, 저장·조회 경로, diff, 검증 결과를 확인한다.

### CRITICAL

대상:

- Evaluation, Safety, Condition Pipeline
- 핵심 알고리즘과 데이터 계약
- 핵심 DB schema

Route:

- `full`
- Implementer: `sol_advisor_terra_implementer`
- Primary 검증 후 `sol_advisor_sol_reviewer`가 독립 검토한다.

### ARCHITECTURE

대상:

- 대규모 refactor
- V1 제거
- 공통 Pipeline 전환
- 광범위한 DB 변경
- 여러 핵심 계층의 동시 변경

Route:

- `full`
- Implementer: `sol_advisor_terra_implementer`
- Primary 검증 후 `sol_advisor_sol_reviewer`가 독립 검토한다.

## 3. 승격 규칙

- Luna가 작업 중 예상보다 복잡하거나 위험하다고 판단하면 임의로 범위를 확장하지 않는다.
- Luna는 Primary에 복잡도·위험 신호와 근거를 보고한다.
- Primary가 근거를 확인한 뒤 `delegate`를 Terra 구현 lane으로 승격한다.
- Terra 작업 중 Evaluation, Safety, Condition Pipeline, 핵심 알고리즘, 데이터 계약 또는 Architecture 위험이 확인되면 `full`로 승격한다.
- `full` 승격 시 Terra 구현, Primary 검증, 새 Sol reviewer 독립 검토 순서를 따른다.
- 승격 전후 route를 명시적으로 기록하며 조용히 route를 낮추지 않는다.

## 4. 금지 규칙

- UI, CSS, HTML, SVG, 일반 JS를 기본 `solo`로 처리하지 않는다. MICRO만 예외다.
- MICRO 조건이 아닌데 Primary가 직접 구현하지 않는다.
- Sol reviewer를 일반 UI 또는 일반 backend 작업에 사용하지 않는다.
- Implementer는 소유 파일 밖을 수정하지 않는다.
- 요청 범위를 넘어 설계·리팩터링·정리 작업을 임의로 추가하지 않는다.
- 기존 코드·명세·데이터 계약과 충돌하면 임의로 확정하지 말고 Primary에 보고한다.

## 5. Primary 운영 절차

1. 요청을 MICRO, UI, GENERAL_JS, GENERAL_COMPLEX, BACKEND, CRITICAL, ARCHITECTURE 중 하나로 분류한다.
2. 작업 시작 전에 `SELECTIVE ROUTE`와 분류 근거를 한국어로 선언한다.
3. delegate/full인 경우 정확한 Implementer와 소유 파일을 지정한다.
4. Implementer 결과를 주장으로만 수락하지 않고 실제 diff, 변경 파일 목록, 검증 결과를 직접 확인한다.
5. `audit` 또는 `full`에서만 새 Sol reviewer를 사용한다.
6. 검증 실패·범위 초과·새 위험이 있으면 해당 route를 승격하거나 중단한다.
7. 최종 수락은 Primary가 수행한다.

## 6. Agent 역할 기준

| Agent | Model | Reasoning | 사용 범위 |
|---|---|---:|---|
| `sol_advisor_luna_implementer` | `gpt-5.6-luna` | `max` | UI·일반 JS의 bounded 구현 |
| `sol_advisor_terra_implementer` | `gpt-5.6-terra` | `high` | 복잡·backend·critical 구현 |
| `sol_advisor_sol_reviewer` | `gpt-5.6-sol` | `high` | `full`의 독립 read-only 검토 |

이 정책은 SNORKY 프로젝트의 요청별 route 선택을 위한 운영 기준이다. 설치된 Sol Advisor plugin cache와 agent TOML을 대신하거나 수정하지 않는다.
