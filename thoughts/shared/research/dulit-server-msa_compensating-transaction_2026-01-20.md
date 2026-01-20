# Dulit Server MSA - 보상 트랜잭션 구현 연구

**날짜**: 2026-01-20
**분석 대상**: 보상 트랜잭션이 필요한 서비스 메서드들

---

## 1. 프로젝트 개요

### 1.1 기술 스택
- **Framework**: NestJS 10.x + Microservices 11.x
- **Database**: PostgreSQL (TypeORM) + MongoDB (Mongoose)
- **Message Broker**: RabbitMQ (AMQP)
- **Real-time**: Socket.io

### 1.2 MSA 구조
```
apps/
├── gateway/     # API Gateway
├── user/        # 사용자 서비스 (PostgreSQL)
├── couple/      # 커플 서비스 (PostgreSQL)
├── post/        # 게시글 서비스 (PostgreSQL)
├── chat/        # 채팅 서비스 (MongoDB)
└── notification/ # 알림 서비스 (MongoDB)
```

---

## 2. 현재 문제점 분석

### 2.1 분산 트랜잭션 패턴 현황

| 문제 ID | 파일 | 메서드 | 현재 패턴 | 문제점 |
|---------|------|--------|-----------|--------|
| #1 | couple.service.ts | connectCouple (연결) | Local TX + Remote Call | ChatRoom 실패 시 Couple 고아 데이터 |
| #2 | couple.service.ts | connectCouple (해제) | emit() (Fire-and-Forget) | 결과 확인 불가, ChatRoom 고아 데이터 |
| #3 | couple.service.ts | createMatchedNotification | emit() (Fire-and-Forget) | 알림 실패 감지 불가 |
| #4 | post.service.ts | createPost | 파일 이동 → DB 저장 | DB 실패 시 고아 파일 |
| #5 | post.service.ts | updatePost | 파일 삭제 → 이동 → DB | 중간 실패 시 파일 손실 |
| #6 | post.service.ts | deletePost | DB 삭제만 | 파일 삭제 누락 |
| #7 | calendar.service.ts | createCalendar | 파일 이동 → DB 저장 | DB 실패 시 고아 파일 |
| #8 | calendar.service.ts | updateCalendar | 파일 삭제 → 이동 → DB | 중간 실패 시 파일 손실 |
| #9 | couple.service.ts | connectCouple (해제) | 순차 삭제 | 중간 실패 시 부분 삭제 |

### 2.2 현재 코드의 문제 분석

#### couple.service.ts 분석
```typescript
// 현재 코드 (line 33-91)
async connectCouple(createCoupleDto: ConnectCoupleDto) {
  const queryRunner = this.dataSource.createQueryRunner();
  await queryRunner.startTransaction();

  try {
    if (isConnect) {
      // 1. Couple 생성 (Local TX)
      const couple = queryRunner.manager.create(Couple, {...});
      await queryRunner.manager.save(couple);  // ✅ 로컬 트랜잭션

      // 2. ChatRoom 생성 (Remote Call - send)
      await this.createChatRoom(me.id, partner.id, couple.id);  // ⚠️ 여기서 실패하면?
      // → couple은 이미 저장된 상태, rollback해도 couple만 롤백됨
    } else {
      // 해제 시
      await this.deleteChatroomAndChats(coupleId, me.id, partner.id);  // ❌ emit() 사용
      // → 결과를 기다리지 않음, 성공/실패 알 수 없음

      await queryRunner.manager.delete(Anniversary, { coupleId });
      await queryRunner.manager.delete(Plan, { coupleId });
      await queryRunner.manager.delete(Calendar, { coupleId });
      await queryRunner.manager.delete(Couple, { id: coupleId });
      // → 중간에 실패하면 일부만 삭제됨
    }

    // 알림 전송
    this.createMatchedNotification(me.id, isConnect);  // ❌ emit() - fire-and-forget
    this.createMatchedNotification(partner.id, isConnect);

    await queryRunner.commitTransaction();
  } catch (error) {
    await queryRunner.rollbackTransaction();  // ⚠️ 로컬 DB만 롤백
    throw error;
  }
}
```

**문제점:**
1. `createChatRoom()`은 `send()`로 결과를 기다리지만, 실패 시 이미 저장된 Couple 롤백 후 ChatRoom은 그대로 남을 수 있음
2. `deleteChatroomAndChats()`는 `emit()`으로 결과를 기다리지 않음
3. `createMatchedNotification()`도 `emit()`으로 결과 확인 불가

---

## 3. 분산 트랜잭션 전략 연구

### 3.1 Saga Pattern

분산 시스템에서 ACID 트랜잭션 대신 사용하는 패턴. 각 서비스의 로컬 트랜잭션을 순차 실행하고, 실패 시 보상 트랜잭션(Compensating Transaction)을 역순으로 실행.

#### 3.1.1 Choreography-based Saga (이벤트 기반)
```
┌─────────────┐    Event     ┌─────────────┐    Event     ┌─────────────┐
│   Couple    │ ──────────▶  │    Chat     │ ──────────▶  │ Notification│
│   Service   │              │   Service   │              │   Service   │
└─────────────┘              └─────────────┘              └─────────────┘
      ▲                            │                            │
      └────────────────────────────┴────────────────────────────┘
                        Compensation Events
```

**장점**: 느슨한 결합, 서비스 독립성
**단점**: 복잡한 플로우 추적, 디버깅 어려움

#### 3.1.2 Orchestration-based Saga (오케스트레이터 기반)
```
                    ┌─────────────────┐
                    │   Saga         │
                    │  Orchestrator   │
                    └─────────────────┘
                     ▲    │    │    ▲
            ┌────────┘    │    │    └────────┐
            │             │    │             │
      ┌─────▼─────┐  ┌────▼────▼────┐  ┌─────▼─────┐
      │  Couple   │  │    Chat      │  │Notification│
      │  Service  │  │   Service    │  │  Service   │
      └───────────┘  └──────────────┘  └────────────┘
```

**장점**: 중앙 집중 관리, 명확한 플로우
**단점**: 오케스트레이터가 SPOF(단일 장애점)

### 3.2 현재 프로젝트에 적합한 전략

**권장: Orchestration-based Saga + Compensating Transaction**

이유:
1. 이미 NestJS Microservices 사용 중
2. RabbitMQ `send()` 패턴으로 동기적 응답 가능
3. 복잡한 이벤트 체인보다 직관적

---

## 4. 구현 방안

### 4.1 CRITICAL (#1, #2): 커플 연결/해제

#### 4.1.1 커플 연결 (isConnect = true)

```typescript
// couple.service.ts

async connectCouple(createCoupleDto: ConnectCoupleDto) {
  const queryRunner = this.dataSource.createQueryRunner();
  await queryRunner.connect();
  await queryRunner.startTransaction();

  // 보상 트랜잭션 추적용 변수
  let coupleCreated = false;
  let chatRoomCreated = false;
  let coupleId: string | null = null;

  try {
    const { partnerId, isConnect, meta } = createCoupleDto;
    const me = await this.getUserById(meta.user.sub);
    const partner = await this.getUserById(partnerId);

    await this.validateCoupleStatus(me.id, partner.id, isConnect);

    if (isConnect) {
      // Step 1: Couple 생성 (Local)
      const couple = queryRunner.manager.create(Couple, {
        user1Id: me.id,
        user2Id: partner.id,
      });
      await queryRunner.manager.save(couple);
      coupleId = couple.id;
      coupleCreated = true;

      // Step 2: ChatRoom 생성 (Remote - 결과 확인)
      const chatRoomResult = await this.createChatRoomWithRetry(
        me.id,
        partner.id,
        couple.id
      );

      if (!chatRoomResult.success) {
        throw new Error('ChatRoom 생성 실패');
      }
      chatRoomCreated = true;

      // Step 3: 알림 전송 (결과 확인 - 실패해도 진행)
      await this.sendNotificationWithFallback(me.id, true);
      await this.sendNotificationWithFallback(partner.id, true);

    } else {
      // 해제 로직 (아래 4.1.2 참조)
    }

    await queryRunner.commitTransaction();
    return { success: true, message: '커플이 연결 되었습니다.' };

  } catch (error) {
    // Rollback Local Transaction
    await queryRunner.rollbackTransaction();

    // Compensating Transactions (역순)
    if (chatRoomCreated && coupleId) {
      await this.compensateDeleteChatRoom(coupleId);
    }
    // coupleCreated는 queryRunner.rollback()으로 자동 롤백됨

    this.logger.error(`커플 연결 실패 - 보상 트랜잭션 실행됨`, error);
    throw error;

  } finally {
    await queryRunner.release();
  }
}

// ChatRoom 생성 with 재시도
private async createChatRoomWithRetry(
  user1Id: string,
  user2Id: string,
  coupleId: string,
  maxRetries = 3
): Promise<{ success: boolean; data?: any }> {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const resp = await lastValueFrom(
        this.chatService.send(
          { cmd: 'create_chat_room' },
          { user1Id, user2Id, coupleId }
        ).pipe(timeout(5000))  // 5초 타임아웃
      );

      if (resp?.data) {
        return { success: true, data: resp.data };
      }
    } catch (error) {
      this.logger.warn(`ChatRoom 생성 시도 ${attempt}/${maxRetries} 실패`);
      if (attempt === maxRetries) {
        return { success: false };
      }
      await this.delay(1000 * attempt);  // 지수 백오프
    }
  }
  return { success: false };
}

// 보상 트랜잭션: ChatRoom 삭제
private async compensateDeleteChatRoom(coupleId: string): Promise<void> {
  try {
    await lastValueFrom(
      this.chatService.send(
        { cmd: 'delete_chatroom_by_couple_id' },
        { coupleId }
      ).pipe(timeout(5000))
    );
    this.logger.log(`보상 트랜잭션 성공: ChatRoom 삭제 (coupleId: ${coupleId})`);
  } catch (error) {
    // 보상 실패 시 Dead Letter Queue 또는 수동 처리 대기열에 추가
    this.logger.error(`보상 트랜잭션 실패: ChatRoom 삭제 실패`, {
      coupleId,
      error: error.message,
      needsManualIntervention: true
    });
    // TODO: DLQ에 추가하거나 관리자 알림
  }
}
```

#### 4.1.2 커플 해제 (isConnect = false)

```typescript
// couple.service.ts (connectCouple 메서드 내 else 블록)

else {
  coupleId = await this.getCoupleByUserId(me.id);

  if (!coupleId) {
    throw new NotFoundException('커플 관계가 존재하지 않습니다.');
  }

  // Step 1: ChatRoom/Chat 삭제 (Remote - send로 변경)
  const deleteChatResult = await this.deleteChatroomAndChatsWithConfirm(
    coupleId,
    me.id,
    partner.id
  );

  if (!deleteChatResult.success) {
    throw new Error('ChatRoom 삭제 실패');
  }

  // Step 2: 로컬 데이터 순차 삭제 (의존성 순서)
  await queryRunner.manager.delete(Anniversary, { coupleId });
  await queryRunner.manager.delete(Plan, { coupleId });
  await queryRunner.manager.delete(Calendar, { coupleId });
  await queryRunner.manager.delete(Couple, { id: coupleId });

  // Step 3: 알림 전송
  await this.sendNotificationWithFallback(me.id, false);
  await this.sendNotificationWithFallback(partner.id, false);
}

// emit() → send()로 변경
private async deleteChatroomAndChatsWithConfirm(
  coupleId: string,
  user1Id: string,
  user2Id: string
): Promise<{ success: boolean }> {
  try {
    const resp = await lastValueFrom(
      this.chatService.send(
        { cmd: 'delete_chatroom_and_chats' },
        { coupleId, user1Id, user2Id }
      ).pipe(timeout(10000))
    );

    return { success: resp?.status === 'success' };
  } catch (error) {
    this.logger.error('ChatRoom 삭제 실패', error);
    return { success: false };
  }
}
```

### 4.2 HIGH (#3): 알림 emit → send 변경

```typescript
// couple.service.ts

private async sendNotificationWithFallback(
  userId: string,
  isConnect: boolean
): Promise<void> {
  try {
    // emit() → send()로 변경하여 결과 확인
    const resp = await lastValueFrom(
      this.notificationService.send(
        { cmd: 'matched_notification' },
        { userId, isConnect }
      ).pipe(timeout(3000))
    );

    if (!resp?.success) {
      throw new Error('알림 전송 실패');
    }
  } catch (error) {
    // 알림 실패는 핵심 비즈니스 로직이 아니므로 로깅 후 진행
    this.logger.warn(`알림 전송 실패 (userId: ${userId})`, error);
    // Fallback: 나중에 재시도할 수 있도록 큐에 저장
    // await this.queueNotificationRetry(userId, isConnect);
  }
}
```

### 4.3 HIGH (#4, #5, #6): Post 파일 처리

#### 4.3.1 createPost - 파일 이동 보상

```typescript
// post.service.ts

async createPost(createPostDto: CreatePostDto) {
  const queryRunner = this.dataSource.createQueryRunner();
  await queryRunner.connect();
  await queryRunner.startTransaction();

  // 보상 트랜잭션 추적
  const movedFiles: string[] = [];
  const tempFolder = join('public', 'temp');
  const filesFolder = join('public', 'files/post');

  try {
    const { meta, title, description, filePaths } = createPostDto;
    const userId = meta.user.sub;

    // Step 1: 파일 이동 (추적)
    if (filePaths && filePaths.length > 0) {
      if (!existsSync(filesFolder)) {
        mkdirSync(filesFolder, { recursive: true });
      }

      for (const file of filePaths) {
        await this.renameFiles(tempFolder, filesFolder, file);
        movedFiles.push(file);  // 이동 성공한 파일 추적
      }
    }

    // Step 2: DB 저장
    const post = queryRunner.manager.create(Post, {
      title,
      description,
      filePaths,
      authorId: userId,
    });

    await queryRunner.manager.save(post);
    await queryRunner.commitTransaction();

    return post;

  } catch (error) {
    await queryRunner.rollbackTransaction();

    // 보상 트랜잭션: 이동된 파일 되돌리기
    for (const file of movedFiles) {
      try {
        await this.renameFiles(filesFolder, tempFolder, file);
        this.logger.log(`파일 복구 성공: ${file}`);
      } catch (fileError) {
        this.logger.error(`파일 복구 실패: ${file}`, fileError);
        // 복구 실패 파일은 고아 파일 정리 작업으로 처리
      }
    }

    throw error;

  } finally {
    await queryRunner.release();
  }
}
```

#### 4.3.2 updatePost - 안전한 파일 업데이트

```typescript
// post.service.ts

async updatePost(updatePostDto: UpdatePostDto) {
  const queryRunner = this.dataSource.createQueryRunner();
  await queryRunner.connect();
  await queryRunner.startTransaction();

  const tempFolder = join('public', 'temp');
  const filesFolder = join('public', 'files/post');
  const backupFolder = join('public', 'backup/post');

  // 추적 변수
  const backedUpFiles: { original: string; backup: string }[] = [];
  const movedFiles: string[] = [];

  try {
    const { title, description, filePaths, postId, meta } = updatePostDto;

    const post = await queryRunner.manager.findOne(Post, {
      where: { id: postId },
    });

    if (!post) {
      throw new NotFoundException('존재하지 않는 POST의 ID 입니다.');
    }

    if (filePaths) {
      // 백업 폴더 생성
      if (!existsSync(backupFolder)) {
        mkdirSync(backupFolder, { recursive: true });
      }

      // Step 1: 기존 파일 백업 (삭제 대신)
      if (post.filePaths) {
        for (const oldFile of post.filePaths) {
          const oldPath = join(filesFolder, oldFile);
          if (existsSync(oldPath)) {
            const backupName = `${Date.now()}_${oldFile}`;
            await rename(oldPath, join(backupFolder, backupName));
            backedUpFiles.push({ original: oldFile, backup: backupName });
          }
        }
      }

      // Step 2: 새 파일 이동
      for (const file of filePaths) {
        await this.renameFiles(tempFolder, filesFolder, file);
        movedFiles.push(file);
      }
    }

    // Step 3: DB 업데이트
    await queryRunner.manager.update(
      Post,
      { id: postId },
      { title, description, filePaths, authorId: meta.user.sub }
    );

    await queryRunner.commitTransaction();

    // 성공 시 백업 파일 삭제 (비동기)
    this.cleanupBackupFiles(backupFolder, backedUpFiles).catch(e =>
      this.logger.warn('백업 파일 정리 실패', e)
    );

    return await this.postRepository.findOne({ where: { id: postId } });

  } catch (error) {
    await queryRunner.rollbackTransaction();

    // 보상 트랜잭션
    // 1. 새로 이동한 파일 되돌리기
    for (const file of movedFiles) {
      try {
        await this.renameFiles(filesFolder, tempFolder, file);
      } catch (e) {
        this.logger.error(`새 파일 복구 실패: ${file}`);
      }
    }

    // 2. 백업 파일 복원
    for (const { original, backup } of backedUpFiles) {
      try {
        await rename(
          join(backupFolder, backup),
          join(filesFolder, original)
        );
      } catch (e) {
        this.logger.error(`백업 파일 복원 실패: ${original}`);
      }
    }

    throw error;

  } finally {
    await queryRunner.release();
  }
}

private async cleanupBackupFiles(
  backupFolder: string,
  files: { backup: string }[]
): Promise<void> {
  for (const { backup } of files) {
    try {
      unlinkSync(join(backupFolder, backup));
    } catch (e) {
      // 정리 실패는 무시 (정기 작업으로 처리)
    }
  }
}
```

#### 4.3.3 deletePost - 파일도 함께 삭제

```typescript
// post.service.ts

async deletePost(getPostDto: GetPostDto) {
  const queryRunner = this.dataSource.createQueryRunner();
  await queryRunner.connect();
  await queryRunner.startTransaction();

  const filesFolder = join('public', 'files/post');
  const backupFolder = join('public', 'backup/post');

  // 추적 변수
  const backedUpFiles: { original: string; backup: string }[] = [];
  let postData: Post | null = null;

  try {
    const { postId } = getPostDto;

    const post = await queryRunner.manager.findOne(Post, {
      where: { id: postId },
    });

    if (!post) {
      throw new NotFoundException('존재하지 않는 POST의 ID 입니다.');
    }

    postData = post;

    // Step 1: 파일 백업 (삭제 전 안전 조치)
    if (post.filePaths && post.filePaths.length > 0) {
      if (!existsSync(backupFolder)) {
        mkdirSync(backupFolder, { recursive: true });
      }

      for (const file of post.filePaths) {
        const filePath = join(filesFolder, file);
        if (existsSync(filePath)) {
          const backupName = `deleted_${Date.now()}_${file}`;
          await rename(filePath, join(backupFolder, backupName));
          backedUpFiles.push({ original: file, backup: backupName });
        }
      }
    }

    // Step 2: DB 삭제
    await queryRunner.manager.delete(CommentModel, { postId });
    await queryRunner.manager.delete(Post, { id: postId });

    await queryRunner.commitTransaction();

    // 성공 시 백업 파일 영구 삭제 (비동기)
    this.deleteBackupFiles(backupFolder, backedUpFiles).catch(e =>
      this.logger.warn('백업 파일 삭제 실패', e)
    );

    return postId;

  } catch (error) {
    await queryRunner.rollbackTransaction();

    // 보상 트랜잭션: 백업 파일 복원
    for (const { original, backup } of backedUpFiles) {
      try {
        await rename(
          join(backupFolder, backup),
          join(filesFolder, original)
        );
      } catch (e) {
        this.logger.error(`파일 복원 실패: ${original}`);
      }
    }

    throw error;

  } finally {
    await queryRunner.release();
  }
}

private async deleteBackupFiles(
  backupFolder: string,
  files: { backup: string }[]
): Promise<void> {
  for (const { backup } of files) {
    try {
      unlinkSync(join(backupFolder, backup));
    } catch (e) {
      // 무시
    }
  }
}
```

### 4.4 Calendar 서비스 (#7, #8)

Post 서비스와 동일한 패턴 적용 (파일 경로만 변경: `files/calendar`)

---

## 5. Chat 서비스 수정

Chat 서비스에서 응답을 반환하도록 수정 필요:

```typescript
// apps/chat/src/chat/chat.service.ts

async deleteChatroomAndChats(dto: DeleteChatroomAndChatsDto) {
  const { coupleId, user1Id, user2Id } = dto;
  const userIds = [user1Id, user2Id];

  try {
    // 소켓 연결 해제
    userIds.forEach((userId) => {
      const client = this.connectedClients.get(userId);
      if (client) {
        client.disconnect();
        this.removeClient(userId);
      }
    });

    // DB 삭제
    await Promise.all([
      this.chatroomModel.findOneAndDelete({ coupleId }),
      this.chatModel.deleteMany({ userId: { $in: userIds } }),
    ]);

    return { status: 'success', message: 'ChatRoom 및 Chat 삭제 완료' };

  } catch (error) {
    return { status: 'error', message: error.message };
  }
}

// coupleId로 삭제 (보상 트랜잭션용)
async deleteChatroomByCoupleId(coupleId: string) {
  try {
    const chatroom = await this.chatroomModel.findOne({ coupleId });

    if (chatroom) {
      const userIds = [chatroom.user1Id, chatroom.user2Id];

      // 소켓 연결 해제
      userIds.forEach((userId) => {
        const client = this.connectedClients.get(userId);
        if (client) {
          client.disconnect();
          this.removeClient(userId);
        }
      });

      await Promise.all([
        this.chatroomModel.findOneAndDelete({ coupleId }),
        this.chatModel.deleteMany({ chatRoomId: chatroom._id }),
      ]);
    }

    return { status: 'success' };
  } catch (error) {
    return { status: 'error', message: error.message };
  }
}
```

---

## 6. Notification 서비스 수정

```typescript
// apps/notification/src/notification/notification.service.ts

async matchedNotification(dto: CreateCoupleNotificationDto) {
  try {
    const client = this.connectedClients.get(dto.userId);

    if (client) {
      client.emit(
        'matchedNotification',
        dto.isConnect
          ? '커플이 연결 되었습니다.'
          : '커플 연결이 해제 되었습니다.',
      );

      if (!dto.isConnect) {
        client.disconnect();
        this.removeClient(dto.userId);
      }
    }

    // 연결된 클라이언트가 없어도 성공으로 처리
    return { success: true };

  } catch (error) {
    return { success: false, error: error.message };
  }
}
```

---

## 7. 추가 권장사항

### 7.1 Dead Letter Queue (DLQ) 설정

보상 트랜잭션 실패 시 수동 처리를 위한 DLQ 설정:

```typescript
// RabbitMQ 설정
{
  queue: 'couple_dlq',
  options: {
    durable: true,
    arguments: {
      'x-message-ttl': 86400000  // 24시간 후 만료
    }
  }
}
```

### 7.2 고아 파일 정리 스케줄러

```typescript
// orphan-cleaner.service.ts

@Cron('0 3 * * *')  // 매일 새벽 3시
async cleanOrphanFiles() {
  // temp 폴더에서 24시간 이상된 파일 삭제
  // backup 폴더에서 7일 이상된 파일 삭제
}
```

### 7.3 트랜잭션 로깅

```typescript
interface TransactionLog {
  id: string;
  type: 'COUPLE_CONNECT' | 'COUPLE_DISCONNECT' | 'POST_CREATE' | ...;
  status: 'STARTED' | 'COMMITTED' | 'ROLLED_BACK' | 'COMPENSATED';
  steps: {
    name: string;
    status: 'SUCCESS' | 'FAILED';
    timestamp: Date;
    error?: string;
  }[];
  createdAt: Date;
  completedAt?: Date;
}
```

---

## 8. 구현 우선순위

| 순위 | 대상 | 난이도 | 영향도 | 작업 내용 |
|------|------|--------|--------|-----------|
| 1 | #1, #2 | 중 | 높음 | 커플 연결/해제 Saga 패턴 적용 |
| 2 | #3 | 낮 | 중 | emit() → send() 변경 |
| 3 | #4, #5, #6 | 중 | 중 | Post 파일 처리 보상 트랜잭션 |
| 4 | #7, #8 | 중 | 중 | Calendar 파일 처리 보상 트랜잭션 |
| 5 | #9 | 낮 | 낮 | 순차 삭제 에러 처리 강화 |

---

## 9. 결론

### 핵심 변경 사항
1. **emit() → send()**: Fire-and-forget을 Request-Response로 변경
2. **보상 트랜잭션 추적**: 각 단계별 성공/실패 추적
3. **파일 백업 전략**: 삭제 전 백업, 성공 시 삭제
4. **재시도 + 타임아웃**: 원격 호출에 재시도 로직 추가

### 기대 효과
- 데이터 정합성 보장
- 고아 데이터/파일 방지
- 장애 추적 용이
- 수동 복구 최소화
