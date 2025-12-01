/*
  Warnings:

  - You are about to drop the column `pilotoNombre` on the `Flight` table. All the data in the column will be lost.
  - Made the column `fecha` on table `Flight` required. This step will fail if there are existing NULL values in that column.

*/
-- AlterTable
ALTER TABLE "Flight" DROP COLUMN "pilotoNombre",
ADD COLUMN     "instructor_rate" DECIMAL(65,30),
ADD COLUMN     "piloto_raw" TEXT,
ADD COLUMN     "tarifa" DECIMAL(65,30),
ALTER COLUMN "fecha" SET NOT NULL;

-- AlterTable
ALTER TABLE "FlightSubmission" ADD COLUMN     "cliente" TEXT,
ADD COLUMN     "copiloto" TEXT,
ADD COLUMN     "detalle" TEXT,
ADD COLUMN     "fechaVuelo" TIMESTAMP(3),
ADD COLUMN     "hobbsFinal" DECIMAL(65,30),
ADD COLUMN     "instructorRate" DECIMAL(65,30),
ADD COLUMN     "notificado" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "rate" DECIMAL(65,30),
ADD COLUMN     "tachFinal" DECIMAL(65,30);

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "documento" TEXT,
ADD COLUMN     "tipoDocumento" TEXT;

-- CreateTable
CREATE TABLE "Deposit" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "description" TEXT,
    "reference" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Deposit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FuelCharge" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "liters" DOUBLE PRECISION NOT NULL,
    "pricePerLiter" DOUBLE PRECISION NOT NULL,
    "totalAmount" DOUBLE PRECISION NOT NULL,
    "date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "location" TEXT,
    "reference" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FuelCharge_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SheetState" (
    "id" SERIAL NOT NULL,
    "key" TEXT NOT NULL,
    "matrix" JSONB NOT NULL,
    "formulas" JSONB,
    "namedExpressions" JSONB,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedBy" INTEGER,

    CONSTRAINT "SheetState_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Deposit_userId_idx" ON "Deposit"("userId");

-- CreateIndex
CREATE INDEX "Deposit_date_idx" ON "Deposit"("date");

-- CreateIndex
CREATE INDEX "FuelCharge_userId_idx" ON "FuelCharge"("userId");

-- CreateIndex
CREATE INDEX "FuelCharge_date_idx" ON "FuelCharge"("date");

-- CreateIndex
CREATE UNIQUE INDEX "SheetState_key_key" ON "SheetState"("key");

-- AddForeignKey
ALTER TABLE "Deposit" ADD CONSTRAINT "Deposit_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FuelCharge" ADD CONSTRAINT "FuelCharge_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
