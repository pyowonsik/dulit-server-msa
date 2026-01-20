---
description: 계획 대비 실제 구현 검증. 누락 사항 및 차이점 확인
allowed-tools: Read, Bash(git:*), Grep
argument-hint: @plan-file [phase-number]
---

# 구현 검증

## 목표

작성된 계획 문서와 실제 구현된 코드를 비교하여:
- 계획대로 구현되었는지 확인
- 누락된 작업이 있는지 체크
- 예상치 못한 변경사항 파악
- 종합 검증 보고서 생성

## 사용 방법

```
/validate-plan @thoughts/shared/plans/playlist_feature_plan.md
```

특정 Phase만 검증:
```
/validate-plan @thoughts/shared/plans/playlist_feature_plan.md Phase 1
```

## 검증 프로세스

### 1. 계획 문서 분석
- 계획 파일 읽기
- 각 Phase별 작업 목록 추출
- 성공 기준 확인

### 2. Git 커밋 이력 확인

**최근 커밋 조회**:
```bash
git log --oneline -10
```

**특정 기간 변경사항**:
```bash
git log --since="2026-01-09" --oneline
```

**커밋별 변경 파일**:
```bash
git show --name-only [commit-hash]
```

**전체 diff 확인**:
```bash
git diff [시작-commit]..[끝-commit]
```

### 3. 파일 변경사항 검증

**계획에 명시된 파일들**:
- 각 Phase에서 수정하기로 한 파일 목록 확인
- 실제 변경된 파일과 대조

**예상치 못한 변경**:
- 계획에 없지만 수정된 파일 확인
- 왜 변경되었는지 분석

### 4. 코드 내용 검증

**주요 체크 포인트**:
- ✅ 모델 클래스 구현 여부
- ✅ Repository 패턴 적용 여부
- ✅ Provider/ViewModel 생성 여부
- ✅ UI 위젯 구현 여부
- ✅ 라우팅 연결 여부
- ✅ 에러 핸들링 추가 여부

**코드 검색**:
```bash
# 특정 클래스 존재 확인
grep -r "class PlaylistRepository" lib/

# 특정 함수 구현 확인
grep -r "Future<List<Playlist>>" lib/
```

### 5. 테스트 검증

**테스트 파일 존재 확인**:
```bash
find test/ -name "*_test.dart"
```

**테스트 실행**:
```bash
flutter test
```

**커버리지 확인** (선택):
```bash
flutter test --coverage
```

### 6. 성공 기준 체크

계획서의 "성공 기준" 섹션과 대조:
- [ ] 기준 1: 달성 여부
- [ ] 기준 2: 달성 여부

## 검증 보고서 형식

### 파일명
`thoughts/shared/validate/[feature]_validation_[날짜].md`

### 내용 구조

```markdown
# [기능명] 구현 검증 보고서

**검증 날짜**: 2026-01-09
**계획 문서**: thoughts/shared/plans/[feature]_plan.md
**검증 범위**: [전체 / Phase 1-2]

## 1. 검증 요약

### 전체 진행률
- Phase 1: ✅ 완료
- Phase 2: ✅ 완료
- Phase 3: 🔄 진행 중 (60%)
- Phase 4: ⏳ 미착수

### 종합 평가
- ✅ 계획 대비 충실도: High/Medium/Low
- ⚠️ 누락 사항: [개수]개
- 📝 추가 구현: [개수]개

---

## 2. Phase별 상세 검증

### Phase 1: 준비 및 기반 작업

**계획된 작업**:
- [x] pubspec.yaml에 패키지 추가
- [x] 기본 디렉토리 구조 생성
- [x] 모델 클래스 정의

**실제 구현**:
- ✅ **pubspec.yaml**: dio, freezed 추가 완료
  - 커밋: abc1234 "feat: add dependencies"
  - 파일: pubspec.yaml

- ✅ **디렉토리 구조**: 계획대로 생성
  ```
  lib/features/playlist/
  ├── data/
  ├── domain/
  └── presentation/
  ```

- ✅ **모델 클래스**: Playlist, PlaylistItem 생성
  - 커밋: def5678 "feat: add playlist models"
  - 파일: lib/features/playlist/domain/models/playlist.dart

**검증 결과**:
- ✅ 모든 작업 완료
- ✅ 빌드 성공 확인
- ✅ 테스트 통과

**이슈**: 없음

---

### Phase 2: 핵심 기능 구현

**계획된 작업**:
- [x] Repository 구현
- [ ] Use Case 구현
- [x] ViewModel 구현

**실제 구현**:
- ✅ **Repository**: PlaylistRepository 구현
  - 커밋: ghi9012 "feat: implement playlist repository"
  - 파일: lib/features/playlist/data/repositories/playlist_repository.dart
  - 내용: CRUD 메서드 모두 구현됨

- ⚠️ **Use Case**: 누락됨
  - **문제**: 계획에는 Use Case 레이어가 있었으나 구현되지 않음
  - **영향**: Repository를 직접 호출하는 구조로 변경됨
  - **권장 조치**: Use Case 추가 또는 계획 수정

- ✅ **ViewModel**: PlaylistViewModel 구현
  - 커밋: jkl3456 "feat: add playlist viewmodel"
  - 파일: lib/features/playlist/presentation/viewmodels/playlist_viewmodel.dart
  - 내용: Riverpod StateNotifier 사용

**검증 결과**:
- 🔶 부분 완료 (2/3)
- ⚠️ Use Case 레이어 누락

**이슈**:
- Use Case 없이 Repository 직접 호출: 계획과 불일치

---

### Phase 3: UI 구현

**계획된 작업**:
- [x] 위젯 구현
- [x] 라우팅 연결
- [ ] 상태 관리 연결

**실제 구현**:
- ✅ **위젯**: PlaylistScreen, PlaylistTile 구현
  - 커밋: mno7890 "feat: add playlist UI"

- ✅ **라우팅**: go_router 설정 추가

- 🔄 **상태 관리**: 50% 완료
  - Provider는 연결했으나 에러 핸들링 미구현

**검증 결과**:
- 🔄 진행 중

---

## 3. 예상치 못한 변경사항

### 추가 구현
1. **lib/core/utils/logger.dart** (계획에 없음)
   - 커밋: pqr1234
   - 사유: 디버깅을 위한 로거 유틸리티
   - 영향: 긍정적 (좋은 추가)

2. **lib/features/playlist/data/models/playlist_dto.dart**
   - 커밋: stu5678
   - 사유: API 응답 파싱용 DTO
   - 영향: 필수 (계획 업데이트 필요)

### 삭제/미구현
1. **Use Case 레이어** (위에서 언급)

---

## 4. 성공 기준 달성 여부

계획서의 성공 기준:

- [x] ✅ 기준 1: 플레이리스트 CRUD 동작
  - 검증: Repository 메서드 구현 완료

- [x] ✅ 기준 2: UI에서 플레이리스트 표시
  - 검증: PlaylistScreen에서 목록 렌더링 확인

- [ ] ⏳ 기준 3: 에러 핸들링
  - 상태: 미완성 (Phase 3 진행 중)

- [ ] ⏳ 기준 4: 테스트 커버리지 80% 이상
  - 상태: 현재 45% (test 파일 부족)

---

## 5. 발견된 이슈 및 권장 조치

### Critical (즉시 수정 필요)
없음

### High (조만간 해결 필요)
1. **Use Case 레이어 누락**
   - 권장: Use Case 추가 또는 계획 문서 수정
   - 이유: Clean Architecture 원칙 위반

### Medium
1. **테스트 부족**
   - 현재 커버리지: 45%
   - 목표: 80%
   - 권장: Phase 4에서 테스트 추가

2. **에러 핸들링 미완성**
   - Phase 3에서 완료 필요

### Low
1. **주석 부족**
   - 일부 복잡한 로직에 주석 추가 권장

---

## 6. 다음 단계 제안

### 즉시 조치
1. Phase 3 완료: 상태 관리 에러 핸들링
2. Use Case 레이어 추가 여부 결정

### Phase 4 준비
1. 테스트 작성 계획
2. 성능 최적화 항목 확인

---

## 7. 종합 의견

**긍정적인 점**:
- ✅ 전반적으로 계획에 충실하게 구현
- ✅ 코드 품질 양호
- ✅ Git 커밋 메시지 명확

**개선 필요**:
- ⚠️ Use Case 레이어 누락 해결 필요
- ⚠️ 테스트 커버리지 향상 필요

**추천**:
- Phase 3 완료 후 Use Case 추가 또는 계획 수정
- Phase 4에서 테스트 집중 작성
```

## 주의사항

- **객관적 평가**: 감정 배제, 사실 기반 검증
- **누락 사항 놓치지 않기**: 계획의 모든 항목 하나씩 체크
- **Git 이력 정확히 추적**: 실제 커밋 해시와 날짜 기록
- **건설적 피드백**: 문제점뿐만 아니라 해결 방안 제시
- **컨텍스트 40% 이하 유지**: 검증은 비교적 컨텍스트 적게 사용

## 검증 후 조치

검증 보고서 완료 후:

1. **사용자에게 보고**
2. **이슈 발견 시**: 수정 또는 계획 조정 논의
3. **모든 Phase 완료 시**: 최종 검증 및 문서화
4. **다음 기능 준비**: /research-codebase로 새로운 사이클 시작
