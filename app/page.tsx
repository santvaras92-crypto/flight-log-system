import FlightUploadForm from "./components/FlightUploadForm";
import { prisma } from "../lib/prisma";

export default async function Home() {
  const pilots = await prisma.user.findMany({
    where: { rol: "PILOTO" },
    orderBy: { nombre: "asc" },
    select: { id: true, nombre: true, email: true },
  });

  return <FlightUploadForm pilots={pilots} />;
}
