const bcrypt = require('bcryptjs');

const SOCIAL_MEDIA_PLACEHOLDER_EMAIL = process.env.SOCIAL_MEDIA_CONTROLLER_EMAIL || 'socialmedia.controller@learnlite.app';

const MANAGED_ACCOUNTS = [
  {
    email: 'oluwatobiemmanuel324@gmail.com',
    username: 'system_owner',
    role: 'SYSTEM_OWNER',
    idNumber: 900001
  },
  {
    email: 'financialcontrollerlearnlite@gmail.com',
    username: 'finance_controller',
    role: 'FINANCE_CONTROLLER',
    idNumber: 900002
  },
  {
    email: 'academicregistrarlearnlite@gmail.com',
    username: 'academic_registrar',
    role: 'ACADEMIC_REGISTRAR',
    idNumber: 900003
  },
  {
    email: 'operationmoderatorlearnlite@gmail.com',
    username: 'ops_moderator',
    role: 'OPS_MODERATOR',
    idNumber: 900004
  },
  {
    email: SOCIAL_MEDIA_PLACEHOLDER_EMAIL,
    username: 'social_media_controller',
    role: 'SOCIAL_MEDIA_CONTROLLER',
    idNumber: 900005
  }
];

const MANAGED_PASSWORDS = {
  SYSTEM_OWNER: process.env.SEED_SYSTEM_OWNER_PASSWORD || 'LL-SystemOwner#2026!',
  FINANCE_CONTROLLER: process.env.SEED_FINANCE_CONTROLLER_PASSWORD || 'LL-FinanceCtrl#2026!',
  ACADEMIC_REGISTRAR: process.env.SEED_ACADEMIC_REGISTRAR_PASSWORD || 'LL-AcademicReg#2026!',
  OPS_MODERATOR: process.env.SEED_OPS_MODERATOR_PASSWORD || 'LL-OpsModerator#2026!',
  SOCIAL_MEDIA_CONTROLLER: process.env.SEED_SOCIAL_MEDIA_CONTROLLER_PASSWORD || 'LL-SocialMedia#2026!'
};

async function seedManagedAdminAccounts(prisma, options = {}) {
  const logger = options.logger || console;
  const showPasswords = Boolean(options.showPasswords);
  const results = [];

  logger.log('\n🌱 Seeding managed admin accounts...\n');

  for (const account of MANAGED_ACCOUNTS) {
    const password = MANAGED_PASSWORDS[account.role];
    const hashedPassword = await bcrypt.hash(password, 10);
    const existing = await prisma.user.findFirst({
      where: {
        OR: [
          { email: account.email },
          { username: account.username },
          { idNumber: account.idNumber }
        ]
      },
      select: { id: true }
    });

    if (existing) {
      await prisma.user.update({
        where: { id: existing.id },
        data: {
          email: account.email,
          username: account.username,
          idNumber: account.idNumber,
          role: account.role,
          isActive: true,
          isSuspended: false,
          password: hashedPassword
        }
      });
    } else {
      await prisma.user.create({
        data: {
          email: account.email,
          username: account.username,
          role: account.role,
          isActive: true,
          isSuspended: false,
          idNumber: account.idNumber,
          password: hashedPassword
        }
      });
    }

    results.push({ ...account, password });
    logger.log(`✓ ${account.role}`);
    logger.log(`  Email:    ${account.email}`);
    logger.log(`  Username: ${account.username}`);
    if (showPasswords) {
      logger.log(`  Password: ${password}`);
    }
    logger.log('');
  }

  logger.log('✅ Managed staff accounts seeded successfully.\n');

  return results;
}

module.exports = {
  MANAGED_ACCOUNTS,
  MANAGED_PASSWORDS,
  seedManagedAdminAccounts
};