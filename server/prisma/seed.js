const { PrismaClient } = require('@prisma/client');
const { seedManagedAdminAccounts } = require('./managed-admins');

const prisma = new PrismaClient();

seedManagedAdminAccounts(prisma, { showPasswords: true, logger: console })
  .catch((error) => {
    console.error('Seed failed:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
