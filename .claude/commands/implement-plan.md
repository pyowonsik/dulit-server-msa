---
description: 계획의 특정 Phase만 구현. 한 번에 한 단계씩 실행
allowed-tools: Read, Edit, Write, Bash, Grep
argument-hint: @plan-file [phase-number]
---

# 계획 구현

## 목표

작성된 계획 문서(`thoughts/shared/plans/`)의 **특정 Phase만** 구현합니다.
한 번에 한 단계씩 집중하여 완성도를 높입니다.

## 사용 방법

```
/implement-plan @thoughts/shared/plans/playlist_feature_plan.md Phase 1
```

또는

```
/implement-plan @thoughts/shared/plans/playlist_feature_plan.md 1
```

## 실행 프로세스

### 1. 계획 문서 읽기
- 지정된 계획 파일 전체 내용 파악
- 현재 구현할 Phase 확인
- 이전 Phase 완료 여부 체크

### 2. Phase 분석
- **목표**: 이 단계에서 달성할 것
- **작업 목록**: 체크리스트 확인
- **예상 영향**: 수정할 파일 목록
- **의존성**: 선행 작업 확인
- **검증 방법**: 완료 기준

### 3. 구현 실행

**중요 원칙**:
- ✅ **한 번에 하나의 Phase만**: 다른 단계는 건드리지 않음
- ✅ **계획에 명시된 작업만**: 추가 기능 구현 금지
- ✅ **파일별로 순차 작업**: 한 파일 완료 후 다음 파일
- ✅ **기존 코드 존중**: 불필요한 리팩토링 금지

**작업 순서**:
1. 필요한 파일 읽기 (기존 패턴 파악)
2. 계획에 따라 코드 작성/수정
3. 코드 스타일 일관성 유지
4. 주석은 복잡한 로직에만 추가

### 4. 자동 검증 실행

**빌드 체크**:
```bash
flutter pub get
flutter analyze
```

**테스트 실행** (있는 경우):
```bash
flutter test
```

### 5. 사용자 수동 테스트 요청

구현 완료 후 다음과 같이 보고:

```markdown
## Phase [번호] 구현 완료

### 구현 내용
- ✅ 작업 1
- ✅ 작업 2

### 수정된 파일
- lib/features/.../file1.dart
- lib/features/.../file2.dart

### 자동 검증 결과
- ✅ flutter analyze: 통과
- ✅ flutter test: 통과

### 수동 테스트 필요
계획서의 검증 방법:
- [ ] 테스트 시나리오 1
- [ ] 테스트 시나리오 2

**다음 단계**: 수동 테스트 완료 후 다음 명령으로 Phase 2 진행:
`/implement-plan @thoughts/shared/plans/[파일명].md Phase 2`
```

## 에러 발생 시 대응

### 빌드 에러
1. 에러 메시지 분석
2. 원인 파악 및 수정
3. 재실행

### 테스트 실패
1. 실패한 테스트 확인
2. 코드 수정
3. 테스트 재실행

### 계획과 불일치
- 계획에 명시되지 않은 문제 발견 시:
  1. 사용자에게 보고
  2. 계획 업데이트 필요 여부 문의
  3. 승인 후 진행

## 주의사항

- **절대 여러 Phase 동시 구현 금지**: 한 번에 하나씩
- **계획 외 작업 금지**: "이것도 개선하면 좋겠다"는 생각 금지
- **과도한 최적화 금지**: 계획에 없으면 하지 않음
- **수동 테스트 필수**: 자동 테스트만으로는 UX 문제 못 잡음
- **60% 컨텍스트 체크**: 초과 시 현재 상태 저장 후 /clear

## 컨텍스트 관리

구현 중 컨텍스트가 60% 초과하면:

1. **현재 진행 상황 문서화**
   ```markdown
   ## Phase [번호] 진행 중

   ### 완료된 작업
   - ✅ 작업 1

   ### 진행 중인 작업
   - 🔄 작업 2 (50% 완료)

   ### 다음 작업
   - ⏳ 작업 3
   ```

2. **파일 저장**: `thoughts/shared/plans/[feature]_progress.md`

3. **/clear 실행**

4. **재개 시**: 진행 상황 문서 참조하여 이어서 작업

## 예제

### 사용 예시

```
사용자: /implement-plan @thoughts/shared/plans/playlist_feature_plan.md Phase 1

Claude:
1. 계획 문서 읽기... ✅
2. Phase 1 분석:
   - 목표: 기본 구조 및 의존성 설정
   - 작업: pubspec.yaml 수정, 모델 클래스 생성

3. 구현 시작...
   - pubspec.yaml에 패키지 추가 ✅
   - lib/features/playlist/domain/models/playlist.dart 생성 ✅

4. 자동 검증...
   - flutter analyze: 통과 ✅

5. 수동 테스트 요청:
   - [ ] 빌드 성공 확인
   - [ ] 모델 클래스 임포트 가능 확인

테스트 완료 후 다음 명령으로 진행하세요:
/implement-plan @thoughts/shared/plans/playlist_feature_plan.md Phase 2
```
