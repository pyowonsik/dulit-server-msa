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
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiParam, ApiConsumes, ApiBody } from '@nestjs/swagger';
import { UserPayloadDto } from '@app/common/dto';
import { PostService } from './post.service';

import { FilesInterceptor } from '@nestjs/platform-express';
import { GetPostsDto } from './dto/get-posts.dto';
import { UpdatePostDto } from './dto/update-post.dto';
import { UserPayload } from '../auth/decorator/user-payload.decorator';
import { CreatePostDto } from './dto/create-post.dto';
import { IsPostMineOrAdminGuard } from './guard/is-post-mine-or-admin.guard';

@ApiTags('게시글')
@ApiBearerAuth()
@Controller('')
export class PostController {
  constructor(private readonly postService: PostService) {}

  @Post('/post')
  @ApiOperation({ summary: '게시글 작성', description: '새로운 게시글을 작성합니다.' })
  @ApiResponse({ status: 201, description: '게시글 작성 성공' })
  @ApiResponse({ status: 401, description: '인증 실패' })
  async createPost(
    @UserPayload() userPayload: UserPayloadDto,
    @Body() createPostDto: CreatePostDto,
  ) {
    return this.postService.createPost(createPostDto, userPayload);
  }

  @Get('/posts')
  @ApiOperation({ summary: '게시글 목록 조회', description: '게시글 목록을 페이지네이션하여 조회합니다.' })
  @ApiResponse({ status: 200, description: '게시글 목록 조회 성공' })
  @ApiResponse({ status: 401, description: '인증 실패' })
  async getPosts(
    @UserPayload() userPayload: UserPayloadDto,
    @Query() getPostsDto: GetPostsDto,
  ) {
    return this.postService.getPosts(getPostsDto, userPayload);
  }

  @Get('/post/:postId')
  @ApiOperation({ summary: '게시글 상세 조회', description: '특정 게시글의 상세 정보를 조회합니다.' })
  @ApiParam({ name: 'postId', description: '게시글 ID' })
  @ApiResponse({ status: 200, description: '게시글 조회 성공' })
  @ApiResponse({ status: 404, description: '게시글을 찾을 수 없음' })
  async getPost(
    @UserPayload() userPayload: UserPayloadDto,
    @Param('postId') postId: string,
  ) {
    return this.postService.getPost(userPayload, postId);
  }

  @Patch('/post/:postId')
  @UseGuards(IsPostMineOrAdminGuard)
  @ApiOperation({ summary: '게시글 수정', description: '게시글을 수정합니다. 본인 게시글만 수정 가능합니다.' })
  @ApiParam({ name: 'postId', description: '게시글 ID' })
  @ApiResponse({ status: 200, description: '게시글 수정 성공' })
  @ApiResponse({ status: 403, description: '수정 권한 없음' })
  @ApiResponse({ status: 404, description: '게시글을 찾을 수 없음' })
  async updatePost(
    @UserPayload() userPayload: UserPayloadDto,
    @Body() updatePostDto: UpdatePostDto,
    @Param('postId') postId: string,
  ) {
    return this.postService.updatePost(updatePostDto, userPayload, postId);
  }

  @Delete('/post/:postId')
  @UseGuards(IsPostMineOrAdminGuard)
  @ApiOperation({ summary: '게시글 삭제', description: '게시글을 삭제합니다. 본인 게시글만 삭제 가능합니다.' })
  @ApiParam({ name: 'postId', description: '게시글 ID' })
  @ApiResponse({ status: 200, description: '게시글 삭제 성공' })
  @ApiResponse({ status: 403, description: '삭제 권한 없음' })
  @ApiResponse({ status: 404, description: '게시글을 찾을 수 없음' })
  async deletePost(
    @UserPayload() userPayload: UserPayloadDto,
    @Param('postId') postId: string,
  ) {
    return this.postService.deletePost(userPayload, postId);
  }

  @Post('/post/upload/files')
  @ApiOperation({ summary: '게시글 파일 업로드', description: '게시글에 첨부할 이미지/영상 파일을 업로드합니다.' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        files: {
          type: 'array',
          items: { type: 'string', format: 'binary' },
          description: '업로드할 파일들 (최대 10개, 20MB 이하)',
        },
      },
    },
  })
  @ApiResponse({ status: 201, description: '파일 업로드 성공' })
  @ApiResponse({ status: 400, description: '지원하지 않는 파일 형식' })
  @UseInterceptors(
    FilesInterceptor('files', 10, {
      limits: {
        fileSize: 20000000,
      },
      fileFilter(req, file, callback) {
        const allowedMimeTypes = [
          'image/jpeg',
          'image/png',
          'image/gif',
          'video/mp4',
          'video/mpeg',
          'video/webm',
        ];

        if (!allowedMimeTypes.includes(file.mimetype)) {
          return callback(
            new BadRequestException(
              '이미지 또는 영상 파일만 업로드 가능합니다.',
            ),
            false,
          );
        }
        return callback(null, true);
      },
    }),
  )
  async createFiles(
    @UploadedFiles()
    files: Array<Express.Multer.File>,
  ) {
    const fileNames = files.map((file) => file.filename);

    return {
      fileNames: fileNames,
    };
  }
}
