import { Entity, PrimaryKey, ManyToOne, Property } from '@mikro-orm/core';
import { Article } from './article.entity';
import { User } from '../user/user.entity';

@Entity({ tableName: 'article_edit_lock' })
export class ArticleEditLock {
  @PrimaryKey({ type: 'number' })
  id!: number;

  @ManyToOne(() => Article, { unique: true })
  article!: Article;

  @ManyToOne(() => User)
  lockedBy!: User;

  @Property({ type: 'date' })
  lastSeenAt: Date = new Date();

  @Property({ type: 'date' })
  createdAt: Date = new Date();

  @Property({ type: 'date', onUpdate: () => new Date() })
  updatedAt: Date = new Date();
}
