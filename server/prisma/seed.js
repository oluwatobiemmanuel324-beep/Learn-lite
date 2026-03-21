const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();
const SOCIAL_MEDIA_PLACEHOLDER_EMAIL = process.env.SOCIAL_MEDIA_CONTROLLER_EMAIL || 'socialmedia.controller@learnlite.app';

// Secure temporary passwords (override via env in production)
const TEMP_PASSWORDS = {
  SYSTEM_OWNER: process.env.SEED_SYSTEM_OWNER_PASSWORD || 'LL-SystemOwner#2026!',
  FINANCE_CONTROLLER: process.env.SEED_FINANCE_CONTROLLER_PASSWORD || 'LL-FinanceCtrl#2026!',
  ACADEMIC_REGISTRAR: process.env.SEED_ACADEMIC_REGISTRAR_PASSWORD || 'LL-AcademicReg#2026!',
  OPS_MODERATOR: process.env.SEED_OPS_MODERATOR_PASSWORD || 'LL-OpsModerator#2026!',
  SOCIAL_MEDIA_CONTROLLER: process.env.SEED_SOCIAL_MEDIA_CONTROLLER_PASSWORD || 'LL-SocialMedia#2026!'
};

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

async function main() {
  console.log('\n🌱 Seeding managed admin accounts...\n');
  
  for (const account of MANAGED_ACCOUNTS) {
    const hashedPassword = await bcrypt.hash(TEMP_PASSWORDS[account.role], 10);
    const tempPassword = TEMP_PASSWORDS[account.role];

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
          idNumber: account.idNumber,
          password: hashedPassword
        }
      });
    }

    console.log(`✓ ${account.role}`);
    console.log(`  Email:    ${account.email}`);
    console.log(`  Username: ${account.username}`);
    console.log(`  Password: ${tempPassword}\n`);
  }

  console.log('✅ Managed staff accounts seeded successfully.\n');
}

main()
  .catch((error) => {
    console.error('Seed failed:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
