import {
  MiddlewareConsumer,
  Module,
  NestModule,
  RequestMethod,
} from '@nestjs/common';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { ConfigModule, ConfigService } from '@nestjs/config';
import * as Joi from 'joi';
import {
  CHAT_SERVICE,
  COUPLE_SERVICE,
  NOTIFICATION_SERVICE,
  POST_SERVICE,
  USER_SERVICE,
} from '@app/common';
import { AuthModule } from './auth/auth.module';
import { CoupleModule } from './couple/couple.module';
import { BearerTokenMiddleware } from './auth/middleware/bearer-token.middleware';
import { APP_GUARD } from '@nestjs/core';
import { AuthGuard } from './auth/guard/auth.guard';
import { NotificationModule } from './notification/notification.module';
import { PostModule } from './post/post.module';
import { HealthModule } from './health/health.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validationSchema: Joi.object({
        USER_HOST: Joi.string().required(),
        USER_TCP_PORT: Joi.number().required(),
        COUPLE_HOST: Joi.string().required(),
        COUPLE_TCP_PORT: Joi.number().required(),
      }),
    }),
    // 통신할 MS 정의
    ClientsModule.registerAsync({
      clients: [
        {
          name: USER_SERVICE,
          useFactory: (configService: ConfigService) => ({
            transport: Transport.RMQ,
            options: {
              urls: ['amqp://rabbitmq:5672'],
              queue: 'user_queue',
              queueOptions: {
                durable: false,
              },
            },
          }),
          inject: [ConfigService],
        },
        {
          name: COUPLE_SERVICE,
          useFactory: (configService: ConfigService) => ({
            transport: Transport.RMQ,
            options: {
              urls: ['amqp://rabbitmq:5672'],
              queue: 'couple_queue',
              queueOptions: {
                durable: false,
              },
            },
          }),
          inject: [ConfigService],
        },
        // {
        //   name: NOTIFICATION_SERVICE,
        //   useFactory: (configService: ConfigService) => ({
        //     transport: Transport.TCP,
        //     options: {
        //       host: configService.getOrThrow<string>('NOTIFICATION_HOST'),
        //       port: configService.getOrThrow<number>('NOTIFICATION_TCP_PORT'),
        //     },
        //   }),
        //   inject: [ConfigService],
        // },
        // {
        //   name: CHAT_SERVICE,
        //   useFactory: (configService: ConfigService) => ({
        //     transport: Transport.TCP,
        //     options: {
        //       host: configService.getOrThrow<string>('CHAT_HOST'),
        //       port: configService.getOrThrow<number>('CHAT_TCP_PORT'),
        //     },
        //   }),
        //   inject: [ConfigService],
        // },
        {
          name: POST_SERVICE,
          useFactory: (configService: ConfigService) => ({
            transport: Transport.RMQ,
            options: {
              urls: ['amqp://rabbitmq:5672'],
              queue: 'post_queue',
              queueOptions: {
                durable: false,
              },
            },
          }),
          inject: [ConfigService],
        },
      ],
      isGlobal: true,
    }),
    AuthModule,
    CoupleModule,
    NotificationModule,
    PostModule,
    HealthModule,
  ],
  providers: [
    {
      provide: APP_GUARD,
      useClass: AuthGuard,
    },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer
      .apply(BearerTokenMiddleware)
      .exclude(
        {
          path: 'auth/register',
          method: RequestMethod.POST,
        },
        {
          path: 'auth/login',
          method: RequestMethod.POST,
        },
        {
          path: 'health',
          method: RequestMethod.GET,
        },
        {
          path: 'health/ping',
          method: RequestMethod.GET,
        },
      )
      .forRoutes('*');
  }
}
