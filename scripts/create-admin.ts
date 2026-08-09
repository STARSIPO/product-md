/**
 * Creates or updates a platform administrator.
 *
 *   npm run admin:create -- reg@product.md "some-password" "Имя Фамилия"
 *
 * The password is a command-line argument on purpose: it must never live in the
 * repository. The seed's demo accounts use a password that is published in the README
 * precisely because they are throwaway; a real administrator's is not.
 *
 * Idempotent — running it again on an existing email updates the password and promotes
 * the account rather than failing on the unique constraint. It acts on whatever
 * DATABASE_URL is currently configured, so it works against the local SQLite file and
 * against production alike.
 *
 * Run under scripts/tsconfig.json (see package.json) so the `server-only` guard in the
 * password module resolves to a no-op outside Next.
 */
import { PrismaClient } from '@prisma/client'
import { hashPassword } from '../src/server/auth/password'

const RED = '[31m'
const YELLOW = '[33m'
const GREEN = '[32m'
const DIM = '[2m'
const RESET = '[0m'

async function main(): Promise<void> {
  const [email, password, name] = process.argv.slice(2)

  if (!email || !password) {
    console.error(
      `${RED}Usage:${RESET} npm run admin:create -- <email> <password> [name]\n\n` +
        `Example:\n  npm run admin:create -- reg@product.md "S0me-Strong-Pass" "Администратор"\n`,
    )
    process.exit(1)
  }

  const normalizedEmail = email.trim().toLowerCase()
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
    console.error(`${RED}Not a valid email:${RESET} ${email}`)
    process.exit(1)
  }

  // Warn, do not block: this is the owner's own account on their own deployment, and
  // refusing outright would just push them to edit rows by hand.
  const weaknesses: string[] = []
  if (password.length < 8) weaknesses.push(`длина ${password.length} символов (рекомендуется 12+)`)
  if (!/\d/.test(password)) weaknesses.push('нет цифр')
  if (!/[^\p{L}\p{N}]/u.test(password)) weaknesses.push('нет спецсимволов')

  const db = new PrismaClient()

  try {
    const passwordHash = await hashPassword(password)
    const existing = await db.user.findUnique({
      where: { email: normalizedEmail },
      select: { id: true, role: true, totpEnabledAt: true },
    })

    const user = await db.user.upsert({
      where: { email: normalizedEmail },
      create: {
        email: normalizedEmail,
        name: name?.trim() || 'Администратор',
        passwordHash,
        role: 'ADMIN',
        status: 'ACTIVE',
        locale: 'ru',
        // Set so the account can sign in immediately without an inbox round trip.
        emailVerifiedAt: new Date(),
        acceptedTermsAt: new Date(),
        onboardedAt: new Date(),
      },
      update: {
        passwordHash,
        role: 'ADMIN',
        status: 'ACTIVE',
        emailVerifiedAt: new Date(),
        ...(name?.trim() ? { name: name.trim() } : {}),
      },
      select: { id: true, email: true, name: true, role: true, totpEnabledAt: true },
    })

    console.info(
      `\n${GREEN}${existing ? 'Обновлён' : 'Создан'} администратор${RESET}\n` +
        `  email  ${user.email}\n` +
        `  имя    ${user.name}\n` +
        `  роль   ${user.role}\n` +
        `  2FA    ${user.totpEnabledAt ? 'включена' : 'не настроена'}\n`,
    )

    if (weaknesses.length > 0) {
      console.warn(
        `${YELLOW}Пароль слабый:${RESET} ${weaknesses.join(', ')}.\n` +
          `${DIM}Учётная запись даёт право менять роли, править балансы и отключать биллинг.\n` +
          `Смените пароль в кабинете или перезапустите этот скрипт с более длинным.${RESET}\n`,
      )
    }

    if (!user.totpEnabledAt) {
      console.info(
        `${DIM}Админ-панель требует двухфакторную авторизацию. При первом заходе на /ru/admin\n` +
          `откроется её настройка. Если нужен доступ без 2FA — выключите флаг\n` +
          `REQUIRE_ADMIN_2FA в разделе «Feature flags».${RESET}\n`,
      )
    }
  } finally {
    await db.$disconnect()
  }
}

main().catch((error: unknown) => {
  console.error(`${RED}[admin:create] failed${RESET}`, error)
  process.exit(1)
})
