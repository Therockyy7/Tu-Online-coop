// Lưu hồ sơ trong MongoDB (collection `profiles`). Gói mongodb chỉ được nạp khi thật sự dùng.
import type { Profile } from '@shared/index';
import { normalizeProfile, type ProfileStore } from './ProfileStore';

export async function createMongoProfileStore(uri: string, dbName: string): Promise<ProfileStore> {
  const { MongoClient } = await import('mongodb');
  const client = new MongoClient(uri, { serverSelectionTimeoutMS: 15_000 });
  await client.connect();
  const col = client.db(dbName).collection<Profile>('profiles');
  await col.createIndex({ key: 1 }, { unique: true });
  return {
    kind: 'mongo',
    async load(key) {
      const doc = await col.findOne({ key }, { projection: { _id: 0 } });
      return doc ? normalizeProfile(doc, key) : null;
    },
    async save(profile) {
      await col.replaceOne({ key: profile.key }, { ...profile }, { upsert: true });
    },
    async close() {
      await client.close();
    },
  };
}
