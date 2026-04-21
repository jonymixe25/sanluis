# Security Specification - Vida Mixe TV

## Data Invariants
1. **Public Readability**: News, Community Videos, and Team data must be globally readable to allow the audience to consume content without logging in.
2. **Admin-Only Writes**: Only authenticated users whose UID exists in the `/admins/` collection can create, update, or delete News, Community Videos, and Team members.
3. **Identity Integrity**: User profiles must be owned by the authenticated user. A user cannot modify another user's profile.
4. **Terminal States**: (Not applicable to current models, but good for future scalability).
5. **ID Poisoning Guard**: ALL document IDs must match `^[a-zA-Z0-9_\-]+$` and be within size limits.

## The "Dirty Dozen" Payloads (Attack Vectors)

1. **Spoof Admin Write**: An unauthenticated user attempts to POST to `/news/`.
2. **Privilege Escalation**: An authenticated (non-admin) user attempts to write to `/admins/self`.
3. **Shadow Field Injection**: An admin attempts to create a news item with a ghost field `is_featured: true` not in schema.
4. **ID Poisoning**: A user attempts to create a profile with a 1.5MB string as the document ID.
5. **Foreign ownership**: User A attempts to update User B's profile.
6. **Type Poisoning**: Sending a `list` where a `string` (author) is expected in news.
7. **Resource Exhaustion**: Sending a 1MB string in the `title` of a news post.
8. **Orphaned News**: Creating a news item with an invalid date format.
9. **Timestamp Spoofing**: Sending a custom `date` in news instead of server time (integrated in rules).
10. **Malicious Link**: Injecting script tags into `video_url` in community videos (size and regex guards).
11. **Admin Impersonation**: Attempting to read `/users/{adminId}` private data while not authorized.
12. **Mass Deletion**: An authenticated user attempting to delete all `/news/{id}` documents.

## The Test Runner (firestore.rules.test.ts)

```typescript
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import { doc, setDoc, getDoc, deleteDoc } from "firebase/firestore";

let testEnv: RulesTestEnvironment;

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: "vidamixe-dev",
    firestore: {
      rules: await fs.readFile("firestore.rules", "utf8"),
    },
  });
});

test("unauthenticated user cannot write news", async () => {
  const unauthDb = testEnv.unauthenticatedContext().firestore();
  await assertFails(setDoc(doc(unauthDb, "news", "news1"), { title: "Hacked" }));
});

test("authenticated non-admin cannot write news", async () => {
  const userDb = testEnv.authenticatedContext("user123").firestore();
  await assertFails(setDoc(doc(userDb, "news", "news1"), { title: "Unauthorized" }));
});

test("admin can write news with valid schema", async () => {
  // Setup admin record first
  await testEnv.withSecurityRulesDisabled(async (context) => {
    await setDoc(doc(context.firestore(), "admins", "admin123"), { is_active: true });
  });
  
  const adminDb = testEnv.authenticatedContext("admin123").firestore();
  await assertSucceeds(setDoc(doc(adminDb, "news", "news1"), {
    title: "Cultura Ayuuk",
    content: "Texto largo...",
    author: "Admin",
    date: new Date().toISOString(),
    imageUrl: "https://example.com/img.jpg"
  }));
});
```
