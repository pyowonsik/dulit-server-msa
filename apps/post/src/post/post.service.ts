import {
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Post } from './entity/post.entity';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { CreatePostDto } from './dto/create-post.dto';
import { GetPostsDto } from './dto/get-posts.dto';
import { GetPostDto } from './dto/get-post.dto';
import { UpdatePostDto } from './dto/update-post.dto';
import { PaginationService } from '@app/common';
import { join } from 'path';
import { existsSync, mkdirSync, unlinkSync } from 'fs';
import { rename } from 'fs/promises';
import { CommentModel } from '../comment/entity/comment.entity';

@Injectable()
export class PostService {
  private readonly logger = new Logger(PostService.name);

  constructor(
    private readonly dataSource: DataSource,
    @InjectRepository(Post)
    private readonly postRepository: Repository<Post>,
    private readonly paginationService: PaginationService,
  ) {}

  async createPost(createPostDto: CreatePostDto) {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    const movedFiles: string[] = [];
    const tempFolder = join('public', 'temp');
    const filesFolder = join('public', 'files/post');

    try {
      const { meta, title, description, filePaths } = createPostDto;
      const userId = meta.user.sub;

      if (filePaths && filePaths.length > 0) {
        if (!existsSync(filesFolder)) {
          mkdirSync(filesFolder, { recursive: true });
        }

        for (const file of filePaths) {
          await this.renameFiles(tempFolder, filesFolder, file);
          movedFiles.push(file);
        }
      }

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
          this.logger.log(`[TX:COMPENSATE] POST_CREATE 파일 복구 성공: ${file}`);
        } catch (fileError) {
          this.logger.error(`[TX:COMPENSATE] POST_CREATE 파일 복구 실패: ${file}`, fileError);
        }
      }

      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  async updatePost(updatePostDto: UpdatePostDto) {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    const tempFolder = join('public', 'temp');
    const filesFolder = join('public', 'files/post');
    const backupFolder = join('public', 'backup/post');

    const backedUpFiles: { original: string; backup: string }[] = [];
    const movedFiles: string[] = [];

    try {
      const { meta, title, description, filePaths, postId } = updatePostDto;

      const post = await queryRunner.manager.findOne(Post, {
        where: { id: postId },
      });

      if (!post) {
        throw new NotFoundException('존재하지 않는 POST의 ID 입니다.');
      }

      if (filePaths) {
        if (!existsSync(backupFolder)) {
          mkdirSync(backupFolder, { recursive: true });
        }

        // 기존 파일 백업
        if (post.filePaths) {
          for (const oldFile of post.filePaths) {
            const oldPath = join(process.cwd(), filesFolder, oldFile);
            if (existsSync(oldPath)) {
              const backupName = `${Date.now()}_${oldFile}`;
              await rename(oldPath, join(process.cwd(), backupFolder, backupName));
              backedUpFiles.push({ original: oldFile, backup: backupName });
            }
          }
        }

        // 새 파일 이동
        for (const file of filePaths) {
          await this.renameFiles(tempFolder, filesFolder, file);
          movedFiles.push(file);
        }
      }

      await queryRunner.manager.update(
        Post,
        { id: postId },
        {
          title,
          description,
          filePaths,
          authorId: meta.user.sub,
        },
      );

      const updatedPost = await queryRunner.manager.findOne(Post, {
        where: { id: postId },
      });

      await queryRunner.commitTransaction();

      // 성공: 백업 파일 삭제 (비동기)
      this.cleanupBackupFiles(backupFolder, backedUpFiles).catch((e) =>
        this.logger.warn('[TX:POST_UPDATE] 백업 정리 실패', e),
      );

      return updatedPost;
    } catch (error) {
      await queryRunner.rollbackTransaction();

      // 보상: 새 파일 되돌리기
      for (const file of movedFiles) {
        try {
          await this.renameFiles(filesFolder, tempFolder, file);
        } catch (e) {
          this.logger.error(`[TX:COMPENSATE] POST_UPDATE 새 파일 복구 실패: ${file}`);
        }
      }

      // 보상: 백업 파일 복원
      for (const { original, backup } of backedUpFiles) {
        try {
          await rename(
            join(process.cwd(), backupFolder, backup),
            join(process.cwd(), filesFolder, original),
          );
        } catch (e) {
          this.logger.error(`[TX:COMPENSATE] POST_UPDATE 백업 복원 실패: ${original}`);
        }
      }

      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  async deletePost(getPostDto: GetPostDto) {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    const filesFolder = join('public', 'files/post');
    const backupFolder = join('public', 'backup/post');

    const backedUpFiles: { original: string; backup: string }[] = [];

    try {
      const { postId } = getPostDto;

      const post = await queryRunner.manager.findOne(Post, {
        where: { id: postId },
      });

      if (!post) {
        throw new NotFoundException('존재하지 않는 POST의 ID 입니다.');
      }

      // 파일 백업
      if (post.filePaths && post.filePaths.length > 0) {
        if (!existsSync(join(process.cwd(), backupFolder))) {
          mkdirSync(join(process.cwd(), backupFolder), { recursive: true });
        }

        for (const file of post.filePaths) {
          const filePath = join(process.cwd(), filesFolder, file);
          if (existsSync(filePath)) {
            const backupName = `deleted_${Date.now()}_${file}`;
            await rename(filePath, join(process.cwd(), backupFolder, backupName));
            backedUpFiles.push({ original: file, backup: backupName });
          }
        }
      }

      // DB 삭제
      await queryRunner.manager.delete(CommentModel, { postId });
      await queryRunner.manager.delete(Post, { id: postId });

      await queryRunner.commitTransaction();

      // 성공: 백업 영구 삭제 (비동기)
      this.deleteBackupFiles(backupFolder, backedUpFiles).catch((e) =>
        this.logger.warn('[TX:POST_DELETE] 백업 삭제 실패', e),
      );

      return postId;
    } catch (error) {
      await queryRunner.rollbackTransaction();

      // 보상: 백업 파일 복원
      for (const { original, backup } of backedUpFiles) {
        try {
          await rename(
            join(process.cwd(), backupFolder, backup),
            join(process.cwd(), filesFolder, original),
          );
        } catch (e) {
          this.logger.error(`[TX:COMPENSATE] POST_DELETE 파일 복원 실패: ${original}`);
        }
      }

      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  async getPosts(getPostsDto: GetPostsDto) {
    const { title } = getPostsDto;

    const qb = this.postRepository.createQueryBuilder('post').select();

    if (title) {
      qb.where('post.title LIKE :title', { title: `%${title}%` });
    }

    const { nextCursor } =
      await this.paginationService.applyCursorPaginationParamsToQb(
        qb,
        getPostsDto,
      );

    const [data, count] = await qb.getManyAndCount();

    return {
      data,
      nextCursor,
      count,
    };
  }

  async getPost(getPostDto: GetPostDto) {
    const { postId } = getPostDto;

    const post = await this.postRepository.findOne({
      where: {
        id: postId,
      },
    });

    if (!post) {
      throw new NotFoundException('존재하지 않는 POST의 ID 입니다.');
    }

    return post;
  }

  async renameFiles(tempFolder: string, filesFolder: string, file: string) {
    return rename(
      join(process.cwd(), tempFolder, file),
      join(process.cwd(), filesFolder, file),
    );
  }

  async isPostMineOrAdmin(getPostDto: GetPostDto) {
    const { meta, postId } = getPostDto;

    return this.postRepository.exists({
      where: {
        id: postId,
        authorId: meta.user.sub,
      },
    });
  }

  private async cleanupBackupFiles(
    backupFolder: string,
    files: { backup: string }[],
  ): Promise<void> {
    for (const { backup } of files) {
      try {
        unlinkSync(join(process.cwd(), backupFolder, backup));
      } catch (e) {
        // 무시
      }
    }
  }

  private async deleteBackupFiles(
    backupFolder: string,
    files: { backup: string }[],
  ): Promise<void> {
    for (const { backup } of files) {
      try {
        unlinkSync(join(process.cwd(), backupFolder, backup));
      } catch (e) {
        // 무시
      }
    }
  }
}
