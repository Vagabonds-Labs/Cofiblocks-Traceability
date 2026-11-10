import "dotenv/config";
import { defineConfig } from "prisma/config";

// Las migraciones necesitan una conexión directa (puerto 5432), no la del
// pooler: se usa DIRECT_URL y, si falta, DATABASE_URL.
//
// Se lee `process.env` y no `env()` de Prisma porque `env()` lanza un error si
// la variable falta, y eso rompía `prisma generate` en el build de Docker,
// donde no hay base (y hacía que el respaldo con DATABASE_URL nunca se usara).
// Sin ninguna de las dos, Prisma usa el bloque `datasource` del schema.
const url = process.env.DIRECT_URL || process.env.DATABASE_URL;

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  ...(url ? { engine: "classic" as const, datasource: { url } } : {}),
});
