import CreateSecret from "@/components/CreateSecret";

export default function Home() {
  return (
    <>
      <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
        Share a secret, once.
      </h1>
      <p className="mt-3 text-muted">
        Paste a password, token or note. You get a link that works exactly one
        time, then the secret is gone for good.
      </p>
      <div className="mt-8">
        <CreateSecret />
      </div>
    </>
  );
}
