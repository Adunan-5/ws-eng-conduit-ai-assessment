import { Migration } from '@mikro-orm/migrations';

export class AddArticleEditLock extends Migration {
  async up(): Promise<void> {
    this.addSql(
      "create table `article_edit_lock` (`id` int unsigned not null auto_increment primary key, `article_id` int unsigned not null, `locked_by_id` int unsigned not null, `last_seen_at` datetime not null, `created_at` datetime not null, `updated_at` datetime not null) default character set utf8mb4 engine = InnoDB;",
    );
    this.addSql('alter table `article_edit_lock` add unique `article_edit_lock_article_id_unique`(`article_id`);');
    this.addSql('alter table `article_edit_lock` add index `article_edit_lock_locked_by_id_index`(`locked_by_id`);');

    this.addSql(
      'alter table `article_edit_lock` add constraint `article_edit_lock_article_id_foreign` foreign key (`article_id`) references `article` (`id`) on update cascade on delete cascade;',
    );
    this.addSql(
      'alter table `article_edit_lock` add constraint `article_edit_lock_locked_by_id_foreign` foreign key (`locked_by_id`) references `user` (`id`) on update cascade on delete cascade;',
    );
  }
}
