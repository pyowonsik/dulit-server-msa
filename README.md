# 둘잇 (Dulit) Backend Server - MSA

[![GitHub Branch](https://img.shields.io/badge/branch-msa--migration-blue)](https://github.com/pyowonsik/Dulit-server)
[![Architecture](https://img.shields.io/badge/architecture-Microservices-green)](https://github.com/pyowonsik/Dulit-server)

## 목차

- [개요](#개요)
- [시스템 구성도](#시스템-구성도)
- [MSA 아키텍처](#msa-아키텍처)
- [ERD](#erd)
- [기술 스택](#기술-스택)
- [주요 기능 & 구현 내용](#주요-기능--구현-내용)
- [리뷰](#리뷰)
- [트러블슈팅 & 피드백](#트러블슈팅--피드백)
- [느낀 점](#느낀-점)
- [API 문서](#api-문서)

## 개요

**둘잇(Dulit)** 은 두 사람을 하나로 이어주는 커플 전용 애플리케이션의 백엔드 서버입니다.

실시간 커플 채팅을 기본 기능으로 하여 소통을 제공하며, 기념일과 약속 등록 기능을 통해 중요한 순간들을 관리합니다. 실시간 위치 공유와 데이트 기록을 통해 더 가까운 관계를 유지할 수 있게 돕고, 달력을 활용하여 데이트 일정을 기록하며, 나만의 데이트 코스를 커뮤니티에 공유하여 다른 커플들과 아이디어를 나눌 수 있습니다.

'둘잇'은 커플들의 소통과 추억을 더 특별하고 의미 있게 만들어주는 서비스의 핵심 백엔드 시스템입니다.

### 프로젝트 정보

- **개발 기간**: 2024.12 ~ 2025.03 (모놀리식), 2025.03 ~ 진행중 (MSA 마이그레이션)
- **아키텍처**: Microservices Architecture (MSA)
- **배포 환경**: 로컬 개발 환경 (AWS 배포 예정)

## 시스템 구성도

### 전체 시스템 아키텍처

![시스템 아키텍처](./readme_source/msa_architecture.png)

> Flutter 클라이언트부터 API Gateway, 마이크로서비스들, 데이터베이스, RabbitMQ 메시지 브로커, CI/CD 파이프라인(GitHub + Jenkins)까지 포함한 전체 시스템 아키텍처

### MSA 아키텍처 다이어그램

```
┌─────────────────────────────────────────────────────────────────┐
│                         Client (Frontend)                        │
└─────────────────────────────┬───────────────────────────────────┘
                              │
                              │ HTTPS
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                      API Gateway (Port 3000)                     │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │  - JWT 인증/인가 (BearerTokenMiddleware + AuthGuard)      │ │
│  │  - 요청 라우팅 & 로드 밸런싱                               │ │
│  │  - Swagger API 문서                                        │ │
│  └────────────────────────────────────────────────────────────┘ │
└─────────────────────────────┬───────────────────────────────────┘
                              │
                              │ RabbitMQ (Message Broker)
                              │
        ┌─────────────────────┼─────────────────────┐
        │                     │                     │
        ▼                     ▼                     ▼
┌──────────────┐      ┌──────────────┐     ┌──────────────┐
│ User Service │      │Couple Service│     │ Chat Service │
│              │      │              │     │              │
│ PostgreSQL   │      │ PostgreSQL   │     │   MongoDB    │
│ (user DB)    │      │ (couple DB)  │     │  (chat DB)   │
└──────────────┘      └──────────────┘     └──────────────┘
        │                     │                     │
        │                     │                     │
        ▼                     ▼                     ▼
┌──────────────┐      ┌──────────────┐     ┌──────────────┐
│ Post Service │      │Notification  │     │  RabbitMQ    │
│              │      │   Service    │     │              │
│ PostgreSQL   │      │   MongoDB    │     │ Port: 5672   │
│ (post DB)    │      │(notification)│     │              │
└──────────────┘      └──────────────┘     └──────────────┘
```

## MSA 아키텍처

### 마이크로서비스 구성

| 서비스                   | 포트 | 데이터베이스      | 역할                                |
| ------------------------ | ---- | ----------------- | ----------------------------------- |
| **Gateway**              | 3000 | -                 | API Gateway, 인증/인가, 요청 라우팅 |
| **User Service**         | -    | PostgreSQL (6001) | 사용자 관리, 소셜 로그인, JWT 발급  |
| **Couple Service**       | -    | PostgreSQL (6002) | 커플 매칭, 기념일, 약속, 캘린더     |
| **Chat Service**         | 3003 | MongoDB (6003)    | 실시간 채팅 (Socket.IO + WebSocket) |
| **Post Service**         | -    | PostgreSQL (6005) | 커뮤니티 게시글, 댓글               |
| **Notification Service** | 3004 | MongoDB (6004)    | 실시간 알림 (Socket.IO)             |
| **RabbitMQ**             | 5672 | -                 | 메시지 브로커 (서비스 간 통신)      |

### 데이터베이스 분리 전략

#### PostgreSQL (관계형 데이터)

- **User DB**: 사용자 정보, 프로필, 인증 토큰
- **Couple DB**: 커플 관계, 기념일, 약속, 캘린더
- **Post DB**: 게시글, 댓글, 좋아요

#### MongoDB (비관계형 데이터)

- **Chat DB**: 채팅 메시지, 채팅방 (높은 쓰기 처리량)
- **Notification DB**: 알림 이력 (일시적 데이터)

### 서비스 간 통신 패턴

#### 1. RabbitMQ 메시지 브로커

**Request-Response 패턴 (send)**

```typescript
// Gateway → User Service
const user = await lastValueFrom(
  this.userService.send({ cmd: 'get_user_info' }, { userId: '123' }),
);
```

**Event-Driven 패턴 (emit)**

```typescript
// Couple Service → Notification Service
this.notificationService.emit(
  { cmd: 'matched_notification' },
  { userId, isConnect },
);
```

#### 2. 큐(Queue) 구성

| Queue Name           | Service              | Pattern          | 설명              |
| -------------------- | -------------------- | ---------------- | ----------------- |
| `user_queue`         | User Service         | Request-Response | 사용자 조회, 인증 |
| `couple_queue`       | Couple Service       | Request-Response | 커플 정보 조회    |
| `chat_queue`         | Chat Service         | Request-Response | 채팅방 생성/삭제  |
| `post_queue`         | Post Service         | Request-Response | 게시글 CRUD       |
| `notification_queue` | Notification Service | Event-Driven     | 알림 전송         |

## ERD

### User Service ERD

```
┌─────────────────┐
│      User       │
├─────────────────┤
│ id (PK)         │
│ email           │
│ nickname        │
│ profileImage    │
│ provider        │
│ providerId      │
│ createdAt       │
│ updatedAt       │
└─────────────────┘
```

### Couple Service ERD

```
┌─────────────────┐       ┌──────────────────┐
│     Couple      │       │   Anniversary    │
├─────────────────┤       ├──────────────────┤
│ id (PK)         │───┐   │ id (PK)          │
│ user1Id (FK)    │   │   │ coupleId (FK)    │
│ user2Id (FK)    │   └──>│ title            │
│ startDate       │       │ date             │
│ createdAt       │       │ createdAt        │
└─────────────────┘       └──────────────────┘
        │
        ├──────────────────┐
        │                  │
        ▼                  ▼
┌──────────────────┐  ┌──────────────────┐
│       Plan       │  │     Calendar     │
├──────────────────┤  ├──────────────────┤
│ id (PK)          │  │ id (PK)          │
│ coupleId (FK)    │  │ coupleId (FK)    │
│ title            │  │ title            │
│ place            │  │ date             │
│ date             │  │ content          │
│ time             │  │ imageUrl         │
│ createdAt        │  │ createdAt        │
└──────────────────┘  └──────────────────┘
```

### Chat Service (MongoDB Schema)

```
┌─────────────────┐       ┌──────────────────┐
│    ChatRoom     │       │     Message      │
├─────────────────┤       ├──────────────────┤
│ _id             │───┐   │ _id              │
│ coupleId        │   └──>│ chatRoomId       │
│ user1Id         │       │ senderId         │
│ user2Id         │       │ content          │
│ createdAt       │       │ type             │
└─────────────────┘       │ createdAt        │
                          └──────────────────┘
```

### Post Service ERD

```
┌─────────────────┐       ┌──────────────────┐
│      Post       │       │     Comment      │
├─────────────────┤       ├──────────────────┤
│ id (PK)         │───┐   │ id (PK)          │
│ authorId (FK)   │   └──>│ postId (FK)      │
│ title           │       │ authorId (FK)    │
│ content         │       │ content          │
│ imageUrl        │       │ createdAt        │
│ createdAt       │       └──────────────────┘
│ updatedAt       │
└─────────────────┘
```

## 기술 스택

### Backend Framework & Language

<img src="https://img.shields.io/badge/NestJS-E0234E?style=flat-square&logo=NestJS&logoColor=white"> <img src="https://img.shields.io/badge/TypeScript-3178C6?style=flat-square&logo=TypeScript&logoColor=white"> <img src="https://img.shields.io/badge/Node.js-339933?style=flat-square&logo=Node.js&logoColor=white">

### Microservices & Message Broker

<img src="https://img.shields.io/badge/RabbitMQ-FF6600?style=flat-square&logo=RabbitMQ&logoColor=white"> <img src="https://img.shields.io/badge/NestJS_Microservices-E0234E?style=flat-square&logo=NestJS&logoColor=white">

### Database & ORM

<img src="https://img.shields.io/badge/PostgreSQL-4169E1?style=flat-square&logo=PostgreSQL&logoColor=white"> <img src="https://img.shields.io/badge/MongoDB-47A248?style=flat-square&logo=MongoDB&logoColor=white"> <img src="https://img.shields.io/badge/TypeORM-FE0803?style=flat-square&logo=TypeORM&logoColor=white"> <img src="https://img.shields.io/badge/Mongoose-880000?style=flat-square&logo=Mongoose&logoColor=white">

### Auth & Security

<img src="https://img.shields.io/badge/OAuth2-EB5424?style=flat-square&logo=Auth0&logoColor=white"> <img src="https://img.shields.io/badge/JWT-000000?style=flat-square&logo=JSON Web Tokens&logoColor=white"> <img src="https://img.shields.io/badge/Passport-34E27A?style=flat-square&logo=Passport&logoColor=white">

### Testing & Logging

<img src="https://img.shields.io/badge/Jest-C21325?style=flat-square&logo=Jest&logoColor=white"> <img src="https://img.shields.io/badge/Winston-231F20?style=flat-square&logo=winston&logoColor=white">

### Real-time Communication

<img src="https://img.shields.io/badge/Socket.IO-010101?style=flat-square&logo=Socket.io&logoColor=white"> <img src="https://img.shields.io/badge/WebSocket-4E4E4E?style=flat-square&logo=WebSocket&logoColor=white">

### DevOps & CI/CD

<img src="https://img.shields.io/badge/Docker-2496ED?style=flat-square&logo=Docker&logoColor=white"> <img src="https://img.shields.io/badge/Docker_Compose-2496ED?style=flat-square&logo=Docker&logoColor=white">

### Development Tools

<img src="https://img.shields.io/badge/WebStorm-000000?style=flat-square&logo=WebStorm&logoColor=white"> <img src="https://img.shields.io/badge/Postman-FF6C37?style=flat-square&logo=Postman&logoColor=white"> <img src="https://img.shields.io/badge/Swagger-85EA2D?style=flat-square&logo=Swagger&logoColor=black">

## 주요 기능 & 구현 내용

### 🌐 API Gateway 패턴

#### 중앙 집중식 인증/인가

**BearerTokenMiddleware**: 모든 요청의 JWT 토큰 검증

```typescript
// apps/gateway/src/auth/middleware/bearer-token.middleware.ts
@Injectable()
export class BearerTokenMiddleware implements NestMiddleware {
  async use(req: any, res: any, next: (error?: Error | any) => void) {
    const token = this.getRawToken(req);

    if (!token) {
      next();
      return;
    }

    // User Service에 토큰 검증 요청
    const payload = await this.verifyToken(token);

    // req.user에 payload 붙여서 Guard로 전달
    req.user = payload;
    next();
  }

  async verifyToken(token: string) {
    const result = await lastValueFrom(
      this.userService.send({ cmd: 'parse_bearer_token' }, { token }),
    );

    if (result.status === 'error') {
      throw new UnauthorizedException('토큰 정보가 잘못됐습니다!');
    }

    return result.data;
  }
}
```

**AuthGuard**: 라우트 레벨 권한 검증

```typescript
// apps/gateway/src/auth/guard/auth.guard.ts
@Injectable()
export class AuthGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.get(Public, context.getHandler());

    if (isPublic) {
      return true;
    }

    const request = context.switchToHttp().getRequest();

    if (!request.user || request.user.type !== 'access') {
      return false;
    }

    return true;
  }
}
```

#### 요청 라우팅

Gateway는 클라이언트 요청을 적절한 마이크로서비스로 라우팅:

- `/auth/*` → User Service
- `/couple/*` → Couple Service
- `/post/*` → Post Service
- `/chat` (WebSocket) → Chat Service

### 🔐 User Service (인증 & 사용자 관리)

#### 카카오 소셜 로그인 (OAuth2)

- OAuth2 인증 흐름 구현
- JWT 토큰 발급 (AccessToken 30분, RefreshToken 7일)
- 토큰 갱신 로직

#### MessagePattern 구현

```typescript
// apps/user/src/auth/auth.controller.ts
@MessagePattern({ cmd: 'parse_bearer_token' })
async parseBearerToken(@Payload() data: any) {
  try {
    const payload = await this.authService.parseBearerToken(data.token);
    return { status: 'success', data: payload };
  } catch (error) {
    return { status: 'error', message: error.message };
  }
}

@MessagePattern({ cmd: 'get_user_info' })
async getUserInfo(@Payload() data: any) {
  const user = await this.userService.findById(data.userId);
  return { status: 'success', data: user };
}
```

### 💑 Couple Service (커플 매칭 & 관리)

#### 복잡한 트랜잭션 처리

**커플 연결 로직**: 여러 서비스와 통신하는 복잡한 비즈니스 로직

```typescript
// apps/couple/src/couple/couple.service.ts
async connectCouple(createCoupleDto: ConnectCoupleDto) {
  const { partnerId, isConnect, meta } = createCoupleDto;
  const queryRunner = this.dataSource.createQueryRunner();

  await queryRunner.connect();
  await queryRunner.startTransaction();

  try {
    // 1) User Service에서 본인 정보 가져오기
    const me = await this.getUserById(meta.user.sub);

    // 2) User Service에서 파트너 정보 가져오기
    const partner = await this.getUserById(partnerId);

    // 3) 커플 상태 검증
    await this.validateCoupleStatus(me.id, partner.id, isConnect);

    if (isConnect) {
      // 4.1) 커플 생성
      const couple = queryRunner.manager.create(Couple, {
        user1Id: me.id,
        user2Id: partner.id,
      });
      await queryRunner.manager.save(couple);

      // 4.2) Chat Service에 채팅방 생성 요청
      await this.createChatRoom(me.id, partner.id, couple.id);
    } else {
      const coupleId = await this.getCoupleByUserId(me.id);

      // 4.1) Chat Service에 채팅방/메시지 삭제 요청
      await this.deleteChatroomAndChats(coupleId, me.id, partner.id);

      // 4.2) 커플 관련 데이터 삭제
      await queryRunner.manager.delete(Anniversary, { coupleId });
      await queryRunner.manager.delete(Plan, { coupleId });
      await queryRunner.manager.delete(Calendar, { coupleId });
      await queryRunner.manager.delete(Couple, { id: coupleId });
    }

    // 5) Notification Service에 알림 전송 (Event)
    this.createMatchedNotification(me.id, isConnect);
    this.createMatchedNotification(partner.id, isConnect);

    await queryRunner.commitTransaction();

    return {
      success: true,
      message: isConnect ? '커플이 연결되었습니다.' : '커플 연결이 해제되었습니다.',
    };
  } catch (error) {
    await queryRunner.rollbackTransaction();
    throw error;
  } finally {
    await queryRunner.release();
  }
}

// Request-Response 패턴
private async getUserById(userId: string) {
  const resp = await lastValueFrom(
    this.userService.send({ cmd: 'get_user_info' }, { userId })
  );

  if (!resp || !resp.data) {
    throw new NotFoundException('해당 파트너를 찾을 수 없습니다.');
  }

  return resp.data;
}

// Event-Driven 패턴
private async createMatchedNotification(userId: string, isConnect: boolean) {
  this.notificationService.emit(
    { cmd: 'matched_notification' },
    { userId, isConnect }
  );
}
```

#### 기념일 & 약속 관리

- 기념일 CRUD (D-Day 자동 계산)
- 약속 CRUD
- 약속 2시간 전 자동 알림 (Cron 스케줄러)

### 💬 Chat Service (실시간 채팅)

#### MongoDB 기반 채팅 시스템

- **고성능 쓰기**: MongoDB의 높은 쓰기 처리량 활용
- **채팅방 관리**: 커플당 1개의 채팅방
- **메시지 영구 저장**: 채팅 이력 보관

#### MessagePattern 구현

```typescript
// apps/chat/src/chat/chat.controller.ts
@MessagePattern({ cmd: 'create_chat_room' })
async createChatRoom(@Payload() data: any) {
  const chatRoom = await this.chatService.createChatRoom(
    data.user1Id,
    data.user2Id,
    data.coupleId
  );
  return { status: 'success', data: chatRoom };
}

@EventPattern({ cmd: 'delete_chatroom_and_chats' })
async deleteChatroomAndChats(@Payload() data: any) {
  await this.chatService.deleteChatRoomAndMessages(
    data.coupleId,
    data.user1Id,
    data.user2Id
  );
}
```

#### Socket.IO 실시간 통신

- WebSocket 연결 관리
- 실시간 메시지 송수신
- 읽음 표시 처리

### 📝 Post Service (커뮤니티)

#### 데이트 코스 공유

- 게시글 CRUD
- Cursor 기반 무한 스크롤
- Page 기반 페이지네이션
- 댓글 시스템

### 🔔 Notification Service (실시간 알림)

#### Event-Driven 알림 처리

```typescript
// apps/notification/src/notification/notification.controller.ts
@EventPattern({ cmd: 'matched_notification' })
async handleMatchedNotification(@Payload() data: any) {
  await this.notificationService.createMatchedNotification(
    data.userId,
    data.isConnect
  );
}
```

#### 알림 유형

- 커플 매칭 완료 알림
- 약속 2시간 전 알림
- 댓글 작성 알림

### 🔄 Dead Letter Queue (DLQ) 패턴

**실패 메시지 처리 전략** (예시 코드)

```typescript
// DLQ 설정 예시
{
  name: USER_SERVICE,
  useFactory: (configService: ConfigService) => ({
    transport: Transport.RMQ,
    options: {
      urls: ['amqp://rabbitmq:5672'],
      queue: 'user_queue',
      queueOptions: {
        durable: true,
        arguments: {
          'x-dead-letter-exchange': 'dlx_exchange',
          'x-dead-letter-routing-key': 'user_dlq'
        }
      },
    },
  }),
  inject: [ConfigService],
}

// DLQ 컨슈머 예시
@EventPattern({ cmd: 'process_dlq' })
async processDLQ(@Payload() data: any) {
  this.logger.error(`DLQ 메시지 처리: ${JSON.stringify(data)}`);

  // 재시도 로직
  if (data.retryCount < 3) {
    await this.retry(data);
  } else {
    // 관리자에게 알림 전송
    await this.notifyAdmin(data);
  }
}
```

### ✅ 테스트 (Jest)

- **단위 테스트**: 주요 비즈니스 로직 테스트
- **Mock 객체**: 의존성 격리 및 일관성 유지
- **서비스별 독립 테스트**: 각 마이크로서비스 독립적으로 테스트

## 리뷰

### A. Monolithic → MSA 마이그레이션

이전 프로젝트에서 모놀리식 아키텍처로 개발했던 경험을 바탕으로, 이번에는 **마이크로서비스 아키텍처(MSA)** 로 전환하는 작업을 진행했습니다.

모놀리식 아키텍처는 초기 개발 속도가 빠르고 구조가 단순하다는 장점이 있었지만, 서비스가 성장하면서 다음과 같은 한계를 느꼈습니다:

- 특정 기능 수정 시 전체 서버 재배포 필요
- 데이터베이스 병목 현상
- 서비스별 독립적인 스케일링 불가능

MSA로 전환하면서 **Gateway 패턴**, **RabbitMQ 메시지 브로커**, **데이터베이스 분리** 등을 적용하여 확장 가능하고 유연한 시스템을 구축할 수 있었습니다.

### B. 서비스 간 통신 패턴 학습

MSA 환경에서 가장 중요한 것은 **서비스 간 통신** 입니다. NestJS Microservices와 RabbitMQ를 활용하여 두 가지 패턴을 구현했습니다:

#### Request-Response 패턴 (send)

- 동기적 통신이 필요한 경우
- 예: 사용자 정보 조회, 커플 정보 조회
- Gateway → User Service: 토큰 검증

#### Event-Driven 패턴 (emit)

- 비동기적 통신이 필요한 경우
- 예: 알림 전송, 채팅방 삭제
- Couple Service → Notification Service: 매칭 알림

이러한 패턴을 적절히 활용하여 서비스 간 결합도를 낮추고, 각 서비스의 독립성을 보장할 수 있었습니다.

### C. 데이터베이스 분리 전략

모놀리식에서는 하나의 PostgreSQL 데이터베이스를 사용했지만, MSA로 전환하면서 **데이터베이스를 서비스별로 분리**했습니다:

#### PostgreSQL (관계형 데이터)

- **User DB**: 사용자 정보
- **Couple DB**: 커플 관계, 기념일, 약속
- **Post DB**: 게시글, 댓글

#### MongoDB (비관계형 데이터)

- **Chat DB**: 채팅 메시지 (높은 쓰기 처리량)
- **Notification DB**: 알림 이력 (일시적 데이터)

데이터베이스를 분리하면서 **서비스별 독립적인 확장**이 가능해졌고, 채팅과 알림처럼 쓰기 처리량이 높은 서비스는 MongoDB를 사용하여 성능을 최적화했습니다.

### D. API Gateway 패턴

**API Gateway**는 MSA의 핵심 패턴 중 하나입니다. Gateway를 통해:

- **중앙 집중식 인증/인가**: 모든 요청의 JWT 토큰 검증
- **요청 라우팅**: 클라이언트 요청을 적절한 마이크로서비스로 전달
- **로드 밸런싱**: 여러 인스턴스로 트래픽 분산 (향후 적용)
- **API 문서화**: Swagger를 통한 통합 API 문서

Gateway 패턴을 도입하면서 클라이언트는 각 마이크로서비스의 존재를 알 필요 없이 단일 진입점을 통해 모든 기능에 접근할 수 있게 되었습니다.

## 트러블슈팅 & 피드백

### A. 트러블슈팅

#### 1. MSA 아키텍처 설계의 어려움

**문제**: 처음 MSA로 전환하다 보니 서비스를 어떻게 나눠야 할지, 어디까지를 독립적인 서비스로 분리해야 할지 고민이 많았습니다.

**고민 사항**:

- 도메인 기반 서비스 분리 vs 기능 기반 서비스 분리
- 서비스 간 의존성 최소화
- 공통 로직 처리 (인증, 로깅 등)
- 데이터베이스 분리 전략

**해결 과정**:

**1단계: 도메인 분석**

- 비즈니스 도메인별로 서비스 분리
- User, Couple, Chat, Post, Notification으로 명확하게 구분

**2단계: 서비스 책임 정의**

```
User Service: 사용자 관리, 인증/인가
├── 사용자 CRUD
├── 소셜 로그인 (카카오)
└── JWT 토큰 발급/검증

Couple Service: 커플 관계 관리
├── 커플 매칭
├── 기념일 관리
├── 약속 관리
└── 캘린더 관리

Chat Service: 실시간 채팅
├── 채팅방 관리
├── 메시지 송수신
└── WebSocket 연결 관리

Post Service: 커뮤니티
├── 게시글 CRUD
└── 댓글 CRUD

Notification Service: 알림
├── 실시간 알림 전송
└── 알림 이력 관리
```

**3단계: 공통 로직 처리**

- `libs/common`: 공통 DTO, Entity, Interceptor 등
- Gateway에서 중앙 집중식 인증/인가

**배운 점**:

- MSA는 초기 설계가 가장 중요하다
- 도메인 주도 설계(DDD) 개념이 서비스 분리에 큰 도움이 됨
- 서비스 간 의존성을 최소화하는 것이 핵심

#### 2. Gateway에서 마이크로서비스 통신

**문제**: Gateway에서 각 마이크로서비스로 요청을 전달하는 과정이 복잡했습니다.

**어려웠던 점**:

- RabbitMQ send vs emit의 차이
- lastValueFrom을 사용한 Observable → Promise 변환
- 에러 처리 및 타임아웃 설정
- 인증 정보를 어떻게 전달할지

**해결 과정**:

**Request-Response 패턴 (send)**

```typescript
// Gateway → User Service
async verifyToken(token: string) {
  const result = await lastValueFrom(
    this.userService.send(
      { cmd: 'parse_bearer_token' },  // 명령 패턴
      { token }                        // 데이터
    )
  );

  if (result.status === 'error') {
    throw new UnauthorizedException('토큰 정보가 잘못됐습니다!');
  }

  return result.data;
}

// User Service
@MessagePattern({ cmd: 'parse_bearer_token' })
async parseBearerToken(@Payload() data: any) {
  try {
    const payload = await this.authService.parseBearerToken(data.token);
    return { status: 'success', data: payload };
  } catch (error) {
    return { status: 'error', message: error.message };
  }
}
```

**Event-Driven 패턴 (emit)**

```typescript
// Couple Service → Notification Service
private async createMatchedNotification(userId: string, isConnect: boolean) {
  // emit은 응답을 기다리지 않음 (Fire and Forget)
  this.notificationService.emit(
    { cmd: 'matched_notification' },
    { userId, isConnect }
  );
}

// Notification Service
@EventPattern({ cmd: 'matched_notification' })
async handleMatchedNotification(@Payload() data: any) {
  await this.notificationService.createMatchedNotification(
    data.userId,
    data.isConnect
  );
}
```

**패턴 비교**:

| 항목      | Request-Response (send) | Event-Driven (emit)    |
| --------- | ----------------------- | ---------------------- |
| 응답 대기 | O (동기)                | X (비동기)             |
| 사용 사례 | 데이터 조회, 검증       | 알림 전송, 로깅        |
| 에러 처리 | try-catch 가능          | 에러 무시              |
| 성능      | 느림 (응답 대기)        | 빠름 (Fire and Forget) |

**배운 점**:

- send는 응답이 필요한 경우, emit은 알림만 필요한 경우
- lastValueFrom으로 RxJS Observable을 Promise로 변환
- 적절한 패턴 선택이 성능에 큰 영향을 미침

#### 3. Relation → ID 기반 명시적 접근

**문제**: 모놀리식에서는 TypeORM의 `@ManyToOne`, `@OneToMany` 등의 Relation을 사용하여 편리하게 관계를 맺었지만, MSA에서는 데이터베이스가 분리되어 있어 직접적인 Relation을 사용할 수 없었습니다.

**모놀리식 방식 (Relation)**:

```typescript
// User Entity
@Entity()
export class User {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @OneToMany(() => Post, (post) => post.author)
  posts: Post[];
}

// Post Entity
@Entity()
export class Post {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => User, (user) => user.posts)
  author: User; // User 정보를 자동으로 가져옴
}

// 사용
const post = await postRepository.findOne({
  where: { id },
  relations: ['author'], // 자동으로 JOIN
});
console.log(post.author.nickname); // 편리!
```

**MSA 방식 (ID 기반)**:

```typescript
// Post Entity (Post Service)
@Entity()
export class Post {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  authorId: string;  // User Service의 User ID만 저장
}

// Post Service
async getPostDetail(postId: string) {
  // 1) 게시글 조회
  const post = await this.postRepository.findOne({ where: { id: postId } });

  // 2) User Service에 작성자 정보 요청
  const author = await lastValueFrom(
    this.userService.send(
      { cmd: 'get_user_info' },
      { userId: post.authorId }
    )
  );

  // 3) 데이터 조합
  return {
    ...post,
    author: author.data
  };
}
```

**Couple Service 예시**:

```typescript
// Couple Entity
@Entity()
export class Couple {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  user1Id: string;  // User Service의 User ID

  @Column()
  user2Id: string;  // User Service의 User ID
}

// 커플 정보 조회 시 사용자 정보 가져오기
private async getUserById(userId: string) {
  const resp = await lastValueFrom(
    this.userService.send({ cmd: 'get_user_info' }, { userId })
  );

  if (!resp || !resp.data) {
    throw new NotFoundException('해당 파트너를 찾을 수 없습니다.');
  }

  return resp.data;
}
```

**모놀리식 vs MSA 비교**:

| 항목          | 모놀리식 (Relation)     | MSA (ID 기반)               |
| ------------- | ----------------------- | --------------------------- |
| 데이터 조회   | `relations: ['author']` | RabbitMQ send 호출          |
| 성능          | 빠름 (단일 쿼리)        | 느림 (여러 서비스 호출)     |
| 복잡도        | 낮음                    | 높음                        |
| 확장성        | 낮음                    | 높음                        |
| 데이터 일관성 | 강함 (트랜잭션)         | 약함 (eventual consistency) |

**배운 점**:

- MSA에서는 데이터베이스 JOIN이 불가능하므로 애플리케이션 레벨에서 조합
- 명시적으로 다른 서비스의 데이터를 가져와야 함
- 성능을 위해 캐싱 전략이 필수적
- 서비스 간 의존성이 너무 많으면 MSA의 장점이 사라짐

#### 4. 복잡한 로직에서 메시지 큐 여러 번 호출

**문제**: 커플 연결/해제 같은 복잡한 비즈니스 로직에서 여러 서비스와 통신해야 하는 경우, 메시지 큐를 여러 번 호출하게 되어 코드가 복잡해지고 성능 이슈가 발생했습니다.

**시나리오: 커플 연결**

```typescript
async connectCouple(createCoupleDto: ConnectCoupleDto) {
  const { partnerId, isConnect, meta } = createCoupleDto;
  const queryRunner = this.dataSource.createQueryRunner();

  await queryRunner.connect();
  await queryRunner.startTransaction();

  try {
    // 1) User Service 호출 - 본인 정보
    const me = await this.getUserById(meta.user.sub);

    // 2) User Service 호출 - 파트너 정보
    const partner = await this.getUserById(partnerId);

    // 3) 커플 상태 검증 (로컬 DB)
    await this.validateCoupleStatus(me.id, partner.id, isConnect);

    if (isConnect) {
      // 4) 커플 생성 (로컬 DB)
      const couple = queryRunner.manager.create(Couple, {
        user1Id: me.id,
        user2Id: partner.id,
      });
      await queryRunner.manager.save(couple);

      // 5) Chat Service 호출 - 채팅방 생성
      await this.createChatRoom(me.id, partner.id, couple.id);
    }

    // 6) Notification Service 호출 - 알림 전송 (본인)
    this.createMatchedNotification(me.id, isConnect);

    // 7) Notification Service 호출 - 알림 전송 (파트너)
    this.createMatchedNotification(partner.id, isConnect);

    await queryRunner.commitTransaction();
  } catch (error) {
    await queryRunner.rollbackTransaction();
    throw error;
  }
}
```

**문제점**:

- 7단계의 복잡한 플로우
- User Service를 2번 호출 (직렬 처리)
- Notification Service를 2번 호출
- 전체 소요 시간 증가

**해결 방안 1: 병렬 처리**

```typescript
// 동시에 여러 서비스 호출
const [me, partner] = await Promise.all([
  this.getUserById(meta.user.sub),
  this.getUserById(partnerId),
]);
```

**해결 방안 2: 배치 API 추가**

```typescript
// User Service에 배치 조회 API 추가
@MessagePattern({ cmd: 'get_users_info' })
async getUsersInfo(@Payload() data: any) {
  const users = await this.userService.findByIds(data.userIds);
  return { status: 'success', data: users };
}

// Couple Service
const users = await lastValueFrom(
  this.userService.send(
    { cmd: 'get_users_info' },
    { userIds: [meta.user.sub, partnerId] }
  )
);
const [me, partner] = users.data;
```

**해결 방안 3: Saga 패턴 (향후 적용)**

```typescript
// Saga 패턴으로 분산 트랜잭션 관리
class ConnectCoupleSaga {
  async execute() {
    const sagaId = uuid();

    try {
      // 1단계: 커플 생성
      const couple = await this.createCouple();

      // 2단계: 채팅방 생성 (보상 트랜잭션 등록)
      await this.createChatRoom(couple.id);
      this.registerCompensation(() => this.deleteChatRoom(couple.id));

      // 3단계: 알림 전송
      await this.sendNotifications(couple);
    } catch (error) {
      // 보상 트랜잭션 실행
      await this.rollbackCompensations();
      throw error;
    }
  }
}
```

**배운 점**:

- 복잡한 로직은 여러 서비스 호출로 인해 성능 저하 발생
- 병렬 처리, 배치 API로 성능 개선 가능
- Saga 패턴으로 분산 트랜잭션 관리 필요

#### 5. Dead Letter Queue (DLQ) 적용

**문제**: 메시지 처리 실패 시 메시지가 소실되거나 무한 재시도로 시스템이 멈추는 문제가 발생했습니다.

**DLQ란?**

- 처리 실패한 메시지를 별도의 큐로 이동시켜 관리
- 재시도 로직 구현 가능
- 관리자에게 알림 전송

**DLQ 설정 예시**:

```typescript
// RabbitMQ 큐 설정
{
  name: USER_SERVICE,
  useFactory: (configService: ConfigService) => ({
    transport: Transport.RMQ,
    options: {
      urls: ['amqp://rabbitmq:5672'],
      queue: 'user_queue',
      queueOptions: {
        durable: true,  // 메시지 영속성
        arguments: {
          'x-dead-letter-exchange': 'dlx_exchange',  // DLX 설정
          'x-dead-letter-routing-key': 'user_dlq'    // DLQ 라우팅 키
        }
      },
    },
  }),
  inject: [ConfigService],
}
```

**DLQ 컨슈머 구현**:

```typescript
// DLQ 메시지 처리
@EventPattern({ cmd: 'process_dlq' })
async processDLQ(@Payload() data: any, @Ctx() context: RmqContext) {
  const message = context.getMessage();
  const retryCount = message.properties.headers['x-retry-count'] || 0;

  this.logger.error(`DLQ 메시지 수신: ${JSON.stringify(data)}, 재시도 횟수: ${retryCount}`);

  try {
    // 재시도 로직
    if (retryCount < 3) {
      await this.retryProcessing(data);
      this.logger.info(`재시도 성공: ${JSON.stringify(data)}`);
    } else {
      // 최대 재시도 초과 시 관리자에게 알림
      await this.notifyAdmin(data);
      this.logger.error(`최대 재시도 초과: ${JSON.stringify(data)}`);
    }
  } catch (error) {
    // 재시도 카운트 증가
    const channel = context.getChannelRef();
    channel.sendToQueue(
      'user_dlq',
      Buffer.from(JSON.stringify(data)),
      {
        headers: { 'x-retry-count': retryCount + 1 }
      }
    );
  }
}

// 재시도 로직
private async retryProcessing(data: any) {
  // 원래 처리 로직 재실행
  await this.userService.processMessage(data);
}

// 관리자 알림
private async notifyAdmin(data: any) {
  // Slack, 이메일 등으로 관리자에게 알림
  await this.slackService.sendMessage({
    channel: '#errors',
    text: `DLQ 메시지 처리 실패: ${JSON.stringify(data)}`
  });
}
```

**DLQ 플로우**:

```
[정상 큐: user_queue]
        ↓
    메시지 처리
        ↓
   ❌ 실패 (3회)
        ↓
[DLX: dlx_exchange] → [DLQ: user_dlq]
        ↓
  DLQ 컨슈머
        ↓
   재시도 (최대 3회)
        ↓
   ❌ 실패 → 관리자 알림
```

**배운 점**:

- DLQ는 메시지 유실 방지를 위한 필수 패턴
- 재시도 횟수 제한으로 무한 루프 방지
- 실패 메시지는 별도로 모니터링 필요

### B. 피드백

#### 1. 서비스 메시 현상 방지

현재는 서비스 수가 적지만, 서비스가 증가하면 **서비스 메시 현상**(모든 서비스가 서로 통신)이 발생할 수 있습니다.

**개선 방안**:

- **Event Bus 패턴**: 공통 이벤트 버스를 통한 통신
- **BFF (Backend For Frontend)**: 프론트엔드별 Gateway 분리
- **서비스 의존성 그래프 관리**: 순환 의존성 방지

#### 2. API 버저닝

MSA에서는 각 서비스가 독립적으로 배포되므로, **API 버전 관리**가 중요합니다.

**개선 방안**:

- `/v1/users`, `/v2/users` 형태의 URL 버저닝
- 하위 호환성 유지
- 점진적 마이그레이션

#### 3. 분산 트랜잭션 관리

현재는 queryRunner를 사용한 로컬 트랜잭션만 구현했지만, **여러 서비스에 걸친 트랜잭션**은 관리가 어렵습니다.

**개선 방안**:

- **Saga 패턴**: 보상 트랜잭션 기반 분산 트랜잭션
- **2PC (Two-Phase Commit)**: 강한 일관성 필요 시
- **Eventual Consistency**: 최종 일관성 기반 설계

#### 4. 모니터링 & 로깅

MSA에서는 여러 서비스에 걸친 **분산 추적**이 필수적입니다.

**개선 방안**:

- **Distributed Tracing**: Jaeger, Zipkin
- **중앙 로깅**: ELK Stack (Elasticsearch, Logstash, Kibana)
- **메트릭 수집**: Prometheus + Grafana

#### 5. 서비스 디스커버리

현재는 서비스 주소를 하드코딩했지만, 동적으로 서비스를 찾을 수 있어야 합니다.

**개선 방안**:

- **Consul**, **Eureka**: 서비스 레지스트리
- **Kubernetes Service**: 클라우드 네이티브 환경

## 느낀 점

### MSA는 은탄환이 아니다

이번 프로젝트를 통해 **MSA가 모든 문제를 해결하는 것은 아니다**는 것을 깨달았습니다.

**MSA의 장점**:

- ✅ 서비스별 독립적인 배포
- ✅ 기술 스택의 자유로운 선택
- ✅ 수평적 확장 용이
- ✅ 장애 격리

**MSA의 단점**:

- ❌ 복잡한 서비스 간 통신
- ❌ 분산 트랜잭션 관리의 어려움
- ❌ 네트워크 지연 시간 증가
- ❌ 운영 복잡도 증가

모놀리식 아키텍처가 적절한 경우도 많으며, 서비스 규모와 팀 상황에 맞는 아키텍처를 선택하는 것이 중요합니다.

### 설계의 중요성

MSA에서는 **초기 설계가 프로젝트의 성패를 좌우**합니다. 서비스를 어떻게 나눌지, 어떤 통신 패턴을 사용할지, 데이터베이스를 어떻게 분리할지 등을 신중하게 고민해야 합니다.

잘못된 서비스 분리는 모놀리식보다 더 복잡한 시스템을 만들 수 있습니다.

### 실무에서의 MSA

이번 경험을 통해 실무에서 MSA를 도입할 때 고려해야 할 점들을 배웠습니다:

- **점진적 마이그레이션**: 모놀리식 → MSA는 단계적으로
- **팀 구조**: Conway's Law - 조직 구조가 시스템 아키텍처를 결정
- **DevOps 인프라**: 자동화된 배포 파이프라인 필수
- **모니터링**: 분산 시스템의 가시성 확보

## API 문서

### Gateway API (Port 3000)

[![Swagger](<https://img.shields.io/badge/swagger_문서로_확인하기_(클릭!)-85EA2D?&logo=swagger&logoColor=white>)](#)

### 주요 API 목록

| Domain           | Method    | Endpoint              | Gateway → Service    | Description           |
| ---------------- | --------- | --------------------- | -------------------- | --------------------- |
| **Auth**         | POST      | `/auth/register`      | User Service         | 회원가입              |
| **Auth**         | POST      | `/auth/login`         | User Service         | 로그인 (카카오 OAuth) |
| **Auth**         | POST      | `/auth/refresh`       | User Service         | AccessToken 갱신      |
| **User**         | GET       | `/user/profile`       | User Service         | 내 프로필 조회        |
| **User**         | PATCH     | `/user/profile`       | User Service         | 프로필 수정           |
| **Couple**       | POST      | `/couple/connect`     | Couple Service       | 커플 연결/해제        |
| **Couple**       | GET       | `/couple/info`        | Couple Service       | 커플 정보 조회        |
| **Anniversary**  | GET       | `/couple/anniversary` | Couple Service       | 기념일 목록           |
| **Anniversary**  | POST      | `/couple/anniversary` | Couple Service       | 기념일 등록           |
| **Plan**         | GET       | `/couple/plan`        | Couple Service       | 약속 목록             |
| **Plan**         | POST      | `/couple/plan`        | Couple Service       | 약속 등록             |
| **Calendar**     | GET       | `/couple/calendar`    | Couple Service       | 캘린더 조회           |
| **Chat**         | WebSocket | `/socket.io`          | Chat Service         | 실시간 채팅           |
| **Post**         | GET       | `/post`               | Post Service         | 게시글 목록           |
| **Post**         | POST      | `/post`               | Post Service         | 게시글 작성           |
| **Comment**      | POST      | `/post/:id/comment`   | Post Service         | 댓글 작성             |
| **Notification** | WebSocket | `/socket.io`          | Notification Service | 실시간 알림           |

### RabbitMQ Message Pattern

| Service                  | Message Pattern             | Type             | Description        |
| ------------------------ | --------------------------- | ---------------- | ------------------ |
| **User Service**         | `parse_bearer_token`        | Request-Response | JWT 토큰 검증      |
| **User Service**         | `get_user_info`             | Request-Response | 사용자 정보 조회   |
| **User Service**         | `register`                  | Request-Response | 회원가입           |
| **User Service**         | `login`                     | Request-Response | 로그인             |
| **Couple Service**       | `get_couple_info`           | Request-Response | 커플 정보 조회     |
| **Chat Service**         | `create_chat_room`          | Request-Response | 채팅방 생성        |
| **Chat Service**         | `delete_chatroom_and_chats` | Event-Driven     | 채팅방/메시지 삭제 |
| **Post Service**         | `get_post`                  | Request-Response | 게시글 조회        |
| **Post Service**         | `create_post`               | Request-Response | 게시글 작성        |
| **Notification Service** | `matched_notification`      | Event-Driven     | 커플 매칭 알림     |
| **Notification Service** | `plan_notification`         | Event-Driven     | 약속 알림          |

## Docker Compose 실행

### 개발 환경 실행

```bash
# 전체 서비스 실행
docker-compose up -d

# 특정 서비스만 실행
docker-compose up -d gateway user couple

# 로그 확인
docker-compose logs -f gateway
```

### 서비스별 독립 실행

```bash
# Gateway
pnpm run start:dev gateway

# User Service
pnpm run start:dev user

# Couple Service
pnpm run start:dev couple

# Chat Service
pnpm run start:dev chat

# Post Service
pnpm run start:dev post

# Notification Service
pnpm run start:dev notification
```

## 향후 계획

### 1. AWS 배포

- **ECS (Elastic Container Service)**: 컨테이너 오케스트레이션
- **Application Load Balancer**: 트래픽 분산
- **RDS (PostgreSQL)**: 관리형 데이터베이스
- **DocumentDB (MongoDB)**: 관리형 MongoDB
- **Amazon MQ (RabbitMQ)**: 관리형 메시지 브로커

### 2. CI/CD 파이프라인

- **GitHub Actions**: 자동 빌드 및 테스트
- **Docker Registry**: ECR (Elastic Container Registry)
- **자동 배포**: ECS 자동 배포

### 3. 모니터링 & 로깅

- **CloudWatch**: AWS 통합 모니터링
- **X-Ray**: 분산 추적
- **ELK Stack**: 중앙 로깅

### 4. 성능 최적화

- **Redis**: 캐싱 레이어 추가
- **CDN**: CloudFront를 통한 정적 리소스 캐싱
- **Connection Pool**: 데이터베이스 연결 최적화

## 라이센스

MIT License

## 연락처

- **Email**: [pyowonsik@gmail.com](mailto:pyowonsik@gmail.com)
- **GitHub**: [https://github.com/pyowonsik](https://github.com/pyowonsik)
