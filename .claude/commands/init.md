---
description: Initialize thoughts directory structure for daily work logs
allowed-tools: Bash(mkdir:*), Write
argument-hint: [optional-category]
---

# Initialize Thoughts Directory

## Your Task

Initialize or update the thoughts directory structure for organizing daily work logs.

**Directory Structure:**
```
thoughts/
└── personal/
    ├── research/    # 코드베이스 분석, 탐색
    ├── plans/       # 기능 구현 계획
    ├── implement/   # 구현 작업 기록
    ├── prs/         # PR 관련 문서
    └── validate/    # 검증 작업
```

**Steps:**
1. Create the directory structure if it doesn't exist
2. If `$ARGUMENTS` is provided (research/plans/implement/prs/validate), create a new markdown file in that category with today's date
3. If no argument is provided, just create the directory structure

**File naming convention:**
- Format: `YYYY-MM-DD_description.md`
- Example: `2026-01-06_lint-fix-notification-page.md`

**Template for new files:**
```markdown
# YYYY-MM-DD | [Title]

## 작업 내용
[작업 설명]

## 파일
- [수정한 파일 목록]

## 문제
[해결한 문제]

## 해결 방법
[해결 방법 설명]

## 결과
[작업 결과]
```

Provide clear feedback on what was created.
