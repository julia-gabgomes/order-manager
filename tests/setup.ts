import { beforeEach, afterAll } from "vitest";
import { prisma } from "../src/lib/prisma";

beforeEach(async () => {
  await prisma.webhookEvent.deleteMany();
  await prisma.ingresso.deleteMany();
  await prisma.itemPedido.deleteMany();
  await prisma.pedido.deleteMany();
});

afterAll(async () => {
  await prisma.$disconnect();
});
