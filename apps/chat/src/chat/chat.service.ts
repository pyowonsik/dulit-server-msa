import { Injectable } from '@nestjs/common';
import { ChatRoom } from './schema/chat-room.schema';
import { CreateChatRoomDto } from './dto/create-chat-room.dto';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Socket } from 'socket.io';
import { Chat } from './schema/chat.schema';
import { CreateChatDto } from './dto/create-chat.dto';
import { DeleteChatroomAndChatsDto } from './dto/delete-chatroom-and-chats.dto';

@Injectable()
export class ChatService {
  constructor(
    @InjectModel(ChatRoom.name)
    private readonly chatroomModel: Model<ChatRoom>,
    @InjectModel(Chat.name)
    private readonly chatModel: Model<Chat>,
  ) {}

  private readonly connectedClients = new Map<string, Socket>();

  registerClient(userId: string, client: Socket) {
    this.connectedClients.set(userId, client);
  }

  removeClient(userId: string) {
    this.connectedClients.delete(userId);
  }

  // 채팅방 생성
  async createChatRoom(dto: CreateChatRoomDto) {
    const chatroom = await this.chatroomModel.create({
      user1Id: dto.user1Id,
      user2Id: dto.user2Id,
      coupleId: dto.coupleId,
    });

    return chatroom;
  }

  async joinUserRooms(user: { sub: string }, client: Socket) {
    const chatRoom = await this.findMyChatRoom(user.sub);

    if (!chatRoom) {
      client.emit('error', { message: '커플이 매칭 되지 않은 사용자입니다.' });
      return;
    }

    console.log(`Join chat room - ${chatRoom._id.toString()}`);
    client.join(chatRoom._id.toString());
  }

  // 채팅 메세지 전송
  async sendMessage(payload: { sub: string }, { message }: CreateChatDto) {
    const chatRoom = await this.findMyChatRoom(payload.sub);

    const chatModel = await this.chatModel.create({
      userId: payload.sub,
      message: message,
      chatRoomId: chatRoom,
    });

    const client = this.connectedClients.get(payload.sub);

    const roomId = chatRoom._id.toString();

    // MongoDB는 반환된 객체가 이미 plain object
    client.to(roomId).emit('sendMessage', chatModel);

    return message;
  }

  async findMyChatRoom(userId: string) {
    const chatRoom = await this.chatroomModel.findOne({
      $or: [{ user1Id: userId }, { user2Id: userId }],
    });

    return chatRoom;
  }

  async deleteChatroomAndChatsDto(dto: DeleteChatroomAndChatsDto) {
    const { coupleId, user1Id, user2Id } = dto;
    const userIds = [user1Id, user2Id];

    try {
      // 소켓 연결 해제 및 클라이언트 제거
      userIds.forEach((userId) => {
        const client = this.connectedClients.get(userId);
        if (client) {
          client.disconnect();
          this.removeClient(userId);
        }
      });

      // DB 삭제 병렬 처리
      await Promise.all([
        this.chatroomModel.findOneAndDelete({ coupleId }),
        this.chatModel.deleteMany({ userId: { $in: userIds } }),
      ]);

      return { status: 'success', message: 'ChatRoom 및 Chat 삭제 완료' };
    } catch (error) {
      return { status: 'error', message: error.message };
    }
  }

  async deleteChatroomByCoupleId(coupleId: string) {
    try {
      const chatroom = await this.chatroomModel.findOne({ coupleId });

      if (chatroom) {
        const userIds = [chatroom.user1Id, chatroom.user2Id];

        // 소켓 연결 해제 및 클라이언트 제거
        userIds.forEach((userId) => {
          const client = this.connectedClients.get(userId);
          if (client) {
            client.disconnect();
            this.removeClient(userId);
          }
        });

        // DB 삭제 병렬 처리
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
}
