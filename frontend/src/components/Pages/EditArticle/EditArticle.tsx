import React, { Fragment, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { getArticle, updateArticle, acquireArticleLock, heartbeatArticleLock, releaseArticleLock } from '../../../services/conduit';
import { store } from '../../../state/store';
import { useStore } from '../../../state/storeHooks';
import { ArticleEditor } from '../../ArticleEditor/ArticleEditor';
import { initializeEditor, loadArticle, startSubmitting, updateErrors } from '../../ArticleEditor/ArticleEditor.slice';

export function EditArticle() {
  const { slug } = useParams<{ slug: string }>();
  const { loading } = useStore(({ editor }) => editor);

  useEffect(() => {
    let heartbeatId: number | undefined;

    (async () => {
      const loaded = await _loadArticle(slug!);
      if (!loaded) return;

      try {
        await acquireArticleLock(slug!);
      } catch (e) {
        alert('This article is currently locked by another editor. Try again later.');
        location.hash = `#/article/${slug}`;
        return;
      }

      heartbeatId = window.setInterval(() => {
        heartbeatArticleLock(slug!).catch(() => {
          // ignore transient heartbeat errors
        });
      }, 60000);
    })();

    return () => {
      if (heartbeatId) clearInterval(heartbeatId);
      releaseArticleLock(slug!).catch(() => {});
    };
  }, [slug]);

  return <Fragment>{!loading && <ArticleEditor onSubmit={onSubmit(slug!)} />}</Fragment>;
}

async function _loadArticle(slug: string): Promise<boolean> {
  store.dispatch(initializeEditor());
  try {
    const article = await getArticle(slug);
    const { title, description, body, tagList, author, coAuthors } = article;

    const currentUsername = store.getState().app.user?.username;
    const isAuthor = author.username === currentUsername;
    const isCoAuthor = (coAuthors || []).some((p) => p.username === currentUsername);
    if (!isAuthor && !isCoAuthor) {
      location.hash = '#/';
      return false;
    }

    store.dispatch(
      loadArticle({
        title,
        description,
        body,
        tagList,
        coAuthors: (coAuthors || []).map((p) => p.username),
      })
    );
    return true;
  } catch {
    location.hash = '#/';
    return false;
  }
}

function onSubmit(slug: string): (ev: React.FormEvent) => void {
  return async (ev) => {
    ev.preventDefault();

    store.dispatch(startSubmitting());
    const result = await updateArticle(slug, store.getState().editor.article);

    result.match({
      err: (errors) => store.dispatch(updateErrors(errors)),
      ok: ({ slug }) => {
        // release without awaiting to keep return type consistent
        releaseArticleLock(slug).catch(() => {});
        location.hash = `#/article/${slug}`;
      },
    });
  };
}
