import { EntityManager, QueryOrder, wrap } from '@mikro-orm/core';
import { EntityRepository } from '@mikro-orm/mysql';
import { InjectRepository } from '@mikro-orm/nestjs';
import { Injectable, ForbiddenException, ConflictException } from '@nestjs/common';

import { User } from '../user/user.entity';
import { Article } from './article.entity';
import { IArticleRO, IArticlesRO, ICommentsRO } from './article.interface';
import { Comment } from './comment.entity';
import { CreateArticleDto, CreateCommentDto } from './dto';
import { ArticleEditLock } from './article-edit-lock.entity';
import { LOCK_TIMEOUT_MS } from '../config';

@Injectable()
export class ArticleService {
  constructor(
    private readonly em: EntityManager,
    @InjectRepository(Article)
    private readonly articleRepository: EntityRepository<Article>,
    @InjectRepository(Comment)
    private readonly commentRepository: EntityRepository<Comment>,
    @InjectRepository(User)
    private readonly userRepository: EntityRepository<User>,
    @InjectRepository(ArticleEditLock)
    private readonly lockRepository: EntityRepository<ArticleEditLock>,
  ) {}

  async findAll(userId: number, query: Record<string, string>): Promise<IArticlesRO> {
    const user = userId
      ? await this.userRepository.findOne(userId, { populate: ['followers', 'favorites'] })
      : undefined;
    const qb = this.articleRepository.createQueryBuilder('a').select('a.*').leftJoin('a.author', 'u');

    if ('tag' in query) {
      qb.andWhere({ tagList: new RegExp(query.tag) });
    }

    if ('author' in query) {
      const author = await this.userRepository.findOne({ username: query.author });

      if (!author) {
        return { articles: [], articlesCount: 0 };
      }

      qb.andWhere({ author: author.id });
    }

    if ('favorited' in query) {
      const author = await this.userRepository.findOne({ username: query.favorited }, { populate: ['favorites'] });

      if (!author) {
        return { articles: [], articlesCount: 0 };
      }

      const ids = author.favorites.$.getIdentifiers();
      qb.andWhere({ author: ids });
    }

    qb.orderBy({ createdAt: QueryOrder.DESC });
    const res = await qb.clone().count('id', true).execute('get');
    const articlesCount = res.count;

    if ('limit' in query) {
      qb.limit(+query.limit);
    }

    if ('offset' in query) {
      qb.offset(+query.offset);
    }

    const ids = (await qb.getResult()).map((a) => a.id);
    const articles = await this.articleRepository.find({ id: { $in: ids } }, { populate: ['author', 'coAuthors'] });
    return { articles: articles.map((a) => a.toJSON(user!)), articlesCount };
  }

  async findFeed(userId: number, query: Record<string, string>): Promise<IArticlesRO> {
    const user = userId
      ? await this.userRepository.findOne(userId, { populate: ['followers', 'favorites'] })
      : undefined;
    const res = await this.articleRepository.findAndCount(
      { author: { followers: userId } },
      {
        populate: ['author', 'coAuthors'],
        orderBy: { createdAt: QueryOrder.DESC },
        limit: +query.limit,
        offset: +query.offset,
      },
    );

    console.log('findFeed', { articles: res[0], articlesCount: res[1] });
    return { articles: res[0].map((a) => a.toJSON(user!)), articlesCount: res[1] };
  }

  async findOne(userId: number, where: Partial<Article>): Promise<IArticleRO> {
    const user = userId
      ? await this.userRepository.findOneOrFail(userId, { populate: ['followers', 'favorites'] })
      : undefined;
    const article = await this.articleRepository.findOne(where, { populate: ['author', 'coAuthors'] });
    return { article: article && article.toJSON(user) } as IArticleRO;
  }

  async addComment(userId: number, slug: string, dto: CreateCommentDto) {
    const article = await this.articleRepository.findOneOrFail({ slug }, { populate: ['author', 'coAuthors'] });
    const author = await this.userRepository.findOneOrFail(userId);
    const comment = new Comment(author, article, dto.body);
    await this.em.persistAndFlush(comment);

    return { comment, article: article.toJSON(author) };
  }

  async deleteComment(userId: number, slug: string, id: number): Promise<IArticleRO> {
    const article = await this.articleRepository.findOneOrFail({ slug }, { populate: ['author', 'coAuthors'] });
    const user = await this.userRepository.findOneOrFail(userId);
    const comment = this.commentRepository.getReference(id);

    if (article.comments.contains(comment)) {
      article.comments.remove(comment);
      await this.em.removeAndFlush(comment);
    }

    return { article: article.toJSON(user) };
  }

  async favorite(id: number, slug: string): Promise<IArticleRO> {
    const article = await this.articleRepository.findOneOrFail({ slug }, { populate: ['author', 'coAuthors'] });
    const user = await this.userRepository.findOneOrFail(id, { populate: ['favorites', 'followers'] });

    if (!user.favorites.contains(article)) {
      user.favorites.add(article);
      article.favoritesCount++;
    }

    await this.em.flush();
    return { article: article.toJSON(user) };
  }

  async unFavorite(id: number, slug: string): Promise<IArticleRO> {
    const article = await this.articleRepository.findOneOrFail({ slug }, { populate: ['author', 'coAuthors'] });
    const user = await this.userRepository.findOneOrFail(id, { populate: ['followers', 'favorites'] });

    if (user.favorites.contains(article)) {
      user.favorites.remove(article);
      article.favoritesCount--;
    }

    await this.em.flush();
    return { article: article.toJSON(user) };
  }

  async findComments(slug: string): Promise<ICommentsRO> {
    const article = await this.articleRepository.findOne({ slug }, { populate: ['comments'] });
    return { comments: article!.comments.getItems() };
  }

  async create(userId: number, dto: CreateArticleDto) {
    const user = await this.userRepository.findOne(
      { id: userId },
      { populate: ['followers', 'favorites', 'articles'] },
    );
    const article = new Article(user!, dto.title, dto.description, dto.body);
    article.tagList.push(...dto.tagList);

    // attach co-authors if provided
    if (dto.coAuthors && dto.coAuthors.length) {
      const coAuthors = await this.userRepository.find({ username: { $in: dto.coAuthors } });
      const filtered = coAuthors.filter((u) => u.id !== user!.id);
      filtered.forEach((u) => article.coAuthors.add(u));
    }

    user?.articles.add(article);
    await this.em.flush();

    // ensure relations are loaded for JSON
    await this.em.populate(article, ['author', 'coAuthors']);
    return { article: article.toJSON(user!) };
  }

  async update(userId: number, slug: string, articleData: CreateArticleDto): Promise<IArticleRO> {
    const user = await this.userRepository.findOne(
      { id: userId },
      { populate: ['followers', 'favorites', 'articles'] },
    );
    const article = await this.articleRepository.findOneOrFail({ slug }, { populate: ['author', 'coAuthors'] });

    // enforce active lock ownership (if any and not expired)
    const existingLock = await this.lockRepository.findOne({ article: article.id }, { populate: ['lockedBy'] });
    if (existingLock) {
      const expired = Date.now() - existingLock.lastSeenAt.getTime() > LOCK_TIMEOUT_MS;
      if (!expired && existingLock.lockedBy.id !== userId) {
        throw new ConflictException('Article is currently locked by another user');
      }
    }

    // authorization: author or co-author
    const isAuthor = article.author.id === userId;
    const isCoAuthor = article.coAuthors.isInitialized() && article.coAuthors.getItems().some((u) => u.id === userId);
    if (!isAuthor && !isCoAuthor) {
      throw new ForbiddenException('You are not allowed to edit this article');
    }

    // assign basic fields (avoid coAuthors through assign)
    const { coAuthors: coAuthorUsernames, ...rest } = articleData as any;
    wrap(article).assign(rest);

    // update co-authors if provided: replace set
    if (coAuthorUsernames) {
      const coAuthors = await this.userRepository.find({ username: { $in: coAuthorUsernames } });
      const filtered = coAuthors.filter((u) => u.id !== article.author.id);
      article.coAuthors.removeAll();
      filtered.forEach((u) => article.coAuthors.add(u));
    }

    await this.em.flush();

    await this.em.populate(article, ['author', 'coAuthors']);
    return { article: article!.toJSON(user!) };
  }

  async delete(slug: string) {
    return this.articleRepository.nativeDelete({ slug });
  }

  // Locking methods
  private isLockExpired(lock: ArticleEditLock): boolean {
    return Date.now() - lock.lastSeenAt.getTime() > LOCK_TIMEOUT_MS;
  }

  async acquireLock(userId: number, slug: string) {
    const article = await this.articleRepository.findOneOrFail({ slug });
    let lock = await this.lockRepository.findOne({ article: article.id }, { populate: ['lockedBy'] });
    const userRef = await this.userRepository.findOneOrFail(userId);

    if (!lock) {
      lock = new ArticleEditLock();
      lock.article = article;
      lock.lockedBy = userRef;
      lock.lastSeenAt = new Date();
      await this.em.persistAndFlush(lock);
      return { ok: true };
    }

    if (this.isLockExpired(lock)) {
      lock.lockedBy = userRef;
      lock.lastSeenAt = new Date();
      await this.em.flush();
      return { ok: true };
    }

    if (lock.lockedBy.id === userId) {
      lock.lastSeenAt = new Date();
      await this.em.flush();
      return { ok: true };
    }

    throw new ConflictException('Article is currently locked by another user');
  }

  async heartbeatLock(userId: number, slug: string) {
    const article = await this.articleRepository.findOneOrFail({ slug });
    const lock = await this.lockRepository.findOne({ article: article.id }, { populate: ['lockedBy'] });
    if (!lock) {
      throw new ConflictException('No active lock');
    }
    if (this.isLockExpired(lock)) {
      throw new ConflictException('Lock expired');
    }
    if (lock.lockedBy.id !== userId) {
      throw new ConflictException('Article is currently locked by another user');
    }
    lock.lastSeenAt = new Date();
    await this.em.flush();
    return { ok: true };
  }

  async releaseLock(userId: number, slug: string) {
    const article = await this.articleRepository.findOneOrFail({ slug });
    const lock = await this.lockRepository.findOne({ article: article.id }, { populate: ['lockedBy'] });
    if (!lock) {
      return { ok: true };
    }
    if (lock.lockedBy.id !== userId) {
      throw new ConflictException('Cannot release a lock you do not own');
    }
    await this.em.removeAndFlush(lock);
    return { ok: true };
  }
}
