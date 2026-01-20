---
description: 코드베이스 전체 구조 분석 및 문서화. thoughts/shared/research/에 저장
allowed-tools: Read, Grep, Bash
argument-hint: [focus-area]
---

# 코드베이스 연구

## 목표

프로젝트의 구조, 기술 스택, 핵심 모듈을 분석하고 문서화합니다.
분석 결과는 `thoughts/shared/research/` 디렉토리에 저장됩니다.

## 실행 순서

### 1. 프로젝트 구조 파악

```bash
tree -L 3 -I 'build|.dart_tool|node_modules|.git' .
```

### 2. 핵심 파일 분석

- **pubspec.yaml**: 의존성, SDK 버전 확인
- **lib/ 구조**: 아키텍처 패턴 파악
- **main.dart**: 앱 진입점 및 초기화
- **README.md**: 프로젝트 개요

### 3. 기술 스택 정리

- 언어 및 프레임워크
- 상태 관리 (Provider, Riverpod, GetX 등)
- 데이터 레이어 (API, 로컬 DB)
- 라우팅 방식
- 주요 의존성 패키지

### 4. 아키텍처 분석

- Clean Architecture / MVVM / MVC 여부
- 폴더 구조 규칙
- 레이어 분리 (Presentation, Domain, Data)

### 5. 특정 기능 집중 분석 (인자로 전달된 경우)

사용자가 특정 영역을 지정한 경우 해당 부분을 중점적으로 분석:
- 관련 파일 목록
- 핵심 클래스/함수
- 데이터 흐름
- 의존성 관계

## 결과 형식

### 파일명
`thoughts/shared/research/[프로젝트명]_[focus-area]_[날짜].md`

예: `thoughts/shared/research/poozizic_music_playback_2026-01-09.md`

### 내용 구조

```markdown
# [프로젝트명] 코드베이스 연구

**날짜**: 2026-01-09
**분석 대상**: [전체 / 특정 기능]

## 1. 프로젝트 개요
- 목적
- 주요 기능

## 2. 기술 스택
- Flutter 버전
- Dart 버전
- 상태 관리
- 주요 패키지

## 3. 프로젝트 구조
```
lib/
├── core/
├── features/
├── shared/
└── main.dart
```

## 4. 아키텍처 패턴
- 사용 중인 패턴
- 레이어 분리 방식

## 5. 핵심 모듈 (3-5개)
### 모듈 1: [이름]
- 위치: lib/...
- 역할: ...
- 주요 클래스: ...

## 6. 발견된 패턴
- 네이밍 규칙
- 코드 스타일
- 베스트 프랙티스

## 7. 주의사항
- 기술 부채
- 개선 필요 영역
```

## 주의사항

- 코드를 수정하지 말고 **분석만** 수행
- 60% 컨텍스트 초과 시 문서 저장 후 중단
- 병렬 에이전트 활용 가능 (여러 모듈 동시 분석)
