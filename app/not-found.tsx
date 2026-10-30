import Link from "next/link";

export default function NotFound() {
  return (
    <>
      <h1 className="text-3xl font-semibold tracking-tight">Page not found.</h1>
      <p className="mt-3 text-muted">
        <Link href="/" className="link link-primary">
          Share a new secret
        </Link>
      </p>
    </>
  );
}
