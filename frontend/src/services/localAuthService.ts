import bcryptjs from 'bcryptjs'
import { upsertLocalAccount, getLocalAccount, updateLocalAccountServerId } from './db'

/** After successful online login — cache credentials locally for offline use */
export async function saveOnlineLoginLocally(
  user: { id: number; username: string; email: string; avatar_url?: string },
  password: string
): Promise<void> {
  const hash = await bcryptjs.hash(password, 10)
  await upsertLocalAccount({
    username: user.username,
    email: user.email,
    password_hash: hash,
    avatar_url: user.avatar_url ?? null,
    local_only: 0,
    server_id: user.id,
  })
}

/** Try to login using local SQLite hash — returns user info on success */
export async function localLogin(
  email: string,
  password: string
): Promise<{ id: number; username: string; email: string; avatar_url?: string } | null> {
  const acct = await getLocalAccount(email)
  if (!acct) return null
  const valid = await bcryptjs.compare(password, acct.password_hash)
  if (!valid) return null
  return {
    id: acct.server_id ?? -(acct.id),
    username: acct.username,
    email: acct.email,
    avatar_url: acct.avatar_url ?? undefined,
  }
}

/** Register a brand-new account locally (no server needed) */
export async function localRegister(
  username: string,
  email: string,
  password: string
): Promise<{ id: number; username: string; email: string }> {
  const existing = await getLocalAccount(email)
  if (existing) throw new Error('该邮箱已注册')
  const hash = await bcryptjs.hash(password, 10)
  await upsertLocalAccount({ username, email, password_hash: hash, local_only: 1 })
  const acct = await getLocalAccount(email)
  return { id: -(acct!.id), username, email }
}

/** Create a pseudo-JWT for local-only session (no cryptographic signature) */
export function buildLocalToken(user: { id: number; email: string }): string {
  const header = btoa(JSON.stringify({ alg: 'none', typ: 'JWT' }))
  const exp = Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 365
  const payload = btoa(JSON.stringify({ sub: user.email, id: user.id, exp }))
  return `${header}.${payload}.local`
}

export { updateLocalAccountServerId }
