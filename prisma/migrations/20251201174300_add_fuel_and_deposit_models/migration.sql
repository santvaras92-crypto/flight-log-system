/*
  Warnings:

  - You are about to drop the column `amount` on the `Deposit` table. All the data in the column will be lost.
  - You are about to drop the column `date` on the `Deposit` table. All the data in the column will be lost.
  - You are about to drop the column `description` on the `Deposit` table. All the data in the column will be lost.
  - You are about to drop the column `reference` on the `Deposit` table. All the data in the column will be lost.
  - You are about to drop the column `updatedAt` on the `Deposit` table. All the data in the column will be lost.
  - You are about to drop the `FuelCharge` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `SheetState` table. If the table is not empty, all the data it contains will be lost.
  - Added the required column `monto` to the `Deposit` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE "Deposit" DROP CONSTRAINT "Deposit_userId_fkey";

-- DropForeignKey
ALTER TABLE "FuelCharge" DROP CONSTRAINT "FuelCharge_userId_fkey";

-- DropIndex
DROP INDEX "Deposit_date_idx";

-- DropIndex
DROP INDEX "Deposit_userId_idx";

-- AlterTable
ALTER TABLE "Deposit" DROP COLUMN "amount",
DROP COLUMN "date",
DROP COLUMN "description",
DROP COLUMN "reference",
DROP COLUMN "updatedAt",
ADD COLUMN     "detalle" TEXT,
ADD COLUMN     "fecha" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "imageUrl" TEXT,
ADD COLUMN     "monto" DECIMAL(65,30) NOT NULL;

-- DropTable
DROP TABLE "FuelCharge";

-- DropTable
DROP TABLE "SheetState";

-- CreateTable
CREATE TABLE "FuelLog" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "fecha" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "litros" DECIMAL(65,30) NOT NULL,
    "monto" DECIMAL(65,30) NOT NULL,
    "imageUrl" TEXT,
    "detalle" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FuelLog_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "Deposit" ADD CONSTRAINT "Deposit_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FuelLog" ADD CONSTRAINT "FuelLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
