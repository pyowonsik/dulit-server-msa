import {
  Controller,
  Get,
  UseInterceptors,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { ChatService } from './chat.service';
import { EventPattern, MessagePattern, Payload } from '@nestjs/microservices';
import { RpcInterceptor } from '@app/common';
import { CreateChatRoomDto } from './dto/create-chat-room.dto';
import { DeleteChatroomAndChatsDto } from './dto/delete-chatroom-and-chats.dto';

@Controller()
export class ChatController {
  constructor(private readonly chatService: ChatService) {}

  @MessagePattern({
    cmd: 'create_chat_room',
  })
  @UsePipes(ValidationPipe)
  @UseInterceptors(RpcInterceptor)
  createChatRoom(@Payload() data: CreateChatRoomDto) {
    return this.chatService.createChatRoom(data);
  }

  @MessagePattern({
    cmd: 'delete_chatroom_and_chats',
  })
  @UsePipes(ValidationPipe)
  @UseInterceptors(RpcInterceptor)
  deleteChatRoomAndChats(@Payload() data: DeleteChatroomAndChatsDto) {
    return this.chatService.deleteChatroomAndChatsDto(data);
  }

  @MessagePattern({
    cmd: 'delete_chatroom_by_couple_id',
  })
  @UsePipes(ValidationPipe)
  @UseInterceptors(RpcInterceptor)
  deleteChatRoomByCoupleId(@Payload() data: { coupleId: string }) {
    return this.chatService.deleteChatroomByCoupleId(data.coupleId);
  }
}
