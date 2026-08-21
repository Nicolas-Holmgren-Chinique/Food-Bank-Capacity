import { notFound } from "next/navigation";
import { agencies, getAgency } from "@/lib/data";
import { InventoryEditor } from "./InventoryEditor";

export default async function InventoryPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  if (!getAgency(id)) notFound();
  return <InventoryEditor agencyId={id} />;
}

export function generateStaticParams() {
  return agencies.map((a) => ({ id: a.id }));
}
