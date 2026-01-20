import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
  UsePipes,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiParam } from '@nestjs/swagger';
import { UserPayloadDto } from '@app/common/dto';

import { FilesInterceptor } from '@nestjs/platform-express';
import { CommentService } from './comment.service';
import { UserPayload } from '../../auth/decorator/user-payload.decorator';
import { GetCommentsDto } from './dto/get-comments.dto';
import { UpdateCommentDto } from './dto/update-comment.dto';
import { CreateCommentDto } from './dto/create-comment.dto';
import { IsCommentMineOrAdminGuard } from './guard/is-comment-mine-or-admin.guard';

@ApiTags('댓글')
@ApiBearerAuth()
@Controller('post/:postId')
export class CommentController {
  constructor(private readonly commentService: CommentService) {}

  @Post('/comment')
  @ApiOperation({ summary: '댓글 작성', description: '게시글에 댓글을 작성합니다.' })
  @ApiParam({ name: 'postId', description: '게시글 ID' })
  @ApiResponse({ status: 201, description: '댓글 작성 성공' })
  @ApiResponse({ status: 401, description: '인증 실패' })
  @ApiResponse({ status: 404, description: '게시글을 찾을 수 없음' })
  async createComment(
    @UserPayload() userPayload: UserPayloadDto,
    @Body() createCommentDto: CreateCommentDto,
    @Param('postId') postId: string,
  ) {
    return this.commentService.createComment(
      createCommentDto,
      userPayload,
      postId,
    );
  }

  @Get('/comments')
  @ApiOperation({ summary: '댓글 목록 조회', description: '게시글의 댓글 목록을 조회합니다.' })
  @ApiParam({ name: 'postId', description: '게시글 ID' })
  @ApiResponse({ status: 200, description: '댓글 목록 조회 성공' })
  @ApiResponse({ status: 404, description: '게시글을 찾을 수 없음' })
  async getComments(
    @UserPayload() userPayload: UserPayloadDto,
    @Query() getCommentsDto: GetCommentsDto,
    @Param('postId') postId: string,
  ) {
    return this.commentService.getComments(getCommentsDto, userPayload, postId);
  }

  @Patch('/comment/:commentId')
  @UseGuards(IsCommentMineOrAdminGuard)
  @ApiOperation({ summary: '댓글 수정', description: '댓글을 수정합니다. 본인 댓글만 수정 가능합니다.' })
  @ApiParam({ name: 'postId', description: '게시글 ID' })
  @ApiParam({ name: 'commentId', description: '댓글 ID' })
  @ApiResponse({ status: 200, description: '댓글 수정 성공' })
  @ApiResponse({ status: 403, description: '수정 권한 없음' })
  @ApiResponse({ status: 404, description: '댓글을 찾을 수 없음' })
  async updateComment(
    @UserPayload() userPayload: UserPayloadDto,
    @Body() updateCommentDto: UpdateCommentDto,
    @Param('postId') postId: string,
    @Param('commentId') commentId: string,
  ) {
    return this.commentService.updateComment(
      updateCommentDto,
      userPayload,
      postId,
      commentId,
    );
  }

  @Delete('/comment/:commentId')
  @UseGuards(IsCommentMineOrAdminGuard)
  @ApiOperation({ summary: '댓글 삭제', description: '댓글을 삭제합니다. 본인 댓글만 삭제 가능합니다.' })
  @ApiParam({ name: 'postId', description: '게시글 ID' })
  @ApiParam({ name: 'commentId', description: '댓글 ID' })
  @ApiResponse({ status: 200, description: '댓글 삭제 성공' })
  @ApiResponse({ status: 403, description: '삭제 권한 없음' })
  @ApiResponse({ status: 404, description: '댓글을 찾을 수 없음' })
  async deleteComment(
    @UserPayload() userPayload: UserPayloadDto,
    @Param('postId') postId: string,
    @Param('commentId') commentId: string,
  ) {
    return this.commentService.deleteComment(userPayload, postId, commentId);
  }
}
