/*
  Warnings:

  -- Removed: You are about to drop the column `fecha_nacimiento` on the `User` table. All the data in the column will be lost.

*/
-- AlterTable
-- Removed: ALTER TABLE "User" DROP COLUMN "fecha_nacimiento",
ADD COLUMN     "fechaNacimiento" TIMESTAMP(3);
