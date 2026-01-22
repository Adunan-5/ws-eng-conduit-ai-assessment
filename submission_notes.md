# AI Augmented Design and Implementation

## User Story
As a user, I want to add co-authors to my articles so that multiple people can edit them together.

Implemented ADVANCED requirements:
- Co-authors are selected via multi-select from all users
- Co-authors can edit the article
- Advanced edit locking with heartbeat + timeout
- Locked article blocks other co-authors from editing/saving

## Acceptance Criteria

### Test 1
Create article as Zolly user and add John as co-author → saved successfully.
Screenshot: test1-create-article-add-coauthor.png

### Test 2
Login as John and edit the shared article → able to modify.
Screenshot: test2-john-can-edit.png

### Test 3 (ADVANCED)
While John is editing (holds lock), Zolly (incognito) tries editing and receives lock error.
Screenshot: test3-lock-blocks-coauthor.png

## Plan
1) Add backend DB support for co-authors (pivot table)
2) Add backend DB edit-lock entity and endpoints
3) Enforce lock on update endpoint
4) Update frontend editor:
   - co-author dropdown
   - allow co-author to edit
   - acquire/heartbeat/release locks

## Prompts Used
Prompt 1: Backend co-authors support (ManyToMany + migration)
Prompt 2: Backend edit-lock advanced (entity + migration + endpoints + enforcement)
Prompt 3: Frontend co-author multi-select + editing permissions
Prompt 4: Frontend lock acquire/heartbeat/release + lock error handling

## Implementation Notes
Backend changes:
- Article entity: ManyToMany coAuthors
- New pivot migration: article_coauthors
- New lock entity: ArticleEditLock
- Lock migration: article_edit_lock
- Lock endpoints:
  - POST /api/articles/:slug/lock
  - PUT /api/articles/:slug/lock/heartbeat
  - DELETE /api/articles/:slug/lock
- Enforced lock on PUT /api/articles/:slug

Frontend changes:
- Added Co-Authors multi-select dropdown in ArticleEditor (loads all users)
- Co-authors can see Edit button + open editor
- Lock acquire on editor open
- Heartbeat every 60 seconds
- Release lock on save or navigation away
- Show alert + redirect when locked by another editor

## Tests
Manually tested in 2 browsers (normal + incognito):
- Create with co-author works
- Co-author edits successfully
- Lock blocks concurrent editing (ADVANCED)

## Submission ID
submissions/design-and-implement/2026-01-22/MohamedAdunan-a0Bfv000007aLQ5EAM-1769070040684-1769086342537.zip
