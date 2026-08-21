import { notFound } from "next/navigation";
import { getAgency } from "@/lib/data";
import { ScanCompleteView } from "./ScanCompleteView";

export default async function ScanComplete({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  if (!getAgency(id)) notFound();
  return <ScanCompleteView agencyId={id} />;
}
