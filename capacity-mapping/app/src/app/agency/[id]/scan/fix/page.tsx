import { notFound } from "next/navigation";
import { getAgency } from "@/lib/data";
import { FixEditor } from "./FixEditor";

export default async function FixPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  if (!getAgency(id)) notFound();
  return <FixEditor agencyId={id} />;
}
