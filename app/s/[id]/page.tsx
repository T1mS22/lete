import type { Metadata } from "next";
import RevealSecret from "@/components/RevealSecret";
import { isSecretId } from "@/lib/config";

export const metadata: Metadata = {
  title: "Lete · Someone shared a secret with you",
};

export default async function SecretPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  return (
    <>
      <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
        Someone shared a secret with you.
      </h1>
      <div className="mt-8">
        <RevealSecret id={id} validId={isSecretId(id)} />
      </div>
    </>
  );
}
