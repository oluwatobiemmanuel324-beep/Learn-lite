const databaseUrl = process.env.DATABASE_URL

if (!databaseUrl) {
  throw new Error('DATABASE_URL is required for Prisma datasource configuration')
}

export const datasources = {
  db: {
    url: databaseUrl,
  },
}
