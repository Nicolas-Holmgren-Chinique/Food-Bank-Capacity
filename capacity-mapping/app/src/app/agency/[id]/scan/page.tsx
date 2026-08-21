import { notFound } from "next/navigation";
import { getAgency } from "@/lib/data";
import { ScanUploader } from "./ScanUploader";

/**
 * The intake path. Photos today, live camera hunting later.
 *
 * Both sources land in the same scan session, so everything downstream of
 * here (complete, fix, the reveal) never learns which one produced it.
 */
export default async function ScanPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  if (!getAgency(id)) notFound();
  return <ScanUploader agencyId={id} />;
}
