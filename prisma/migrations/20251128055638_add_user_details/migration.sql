-- AlterTable
ALTER TABLE "Flight" ADD COLUMN     "airframe_hours" DECIMAL(65,30),
ADD COLUMN     "engine_hours" DECIMAL(65,30),
ADD COLUMN     "propeller_hours" DECIMAL(65,30);

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "fecha_nacimiento" TIMESTAMP(3),
ADD COLUMN     "licencia" TEXT,
ADD COLUMN     "telefono" TEXT;
