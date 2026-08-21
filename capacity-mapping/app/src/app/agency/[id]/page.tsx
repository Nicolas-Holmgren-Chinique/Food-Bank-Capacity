import { notFound } from "next/navigation";
import { getAgency } from "@/lib/data";
import { AgencyView } from "./AgencyView";

export default async function AgencyPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  if (!getAgency(id)) notFound();
  return <AgencyView agencyId={id} />;
}
