# Implementation Plan

## Plan

- Review existing article create/edit flow in the frontend:
  - Identify create/edit pages and existing API calls.
  - Identify how current author permissions are enforced.
- Extend backend data model to support article co-authors:
  - Add a many-to-many relation between `Article` and `User` for co-authors.
  - Create a migration to add join table (e.g. `article_coauthors`).
- Extend backend API contracts:
  - Update Create Article endpoint to accept co-authors (array of user IDs).
  - Update Update Article endpoint to allow editing if logged-in user is:
    - original author OR
    - included in co-authors.
  - Ensure Get Article returns co-authors for edit UI.
- Implement edit locking pattern (advanced requirement):
  - Add a new entity/table `ArticleEditLock` with:
    - articleId (unique)
    - lockedByUserId
    - lockedAt
    - lastSeenAt
  - When edit page loads: attempt to acquire lock.
  - Keep lock alive with a heartbeat request (e.g. every 30s) while page remains open.
  - Release lock on:
    - save
    - navigation away/unmount
    - timeout (5 minutes inactivity based on lastSeenAt)
  - If another co-author tries to edit while locked:
    - backend returns 409 Conflict
    - frontend shows clear error message.
  - If lock is lost while editing (timeout / connection loss):
    - on save attempt backend rejects and frontend shows error.
- Frontend changes:
  - Create Article: add a “Co-Authors” multi-select dropdown listing all users.
  - Edit Article: show same field and prefill selected co-authors.
  - Implement edit lock lifecycle in edit page:
    - acquire lock on mount
    - heartbeat interval
    - release lock on unmount + on successful save
    - show lock errors in UI.
- Manual acceptance testing:
  - Test 1: Zolly creates article with John as co-author (screenshot).
  - Test 2: John edits article successfully (screenshot).
  - Test 3: Zolly incognito tries editing while John editing → lock error (screenshot).
- Place screenshots directly inside `/submission`.
- Submit using `npm run submit a0Bfv000007aLQ5EAM`.

## Decisions

1) Decision: Model co-authors as an `Article` ↔ `User` many-to-many relationship
   - Alternative: store co-author emails in a string / JSON column in `article`.
   - Alternative: separate co-author table wi
