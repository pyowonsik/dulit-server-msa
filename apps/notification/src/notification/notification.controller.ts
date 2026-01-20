import { Controller, UseInterceptors } from '@nestjs/common';
import { NotificationService } from './notification.service';
import { MessagePattern, Payload } from '@nestjs/microservices';
import { RpcInterceptor } from '@app/common';
import { CreateCoupleNotificationDto } from './dto/create-couple-notification.dto';

@Controller()
export class NotificationController {
  constructor(private readonly notificationService: NotificationService) {}

  @MessagePattern({ cmd: 'matched_notification' })
  @UseInterceptors(RpcInterceptor)
  matchedNotification(@Payload() data: CreateCoupleNotificationDto) {
    return this.notificationService.matchedNotification(data);
  }
}
