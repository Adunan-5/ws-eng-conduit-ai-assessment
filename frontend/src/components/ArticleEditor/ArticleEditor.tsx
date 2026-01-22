import React, { useEffect, useState } from 'react';
import { store } from '../../state/store';
import { useStore } from '../../state/storeHooks';
import { buildGenericFormField } from '../../types/genericFormField';
import { ContainerPage } from '../ContainerPage/ContainerPage';
import { GenericForm } from '../GenericForm/GenericForm';
import { addTag, EditorState, removeTag, updateField, setCoAuthors } from './ArticleEditor.slice';
import { getUsers } from '../../services/conduit';

export function ArticleEditor({ onSubmit }: { onSubmit: (ev: React.FormEvent) => void }) {
  const { article, submitting, tag, errors } = useStore(({ editor }) => editor);
  const [allUsers, setAllUsers] = useState<{ username: string }[]>([]);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const users = await getUsers();
        if (mounted) setAllUsers(users);
      } catch {
        // ignore load errors for minimal UI
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  const onChangeCoAuthors = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const values = Array.from(e.target.selectedOptions).map((o) => o.value);
    store.dispatch(setCoAuthors(values));
  };

  return (
    <div className='editor-page'>
      <ContainerPage>
        <div className='col-md-10 offset-md-1 col-xs-12'>
          {/* Co-Authors multi-select (outside GenericForm to avoid changing shared form component) */}
          <fieldset>
            <div className='form-group'>
              <label>Co-Authors</label>
              <select
                multiple
                className='form-control'
                value={article.coAuthors || []}
                onChange={onChangeCoAuthors}
                disabled={submitting}
              >
                {allUsers.map((u) => (
                  <option key={u.username} value={u.username}>
                    {u.username}
                  </option>
                ))}
              </select>
            </div>
          </fieldset>

          <GenericForm
            formObject={{ ...article, tag } as unknown as Record<string, string | null>}
            disabled={submitting}
            errors={errors}
            onChange={onUpdateField}
            onSubmit={onSubmit}
            submitButtonText='Publish Article'
            onAddItemToList={onAddTag}
            onRemoveListItem={onRemoveTag}
            fields={[
              buildGenericFormField({ name: 'title', placeholder: 'Article Title' }),
              buildGenericFormField({ name: 'description', placeholder: "What's this article about?", lg: false }),
              buildGenericFormField({
                name: 'body',
                placeholder: 'Write your article (in markdown)',
                fieldType: 'textarea',
                rows: 8,
                lg: false,
              }),
              buildGenericFormField({
                name: 'tag',
                placeholder: 'Enter the tag name and press enter',
                listName: 'tagList',
                fieldType: 'list',
                lg: false,
              }),
            ]}
          />
        </div>
      </ContainerPage>
    </div>
  );
}

function onUpdateField(name: string, value: string) {
  store.dispatch(updateField({ name: name as keyof EditorState['article'], value }));
}

function onAddTag() {
  store.dispatch(addTag());
}

function onRemoveTag(_: string, index: number) {
  store.dispatch(removeTag(index));
}
