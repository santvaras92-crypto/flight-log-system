-- AlterTable
ALTER TABLE "Deposit" ADD COLUMN     "estado" TEXT NOT NULL DEFAULT 'PENDIENTE';

-- AlterTable
ALTER TABLE "Flight" ADD COLUMN     "aerodromoDestino" TEXT,
ADD COLUMN     "aerodromoSalida" TEXT;

-- AlterTable
ALTER TABLE "FlightSubmission" ADD COLUMN     "aerodromoDestino" TEXT,
ADD COLUMN     "aerodromoSalida" TEXT;

-- AlterTable
ALTER TABLE "FuelLog" ADD COLUMN     "estado" TEXT NOT NULL DEFAULT 'PENDIENTE';

-- AlterTable
ALTER TABLE "User" ALTER COLUMN "email" DROP NOT NULL;
