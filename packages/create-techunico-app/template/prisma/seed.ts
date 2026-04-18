import { PrismaClient } from "../src/generated/prisma";
import pg from "pg";
import { PrismaPg } from "@prisma/adapter-pg";

// Create an INSTANCE — PrismaClient is the class, prisma is the object you use
const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
});

const adapter = new PrismaPg(pool);

const prisma = new PrismaClient({ adapter });

async function main() {
  await prisma.user.create({
    // ← use the instance, not the class
    data: {
      name: "Praveen",
      email: "praveen@techunico.com",
      password: "some_hashed_password", // ← required field in your schema
    },
  });

  await prisma.permission.createMany({
    data: [
      { name: "user.read" },
      { name: "user.create" },
      { name: "user.update" },
      { name: "user.delete" },
    ],
  });

  const permissions = await prisma.permission.findMany();

  await prisma.role.create({
    data: {
      name: "admin",
      permissions: {
        connect: permissions.map((p) => ({ id: p.id })),
      },
    },
  });

  await prisma.role.create({
    data: {
      name: "user",
    },
  });
}

main()
  .then(() => prisma.$disconnect()) // ← instance method
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
  });
