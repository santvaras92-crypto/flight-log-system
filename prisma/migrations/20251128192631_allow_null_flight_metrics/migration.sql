-- AlterTable
ALTER TABLE "Flight" ADD COLUMN     "airframe_hours" DECIMAL(65,30),
ADD COLUMN     "engine_hours" DECIMAL(65,30),
ADD COLUMN     "propeller_hours" DECIMAL(65,30),
ALTER COLUMN "hobbs_inicio" DROP NOT NULL,
ALTER COLUMN "hobbs_fin" DROP NOT NULL,
ALTER COLUMN "tach_inicio" DROP NOT NULL,
ALTER COLUMN "tach_fin" DROP NOT NULL,
ALTER COLUMN "diff_hobbs" DROP NOT NULL,
ALTER COLUMN "diff_tach" DROP NOT NULL,
ALTER COLUMN "costo" DROP NOT NULL;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "fechaNacimiento" TIMESTAMP(3),
ADD COLUMN     "licencia" TEXT,
ADD COLUMN     "telefono" TEXT;
