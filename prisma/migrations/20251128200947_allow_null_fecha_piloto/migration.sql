-- DropForeignKey
ALTER TABLE "Flight" DROP CONSTRAINT "Flight_pilotoId_fkey";

-- AlterTable
ALTER TABLE "Flight" ADD COLUMN     "pilotoNombre" TEXT,
ALTER COLUMN "fecha" DROP NOT NULL,
ALTER COLUMN "pilotoId" DROP NOT NULL;

-- AddForeignKey
ALTER TABLE "Flight" ADD CONSTRAINT "Flight_pilotoId_fkey" FOREIGN KEY ("pilotoId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
